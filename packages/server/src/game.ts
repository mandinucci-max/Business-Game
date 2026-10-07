import type { BalanceConfig } from '@business-game/config';
import {
  applyCommandsNow,
  autopilotCommands,
  buildPlayerView,
  type CityState,
  type Command,
  createCityState,
  isCommandType,
  type PlayerView,
  runTick,
  SeasonOverError,
  validateCommandPayload,
} from '@business-game/engine';
import type { CommandOutcome, CommandRecord, Store } from './store';

/** Limite di comandi in attesa per giocatore: frena spam e tentativi di saturare il tick. */
export const MAX_PENDING_PER_PLAYER = 30;

export type SubmitResult =
  | { readonly status: 'queued' | 'duplicate'; readonly commandId: string }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'limit' };

export interface GameView extends PlayerView {
  readonly names: Readonly<Record<string, string>>;
  readonly commands: readonly {
    readonly id: string;
    readonly type: string;
    readonly status: string;
    readonly message: string | null;
  }[];
  readonly seasonOver: boolean;
  readonly nextTickAt: number | null;
}

export interface TickSummary {
  readonly tick: number;
  readonly applied: number;
  readonly rejected: number;
}

/**
 * Servizio di gioco autoritativo: il client manda solo intenzioni, il server le valida, le accoda
 * e le applica al tick successivo. Una sola istanza per città (lock su PostgreSQL).
 */
export class GameService {
  private running: Promise<unknown> = Promise.resolve();
  /** Orario previsto del prossimo tick (lo imposta chi gestisce l'orologio). */
  nextTickAt: () => number | null = () => null;

  private readonly store: Store;
  private readonly config: BalanceConfig;
  readonly cityId: string;
  private current: CityState;
  private readonly log: (message: string, data?: Record<string, unknown>) => void;

  private constructor(
    store: Store,
    config: BalanceConfig,
    cityId: string,
    current: CityState,
    log: (message: string, data?: Record<string, unknown>) => void,
  ) {
    this.store = store;
    this.config = config;
    this.cityId = cityId;
    this.current = current;
    this.log = log;
  }

  static async open(params: {
    store: Store;
    config: BalanceConfig;
    cityId: string;
    seed: string;
    log?: (message: string, data?: Record<string, unknown>) => void;
  }): Promise<GameService> {
    let state = await params.store.loadWorld(params.cityId);
    if (state === null) {
      state = createCityState({ cityId: params.cityId, seed: params.seed, config: params.config });
      await params.store.saveWorld(params.cityId, state);
    }
    return new GameService(
      params.store,
      params.config,
      params.cityId,
      state,
      params.log ?? (() => {}),
    );
  }

  get state(): CityState {
    return this.current;
  }

  get seasonOver(): boolean {
    const time = this.config.global.time;
    return this.current.tick >= time.ticksPerMonth * time.monthsPerSeason;
  }

  hasJoined(playerId: string): boolean {
    return Object.hasOwn(this.current.players, playerId);
  }

  /**
   * Accoda l'intenzione di un giocatore. Il playerId arriva SEMPRE dalla sessione, mai dal client;
   * l'id del client viene prefissato col playerId, così nessuno può collidere con i comandi altrui.
   */
  async submit(
    playerId: string,
    clientId: string,
    type: string,
    payload: unknown,
  ): Promise<SubmitResult> {
    if (!isCommandType(type)) return { status: 'invalid', message: 'unknown_type' };
    if (type === 'player.join') return { status: 'invalid', message: 'use_join' };
    const check = validateCommandPayload(type, payload);
    if (!check.ok) return { status: 'invalid', message: check.message };
    if (this.seasonOver) return { status: 'invalid', message: 'season_over' };
    if ((await this.store.countPending(this.cityId, playerId)) >= MAX_PENDING_PER_PLAYER) {
      return { status: 'limit' };
    }
    const commandId = `${playerId}:${clientId}`;
    const queued = await this.store.enqueueCommand(this.cityId, {
      id: commandId,
      playerId,
      type,
      payload,
    });
    return { status: queued ? 'queued' : 'duplicate', commandId };
  }

