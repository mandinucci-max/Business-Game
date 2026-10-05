import { type Amount, ZERO, add, amount, negate } from './money';

/**
 * Registro a partita doppia (piano §2.3). Ogni movimento di Crediti è una transazione
 * le cui scritture sommano a zero. Il denaro entra nel sistema solo dal conto MINT
 * (es. domanda della popolazione) ed esce solo verso il conto SINK (es. tasse):
 * così la massa monetaria è sempre uguale a entrate − uscite (GDD §13.1).
 */
export type AccountId = string;

export const MINT_ACCOUNT: AccountId = 'system:mint';
export const SINK_ACCOUNT: AccountId = 'system:sink';
const SYSTEM_PREFIX = 'system:';

export type FlowKind = 'faucet' | 'sink' | 'transfer';

export interface Posting {
  readonly account: AccountId;
  /** Positivo = il saldo del conto aumenta; negativo = diminuisce. */
  readonly amount: Amount;
}

export interface TransactionInput {
  readonly kind: FlowKind;
  readonly reason: string;
  readonly postings: readonly Posting[];
}

export interface Transaction extends TransactionInput {
  readonly id: number;
  readonly tick: number;
}

export interface Account {
  balance: Amount;
  /** Quanto il saldo può scendere sotto zero (fido). 0 = nessuno scoperto. */
  overdraftLimit: Amount;
}

export interface LedgerState {
  accounts: Record<AccountId, Account>;
  totalFaucet: Amount;
  totalSink: Amount;
  nextTransactionId: number;
}

export type LedgerErrorCode =
  | 'account_exists'
  | 'invalid_account_id'
  | 'unknown_account'
  | 'too_few_postings'
  | 'zero_posting'
  | 'unbalanced'
  | 'invalid_flow'
  | 'insufficient_funds'
  | 'invalid_amount';

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

export function isSystemAccount(id: AccountId): boolean {
  return id.startsWith(SYSTEM_PREFIX);
}

export function createLedger(): LedgerState {
  return {
    accounts: {
      [MINT_ACCOUNT]: { balance: ZERO, overdraftLimit: ZERO },
      [SINK_ACCOUNT]: { balance: ZERO, overdraftLimit: ZERO },
    },
    totalFaucet: ZERO,
    totalSink: ZERO,
    nextTransactionId: 1,
  };
}

export function openAccount(
  ledger: LedgerState,
  id: AccountId,
  overdraftLimit: Amount = ZERO,
): void {
  if (id.length === 0 || isSystemAccount(id)) {
    throw new LedgerError('invalid_account_id', `Id di conto non valido: "${id}"`);
  }
  if (Object.hasOwn(ledger.accounts, id)) {
    throw new LedgerError('account_exists', `Il conto ${id} esiste già`);
  }
  if (overdraftLimit < 0) {
    throw new LedgerError('invalid_amount', `Fido negativo per ${id}`);
  }
  ledger.accounts[id] = { balance: ZERO, overdraftLimit };
}

export function balanceOf(ledger: LedgerState, id: AccountId): Amount {
  return getAccount(ledger, id).balance;
}

/**
 * Registra una transazione in modo atomico: tutte le verifiche avvengono prima di
 * modificare qualsiasi saldo, quindi una transazione rifiutata non lascia tracce.
 */
