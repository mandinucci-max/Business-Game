import type { BalanceConfig } from '@business-game/config';
import { type GameDate, dateOfTick } from './calendar';
import {
  LedgerError,
  type Transaction,
  type TransactionInput,
  checkLedgerInvariants,
  postTransaction,
} from './ledger';
import { type Command, type CommandRejection, CommandRejectedError } from './command-core';
import { DEFAULT_COMMAND_HANDLERS } from './commands';
import { DEFAULT_PIPELINE } from './pipeline';
import { type Rng, createRng } from './rng';
import type { CityState } from './state';

export interface TickContext {
  /** Bozza dello stato del tick: si può modificare, viene confermata solo se le invarianti reggono. */
  readonly state: CityState;
  readonly date: GameDate;
  readonly config: BalanceConfig;
  /** Flusso casuale indipendente per nome: le fasi non si influenzano a vicenda. */
  rng(stream: string): Rng;
  /** Registra una transazione nel registro e nel rapporto del tick. */
  post(input: TransactionInput): Transaction;
  /** Registra un fatto rilevante del tick (fallimenti, eventi...) nel rapporto. */
  emit(event: GameEvent): void;
}

/** Fatto rilevante del tick, destinato al Giornale e ai report. */
export interface GameEvent {
  readonly type: string;
  readonly [key: string]: string | number | boolean;
}

/**
 * Gli handler devono essere atomici: verificano tutto prima di modificare lo stato
 * e rifiutano con CommandRejectedError. Un LedgerError (es. fondi insufficienti) rifiuta
 * il comando: la transazione è atomica, quindi va registrata come ultima modifica.
 */
export type CommandHandler = (ctx: TickContext, command: Command) => void;
export {
  type Command,
  type CommandRejection,
  CommandRejectedError,
  type RejectionReason,
} from './command-core';
export type CommandHandlers = Readonly<Record<string, CommandHandler>>;

export interface TickStep {
  readonly name: string;
  readonly run?: (ctx: TickContext) => void;
}

export interface Pipeline {
  readonly weekly: readonly TickStep[];
  /** Eseguite in aggiunta all'ultimo tick del mese (chiusura mensile). */
  readonly monthly: readonly TickStep[];
}

export const APPLY_COMMANDS_STEP = 'apply_commands';

export interface TickOptions {
  readonly pipeline?: Pipeline;
  readonly commandHandlers?: CommandHandlers;
  /** Conserva l'elenco delle transazioni nel rapporto (predefinito: sì; il simulatore lo spegne). */
  readonly recordTransactions?: boolean;
}

export interface TickReport {
  readonly date: GameDate;
  readonly executedSteps: readonly string[];
  readonly transactions: readonly Transaction[];
  readonly rejectedCommands: readonly CommandRejection[];
  readonly events: readonly GameEvent[];
}

export interface TickResult {
  readonly state: CityState;
  readonly report: TickReport;
}

export class InvariantViolationError extends Error {
  readonly violations: readonly string[];

  constructor(tick: number, violations: readonly string[]) {
    super(`Invarianti violate al tick ${tick}:\n- ${violations.join('\n- ')}`);
    this.name = 'InvariantViolationError';
    this.violations = violations;
  }
}

export class SeasonOverError extends Error {
  constructor() {
    super('La stagione è conclusa: nessun altro tick da elaborare');
    this.name = 'SeasonOverError';
  }
}

/**
 * Elabora un tick: nuovoStato = tick(stato, comandi, seed).
 * Funzione pura: lo stato in ingresso non viene mai modificato. Se le invarianti
 * non reggono, il tick fallisce e nessuna modifica viene confermata.
 */
export function runTick(
  state: CityState,
  commands: readonly Command[],
  config: BalanceConfig,
  options: TickOptions = {},
): TickResult {
  const calendar = config.global.time;
  if (state.tick >= calendar.ticksPerMonth * calendar.monthsPerSeason) {
    throw new SeasonOverError();
  }

  const draft = structuredClone(state);
  const date = dateOfTick(draft.tick, calendar);
  const transactions: Transaction[] = [];
  const recordTransactions = options.recordTransactions ?? true;
  const executedSteps: string[] = [];
  const events: GameEvent[] = [];
  const streams = new Map<string, Rng>();

  const ctx: TickContext = {
    state: draft,
    date,
    config,
    rng(stream) {
      let rng = streams.get(stream);
      if (rng === undefined) {
        rng = createRng(`${draft.seed}/${date.tick}/${stream}`);
        streams.set(stream, rng);
      }
      return rng;
    },
    post(input) {
      const transaction = postTransaction(draft.ledger, input, date.tick);
      if (recordTransactions) transactions.push(transaction);
      return transaction;
    },
    emit(event) {
      events.push(event);
      routeToPlayer(draft, date.tick, event);
    },
  };

  const rejectedCommands = applyCommands(
    ctx,
    commands,
    options.commandHandlers ?? DEFAULT_COMMAND_HANDLERS,
  );
  executedSteps.push(APPLY_COMMANDS_STEP);

  const pipeline = options.pipeline ?? DEFAULT_PIPELINE;
  const steps = date.isMonthEnd ? [...pipeline.weekly, ...pipeline.monthly] : pipeline.weekly;
  for (const step of steps) {
    step.run?.(ctx);
    executedSteps.push(step.name);
  }

  const violations = checkLedgerInvariants(draft.ledger);
  if (violations.length > 0) {
    throw new InvariantViolationError(date.tick, violations);
  }

  draft.tick += 1;
  return {
    state: draft,
    report: { date, executedSteps, transactions, rejectedCommands, events },
  };
}

const MAX_NOTES = 40;

/** I fatti che riguardano un giocatore (o una sua azienda) finiscono nelle sue note del mese. */
function routeToPlayer(state: CityState, tick: number, event: GameEvent): void {
  const companyId = typeof event.companyId === 'string' ? event.companyId : undefined;
  const playerId =
    typeof event.playerId === 'string'
      ? event.playerId
      : companyId !== undefined
        ? state.companies[companyId]?.ownerId
        : undefined;
  const player = playerId === undefined ? undefined : state.players[playerId];
  if (player === undefined) return;
  const { type, ...params } = event;
  player.notes = [...player.notes, { tick, type, params }].slice(-MAX_NOTES);
}

function applyCommands(
  ctx: TickContext,
  commands: readonly Command[],
  handlers: CommandHandlers,
): CommandRejection[] {
  const rejections: CommandRejection[] = [];
  const seen = new Set<string>();
  for (const command of commands) {
    if (seen.has(command.id)) {
      rejections.push({
        commandId: command.id,
        reason: 'duplicate_id',
        message: 'Comando già ricevuto in questo tick',
      });
      continue;
    }
    seen.add(command.id);

    const handler = Object.hasOwn(handlers, command.type) ? handlers[command.type] : undefined;
    if (handler === undefined) {
      rejections.push({
        commandId: command.id,
        reason: 'unknown_type',
        message: `Tipo di comando sconosciuto: ${command.type}`,
      });
      continue;
    }

    try {
      handler(ctx, command);
    } catch (error) {
      if (!(error instanceof CommandRejectedError || error instanceof LedgerError)) {
        throw error;
      }
      rejections.push({ commandId: command.id, reason: 'rejected', message: error.message });
    }
  }
  return rejections;
}
