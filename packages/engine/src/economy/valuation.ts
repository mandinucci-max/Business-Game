import { balanceOf } from '../ledger';
import { type Amount, ZERO, add, amount, credits, multiply, roundHalfAwayFromZero } from '../money';
import type { CityState, Company } from '../state';
import type { BalanceConfig } from '@business-game/config';
import { outstandingDebt } from './finance';
import { propertyIncomeMonthly, propertyValue } from './realEstate';

/**
 * Valore di un'azienda (GDD §18.1): utile medio mensile degli ultimi 12 mesi × 12 × multiplo
 * di settore, con un minimo pari al valore di bilancio (attrezzature + cassa − debiti).
 */
export function companyValue(state: CityState, config: BalanceConfig, company: Company): Amount {
  if (company.status !== 'active') return ZERO;
  const book = amount(
    company.equipment +
      balanceOf(state.ledger, company.account) -
      outstandingDebt(state, 'company', company.id) -
      company.arrears,
  );
  const history = company.profitHistory;
  if (history.length === 0) return book;
  const averageMonthly = history.reduce((sum, p) => sum + p, 0) / history.length;
  // La ditta individuale vale meno: dipende dal titolare e non si può vendere a quote.
  const multiple =
    company.legalForm === 'sole_proprietorship'
      ? config.progression.careers.entrepreneur.soleProprietorshipValuationMultiple
      : config.sectors[company.sector].valuationMultiple;
  const earnings = amount(roundHalfAwayFromZero(averageMonthly * 12 * multiple));
  // Valore reddituale + posizione finanziaria netta (cassa − debiti); il minimo resta il bilancio.
  return amount(Math.max(book, earnings + (book - company.equipment)));
}

/** Patrimonio netto di un giocatore: liquidità, fondo, aziende possedute meno debiti e arretrati. */
export function netWorth(state: CityState, config: BalanceConfig, playerId: string): Amount {
  const player = state.players[playerId];
  if (player === undefined) return ZERO;
  let total = amount(
    balanceOf(state.ledger, player.account) +
      balanceOf(state.ledger, player.fundAccount) -
      outstandingDebt(state, 'player', player.id) -
      player.arrears,
  );
  // Aziende possedute in tutto o in parte, in proporzione alle quote.
  for (const company of Object.values(state.companies)) {
    const share = company.shares[player.id] ?? 0;
    if (share > 0) total = add(total, multiply(companyValue(state, config, company), share));
  }
  // Crediti verso altri giocatori e immobili.
  for (const loan of Object.values(state.loans)) {
    if (loan.lenderId === player.id) total = add(total, loan.principal);
  }
  return add(total, credits(propertyValue(state, config, player)));
}

/** Cashflow passivo mensile atteso: interessi sui depositi e rendimento atteso del fondo. */
export function passiveMonthlyCashflow(
  state: CityState,
  config: BalanceConfig,
  playerId: string,
): Amount {
  const player = state.players[playerId];
  if (player === undefined) return ZERO;
  const depositRate = Math.max(
    0,
    state.macro.policyRate - config.economy.bank.depositSpreadBelowPolicy,
  );
  const fundRate = state.macro.policyRate + config.economy.indexFund.equityPremium;
  let total = add(
    multiply(amount(Math.max(0, balanceOf(state.ledger, player.account))), depositRate / 12),
    multiply(amount(Math.max(0, balanceOf(state.ledger, player.fundAccount))), fundRate / 12),
  );
  // Royalty dei prodotti, interessi dei prestiti concessi ad altri giocatori, affitti.
  total = add(total, credits((player.freelance?.royaltyMonthly ?? 0) * state.macro.costIndex));
  for (const loan of Object.values(state.loans)) {
    if (loan.lenderId === player.id && (loan.monthsInDefault ?? 0) === 0) {
      total = add(total, multiply(loan.principal, loan.annualRate / 12));
    }
  }
  return add(total, credits(propertyIncomeMonthly(state, config, player)));
}

/** Fattore reputazione del VE: da 0,9 (reputazione 0) a 1,1 (reputazione 100). */
export function reputationFactor(config: BalanceConfig, reputation: number): number {
  const { reputationFactorMin: min, reputationFactorMax: max } = config.global.ranking;
  return min + ((max - min) * Math.max(0, Math.min(100, reputation))) / 100;
}

/**
 * Valore Economico (GDD §18.1): (patrimonio netto + cashflow passivo mensile × 24) × fattore
 * reputazione. Il fattore si applica solo a un valore positivo, per non premiare i debiti.
 */
export function economicValue(state: CityState, config: BalanceConfig, playerId: string): Amount {
  const player = state.players[playerId];
  if (player === undefined) return ZERO;
  const base = add(
    netWorth(state, config, playerId),
    multiply(
      passiveMonthlyCashflow(state, config, playerId),
      config.global.ranking.passiveCashflowMultiplier,
    ),
  );
  return base > 0 ? multiply(base, reputationFactor(config, player.reputation)) : base;
}