export function postTransaction(
  ledger: LedgerState,
  input: TransactionInput,
  tick: number,
): Transaction {
  if (input.postings.length < 2) {
    throw new LedgerError('too_few_postings', 'Una transazione richiede almeno due scritture');
  }

  // Ogni conto viene risolto una sola volta per transazione.
  const accounts = new Map<AccountId, Account>();
  const deltas = new Map<AccountId, number>();
  let sum = 0;
  for (const posting of input.postings) {
    const value = amount(posting.amount);
    if (value === 0) {
      throw new LedgerError('zero_posting', `Scrittura a zero sul conto ${posting.account}`);
    }
    if (!accounts.has(posting.account)) {
      accounts.set(posting.account, getAccount(ledger, posting.account));
    }
    deltas.set(posting.account, amount((deltas.get(posting.account) ?? 0) + value));
    sum = amount(sum + value);
  }
  if (sum !== 0) {
    throw new LedgerError('unbalanced', `Transazione non bilanciata (somma ${sum})`);
  }

  const mintDelta = deltas.get(MINT_ACCOUNT) ?? 0;
  const sinkDelta = deltas.get(SINK_ACCOUNT) ?? 0;
  const touchesMint = deltas.has(MINT_ACCOUNT);
  const touchesSink = deltas.has(SINK_ACCOUNT);
  const validFlow =
    (input.kind === 'faucet' && touchesMint && !touchesSink && mintDelta < 0) ||
    (input.kind === 'sink' && touchesSink && !touchesMint && sinkDelta > 0) ||
    (input.kind === 'transfer' && !touchesMint && !touchesSink);
  if (!validFlow) {
    throw new LedgerError(
      'invalid_flow',
      `Le scritture non corrispondono a un flusso di tipo "${input.kind}"`,
    );
  }

  const newBalances = new Map<Account, Amount>();
  for (const [id, delta] of deltas) {
    const account = accounts.get(id) as Account;
    const balance = add(account.balance, amount(delta));
    if (!isSystemAccount(id) && balance < -account.overdraftLimit) {
      throw new LedgerError('insufficient_funds', `Fondi insufficienti sul conto ${id}`);
    }
    newBalances.set(account, balance);
  }

  for (const [account, balance] of newBalances) {
    account.balance = balance;
  }
  if (input.kind === 'faucet') {
    ledger.totalFaucet = add(ledger.totalFaucet, negate(amount(mintDelta)));
  } else if (input.kind === 'sink') {
    ledger.totalSink = add(ledger.totalSink, amount(sinkDelta));
  }

  const transaction: Transaction = {
    id: ledger.nextTransactionId,
    tick,
    kind: input.kind,
    reason: input.reason,
    postings: input.postings.map((p) => ({ account: p.account, amount: p.amount })),
  };
  ledger.nextTransactionId += 1;
  return transaction;
}

/** Denaro in circolazione: somma dei saldi di tutti i conti non di sistema. */
export function circulatingSupply(ledger: LedgerState): Amount {
  let total = ZERO;
  for (const [id, account] of Object.entries(ledger.accounts)) {
    if (!isSystemAccount(id)) {
      total = add(total, account.balance);
    }
  }
  return total;
}

/** Verifica le invarianti del registro; restituisce l'elenco delle violazioni (vuoto se tutto è corretto). */
export function checkLedgerInvariants(ledger: LedgerState): string[] {
  const violations: string[] = [];
  let sum = 0;
  for (const [id, account] of Object.entries(ledger.accounts)) {
    if (!Number.isSafeInteger(account.balance)) {
      violations.push(`saldo non intero sul conto ${id}`);
      continue;
    }
    sum += account.balance;
    if (!isSystemAccount(id) && account.balance < -account.overdraftLimit) {
      violations.push(`conto ${id} oltre il fido`);
    }
  }
  if (sum !== 0) {
    violations.push(`la somma di tutti i saldi è ${sum} invece di 0`);
  }
  if (balanceOf(ledger, MINT_ACCOUNT) !== -ledger.totalFaucet) {
    violations.push('il saldo del conto MINT non corrisponde al totale delle entrate');
  }
  if (balanceOf(ledger, SINK_ACCOUNT) !== ledger.totalSink) {
    violations.push('il saldo del conto SINK non corrisponde al totale delle uscite');
  }
  if (circulatingSupply(ledger) !== ledger.totalFaucet - ledger.totalSink) {
    violations.push('massa monetaria diversa da entrate − uscite');
  }
  return violations;
}

function getAccount(ledger: LedgerState, id: AccountId): Account {
  if (!Object.hasOwn(ledger.accounts, id)) {
    throw new LedgerError('unknown_account', `Conto inesistente: ${id}`);
  }
  return ledger.accounts[id] as Account;
}
