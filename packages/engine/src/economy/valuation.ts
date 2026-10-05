import { balanceOf } from '../ledger';
import { type Amount, ZERO, add, amount, multiply, roundHalfAwayFromZero } from '../money';
import type { CityState, Company } from '../state';
import type { BalanceConfig } from '@business-game/config';
import { outstandingDebt } from './finance';

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
  const earnings = amount(
    roundHalfAwayFromZero(averageMonthly * 12 * config.sectors[company.sector].valuationMultiple),
  );
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
  for (const companyId of player.companyIds) {
    const company = state.companies[companyId];
    if (company !== undefined) total = add(total, companyValue(state, config, company));
  }
  return total;
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
  return add(
    multiply(amount(Math.max(0, balanceOf(state.ledger, player.account))), depositRate / 12),
    multiply(amount(Math.max(0, balanceOf(state.ledger, player.fundAccount))), fundRate / 12),
  );
}

/** Valore Economico (GDD §18.1), senza ancora il fattore reputazione (Fase 2). */
export function economicValue(state: CityState, config: BalanceConfig, playerId: string): Amount {
  return add(
    netWorth(state, config, playerId),
    multiply(
      passiveMonthlyCashflow(state, config, playerId),
      config.global.ranking.passiveCashflowMultiplier,
    ),
  );
}
