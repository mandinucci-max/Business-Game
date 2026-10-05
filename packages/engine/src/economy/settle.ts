import { type AccountId, MINT_ACCOUNT, SINK_ACCOUNT, type Posting, balanceOf } from '../ledger';
import { type Amount, ZERO, add, amount, negate } from '../money';
import type { Debtor } from '../state';
import type { TickContext } from '../tick';

export interface Payment {
  /** Destinatario: un conto di gioco oppure SINK_ACCOUNT (il denaro esce dal sistema). */
  readonly to: AccountId;
  readonly amount: Amount;
}

/**
 * Esegue un pagamento senza mai fermare la simulazione (GDD §16, mancata esecuzione):
 * - i destinatari giocatori vengono sempre pagati per intero; se il debitore non ha fondi,
 *   la differenza la anticipa il sistema (entrata di denaro) e diventa un arretrato del debitore;
 * - la parte verso il sistema (tasse, operatore, salari esterni) si paga con ciò che resta
 *   e il mancato pagamento diventa arretrato.
 * Restituisce l'importo rimasto non pagato dal debitore.
 */
export function settle(
  ctx: TickContext,
  debtor: Debtor,
  payments: readonly Payment[],
  reason: string,
): Amount {
  const toPlayers = payments.filter((p) => p.to !== SINK_ACCOUNT && p.amount > 0);
  const toSystem = payments
    .filter((p) => p.to === SINK_ACCOUNT && p.amount > 0)
    .reduce((sum, p) => add(sum, p.amount), ZERO);
  const playersTotal = toPlayers.reduce((sum, p) => add(sum, p.amount), ZERO);

  let available = amount(Math.max(0, balanceOf(ctx.state.ledger, debtor.account)));
  let shortfall = ZERO;

  if (playersTotal > 0) {
    const fromDebtor = amount(Math.min(available, playersTotal));
    const covered = amount(playersTotal - fromDebtor);
    const postings: Posting[] = toPlayers.map((p) => ({ account: p.to, amount: p.amount }));
    if (fromDebtor > 0) postings.push({ account: debtor.account, amount: negate(fromDebtor) });
    if (covered > 0) postings.push({ account: MINT_ACCOUNT, amount: negate(covered) });
    ctx.post({
      kind: covered > 0 ? 'faucet' : 'transfer',
      reason: covered > 0 ? `${reason}:arrears_cover` : reason,
      postings: mergePostings(postings),
    });
    available = amount(available - fromDebtor);
    shortfall = add(shortfall, covered);
  }

  if (toSystem > 0) {
    const paid = amount(Math.min(available, toSystem));
    if (paid > 0) {
      ctx.post({
        kind: 'sink',
        reason,
        postings: [
          { account: debtor.account, amount: negate(paid) },
          { account: SINK_ACCOUNT, amount: paid },
        ],
      });
    }
    shortfall = add(shortfall, amount(toSystem - paid));
  }

  if (shortfall > 0) {
    addArrears(debtor, shortfall, ctx.date.tick);
  }
  return shortfall;
}

/** Entrata di denaro dall'esterno (es. clienti gestiti dal computer). */
export function receiveFromOutside(
  ctx: TickContext,
  payments: readonly Payment[],
  reason: string,
): void {
  const valid = payments.filter((p) => p.amount > 0);
  const total = valid.reduce((sum, p) => add(sum, p.amount), ZERO);
  if (total === 0) return;
  ctx.post({
    kind: 'faucet',
    reason,
    postings: mergePostings([
      { account: MINT_ACCOUNT, amount: negate(total) },
      ...valid.map((p) => ({ account: p.to, amount: p.amount })),
    ]),
  });
}

/** Trasferimento semplice tra due conti di gioco; fallisce (LedgerError) se mancano i fondi. */
export function transfer(
  ctx: TickContext,
  from: AccountId,
  to: AccountId,
  value: Amount,
  reason: string,
): void {
  if (value <= 0 || from === to) return;
  ctx.post({
    kind: 'transfer',
    reason,
    postings: [
      { account: from, amount: negate(value) },
      { account: to, amount: value },
    ],
  });
}

/** Salda per quanto possibile gli arretrati con la liquidità disponibile. */
export function repayArrears(ctx: TickContext, debtor: Debtor): void {
  if (debtor.arrears <= 0) return;
  const available = Math.max(0, balanceOf(ctx.state.ledger, debtor.account));
  const paid = amount(Math.min(available, debtor.arrears));
  if (paid > 0) {
    ctx.post({
      kind: 'sink',
      reason: 'arrears:repayment',
      postings: [
        { account: debtor.account, amount: negate(paid) },
        { account: SINK_ACCOUNT, amount: paid },
      ],
    });
    debtor.arrears = amount(debtor.arrears - paid);
  }
  if (debtor.arrears === 0) {
    debtor.arrearsSinceTick = null;
  }
}

export function addArrears(debtor: Debtor, value: Amount, tick: number): void {
  if (value <= 0) return;
  debtor.arrears = add(debtor.arrears, value);
  debtor.arrearsSinceTick ??= tick;
}

function mergePostings(postings: Posting[]): Posting[] {
  const merged = new Map<AccountId, number>();
  for (const p of postings) {
    merged.set(p.account, (merged.get(p.account) ?? 0) + p.amount);
  }
  return [...merged]
    .filter(([, value]) => value !== 0)
    .map(([account, value]) => ({ account, amount: amount(value) }));
}