  /**
   * Ingresso in città: si applica subito (senza far avanzare il tempo), così il nuovo giocatore
   * vede la sua partita senza attendere il tick. Passa per la stessa fila dei tick.
   */
  join(playerId: string, payload: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
    const next = this.running.then(async () => {
      if (this.seasonOver) return { ok: false as const, message: 'season_over' };
      if (this.hasJoined(playerId)) return { ok: false as const, message: 'already_joined' };
      const check = validateCommandPayload('player.join', payload);
      if (!check.ok) return check;
      const command: Command = {
        id: `${playerId}:join`,
        playerId,
        type: 'player.join',
        payload,
      };
      const result = applyCommandsNow(this.current, [command], this.config);
      const rejection = result.report.rejectedCommands[0];
      if (rejection !== undefined) return { ok: false as const, message: rejection.message };
      await this.store.saveWorld(this.cityId, result.state);
      this.current = result.state;
      return { ok: true as const };
    });
    this.running = next.catch(() => undefined);
    return next;
  }

  async view(playerId: string): Promise<GameView | null> {
    const view = buildPlayerView(this.current, this.config, playerId);
    if (view === null) return null;
    const ids = new Set([playerId, ...view.ranking.top.map((r) => r.playerId)]);
    for (const offer of view.offers.loans) ids.add(offer.lenderId);
    const names = await this.store.usernames([...ids]);
    const recent = await this.store.recentCommands(this.cityId, playerId, 20);
    return {
      ...view,
      names: Object.fromEntries(names),
      commands: recent.map(publicRecord),
      seasonOver: this.seasonOver,
      nextTickAt: this.seasonOver ? null : this.nextTickAt(),
    };
  }

  /** Esegue un tick. Le chiamate concorrenti vengono messe in fila, mai sovrapposte. */
  tick(): Promise<TickSummary | null> {
    const next = this.running.then(() => this.runOneTick());
    this.running = next.catch(() => undefined);
    return next;
  }

  private async runOneTick(): Promise<TickSummary | null> {
    if (this.seasonOver) return null;
    const queued = await this.store.pendingCommands(this.cityId);
    // I comandi dei giocatori precedono quelli del pilota automatico, che li rispetta.
    const autopilot = autopilotCommands(this.current, this.config, queued);
    const commands: Command[] = [...queued, ...autopilot];
    let state: CityState;
    let rejected: Map<string, string>;
    try {
      const result = runTick(this.current, commands, this.config, { recordTransactions: false });
      state = result.state;
      rejected = new Map(result.report.rejectedCommands.map((r) => [r.commandId, r.message]));
    } catch (error) {
      if (error instanceof SeasonOverError) return null;
      // Un errore interno (es. invarianti violate) non deve bloccare la città: si riprova il
      // tick senza comandi e si rifiutano quelli in coda, registrando l'accaduto.
      this.log('tick fallito con i comandi in coda, ripeto senza comandi', {
        error: error instanceof Error ? error.message : String(error),
        tick: this.current.tick,
      });
      state = runTick(this.current, [], this.config, { recordTransactions: false }).state;
      rejected = new Map(queued.map((c) => [c.id, 'server_error']));
    }
    const outcomes: CommandOutcome[] = queued.map((c) => {
      const message = rejected.get(c.id);
      return message === undefined
        ? { commandId: c.id, status: 'applied', message: null }
        : { commandId: c.id, status: 'rejected', message };
    });
    await this.store.commitTick(this.cityId, state, outcomes);
    this.current = state;
    return {
      tick: state.tick,
      applied: outcomes.filter((o) => o.status === 'applied').length,
      rejected: outcomes.filter((o) => o.status === 'rejected').length,
    };
  }

  /** Attende la fine del tick in corso (spegnimento ordinato). */
  async idle(): Promise<void> {
    await this.running;
  }
}

function publicRecord(record: CommandRecord) {
  const [, clientId = record.command.id] = record.command.id.split(/:(.*)/s);
  return {
    id: clientId,
    type: record.command.type,
    status: record.status,
    message: record.message,
  };
}

/** Prossimo istante multiplo dell'intervallo (contato da mezzanotte UTC del 1/1/1970). */
export function nextAlignedTick(now: number, intervalMs: number): number {
  return (Math.floor(now / intervalMs) + 1) * intervalMs;
}
