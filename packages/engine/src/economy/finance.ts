import { type BalanceConfig, CREDIT_RATINGS, type CreditRating } from '@business-game/config';
import { type Amount, ZERO, add, amount, multiply, roundHalfAwayFromZero } from '../money';
import type { CityState, Loan } from '../state';

/** Tasso annuo per un rating: tasso di riferimento + spread; null se il rating non dà accesso al credito. */
export function lendingRate(
  state: CityState,
  config: BalanceConfig,
  rating: CreditRating,
): number | null {
  const spread = config.economy.bank.spreads[rating];
  return spread === null ? null : state.macro.policyRate + spread;
}

/** Rata mensile costante di un prestito ammortizzato. */
export function amortizingPayment(principal: Amount, annualRate: number, months: number): Amount {
  if (months <= 0) return principal;
  const r = annualRate / 12;
  if (r === 0) return amount(roundHalfAwayFromZero(principal / months));
  return amount(roundHalfAwayFromZero((principal * r) / (1 - (1 + r) ** -months)));
}

/** Importo dovuto questo mese per un prestito: quota interessi + quota capitale. */
export function loanInstallment(loan: Loan): { interest: Amount; principal: Amount } {
  const interest = multiply(loan.principal, loan.annualRate / 12);
  if (loan.repayment === 'bullet') {
    return { interest, principal: loan.remainingMonths <= 1 ? loan.principal : ZERO };
  }
  const payment = amortizingPayment(loan.principal, loan.annualRate, loan.remainingMonths);
  const principal = amount(Math.min(loan.principal, Math.max(0, payment - interest)));
  return { interest, principal };
}

export function monthlyDebtService(
  state: CityState,
  kind: 'player' | 'company',
  id: string,
): Amount {
  let total = ZERO;
  for (const loan of Object.values(state.loans)) {
    if (loan.borrower.kind === kind && loan.borrower.id === id) {
      const installment = loanInstallment(loan);
      total = add(total, add(installment.interest, installment.principal));
    }
  }
  return total;
}

export function outstandingDebt(state: CityState, kind: 'player' | 'company', id: string): Amount {
  let total = ZERO;
  for (const loan of Object.values(state.loans)) {
    if (loan.borrower.kind === kind && loan.borrower.id === id) {
      total = add(total, loan.principal);
    }
  }
  return total;
}

/** Imposta progressiva sul reddito mensile delle persone (GDD §13). */
export function personalIncomeTax(income: Amount, config: BalanceConfig): Amount {
  let remaining = income / 100;
  let lower = 0;
  let tax = 0;
  for (const bracket of config.economy.taxes.personalBrackets) {
    if (remaining <= 0) break;
    const width = bracket.upTo === null ? remaining : Math.min(remaining, bracket.upTo - lower);
    tax += width * bracket.rate;
    remaining -= width;
    lower = bracket.upTo ?? lower;
  }
  return amount(roundHalfAwayFromZero(tax * 100));
}

/**
 * Rating obiettivo in base al peso delle rate sul reddito e agli arretrati.
 * Il rating effettivo si muove di un solo gradino al mese verso l'obiettivo.
 */
export function targetRating(params: {
  monthlyIncome: Amount;
  debtService: Amount;
  arrears: Amount;
  liquidity: Amount;
  monthlyExpenses: Amount;
}): CreditRating {
  if (params.arrears > 0) return 'CCC';
  const income = Math.max(1, params.monthlyIncome);
  const ratio = params.debtService / income;
  let index =
    ratio < 0.1 ? 1 : ratio < 0.2 ? 2 : ratio < 0.3 ? 3 : ratio < 0.4 ? 4 : ratio < 0.6 ? 5 : 6;
  if (params.liquidity > 6 * Math.max(1, params.monthlyExpenses)) index -= 1;
  if (params.monthlyIncome <= 0 && params.debtService > 0) index = 6;
  return CREDIT_RATINGS[Math.max(0, Math.min(6, index))] as CreditRating;
}

export function stepRatingToward(current: CreditRating, target: CreditRating): CreditRating {
  const from = CREDIT_RATINGS.indexOf(current);
  const to = CREDIT_RATINGS.indexOf(target);
  if (from === to) return current;
  return CREDIT_RATINGS[from + Math.sign(to - from)] as CreditRating;
}
