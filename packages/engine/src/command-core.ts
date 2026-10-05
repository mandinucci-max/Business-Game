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
