import type { BalanceConfig } from '@business-game/config';
import { type GameDate, dateOfTick } from './calendar';
import {
  LedgerError,
  type Transaction,
  type TransactionInput,
  checkLedgerInvariants,
  postTransaction,
} from './ledger';
import { type Rng, createRng } from './rng';
import type { CityState } from './state';

/** Intenzione di un giocatore, già validata e autorizzata dal server (piano §2.3). */
export interface Command {
  /** Id univoco: serve all'idempotenza (lo stesso comando non si applica due volte). */
  readonly id: string;
  readonly playerId: string;
  readonly type: string;
  readonly payload: unknown;
}

export type RejectionReason = 'duplicate_id' | 'unknown_type' | 'rejected';

export interface CommandRejection {
  readonly commandId: string;
  readonly reason: RejectionReason;
  readonly message: string;
}

/** Errore da lanciare in un handler per rifiutare un comando. */
export class CommandRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandRejectedError';
  }
}

export interface TickContext {
  /** Bozza dello stato del tick: si può modificare, viene confermata solo se le invarianti reggono. */
  readonly state: CityState;
  readonly date: GameDate;
  readonly config: BalanceConfig;
  /** Flusso casuale indipendente per nome: le fasi non si influenzano a vicenda. */
  rng(stream: string): Rng;
  /** Registra una transazione nel registro e nel rapporto del tick. */
  post(input: TransactionInput): Transaction;
}

/**
 * Gli handler devono essere atomici: verificano tutto prima di modificare lo stato
 * e rifiutano con CommandRejectedError. Un LedgerError (es. fondi insufficienti) rifiuta
 * il comando: la transazione è atomica, quindi va registrata come ultima modifica.
 */
export type CommandHandler = (ctx: TickContext, command: Command) => void;
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

/**
 * Ordine delle fasi del tick (piano §2.5). In Fase 0 sono vuote: ogni fase successiva
 * del piano ne implementa il contenuto senza cambiare l'ordine.
 */
export const DEFAULT_PIPELINE: Pipeline = {
  weekly: [
    { name: 'macro_and_events' },
    { name: 'labour_market' },
    { name: 'production_capacity' },
    { name: 'procurement' },
    { name: 'production' },
    { name: 'markets' },
    { name: 'weekly_accounting' },
    { name: 'contracts_and_insolvency' },
  ],
  monthly: [
    { name: 'monthly_payments' },
    { name: 'taxes_dividends_fees' },
    { name: 'progression' },
    { name: 'capital_bands' },
    { name: 'central_bank' },
    { name: 'valuation_and_rankings' },
    { name: 'hours_reset_and_reports' },
  ],
};

export const APPLY_COMMANDS_STEP = 'apply_commands';

export interface TickOptions {
  readonly pipeline?: Pipeline;
  readonly commandHandlers?: CommandHandlers;
}

export interface TickReport {
  readonly date: GameDate;
  readonly executedSteps: readonly string[];
  readonly transactions: readonly Transaction[];
  readonly rejectedCommands: readonly CommandRejection[];
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
  const executedSteps: string[] = [];
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
      transactions.push(transaction);
      return transaction;
    },
  };

  const rejectedCommands = applyCommands(ctx, commands, options.commandHandlers ?? {});
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
  return { state: draft, report: { date, executedSteps, transactions, rejectedCommands } };
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
