import type { BalanceConfig } from '@business-game/config';
import { SINK_ACCOUNT, balanceOf } from '../ledger';
import { type Amount, add, amount, credits } from '../money';
import type { CityState, Debtor, Player } from '../state';
import type { Posting } from '../ledger';
import type { TickContext } from '../tick';
import { settle } from './settle';

/**
 * Immobili (GDD §6.2, anticipati in Fase 2): unità residenziali affittate alle persone e unità
 * commerciali affittate alle aziende. Gli affitti passano da un conto di compensazione: la parte
 * corrispondente agli immobili dei giocatori va ai proprietari, il resto all'operatore cittadino.
 */
export type PropertyKind = 'residential' | 'commercial';

export function rentAccount(kind: PropertyKind): string {
  return `rent:${kind}`;
}

/** Affitto mensile di mercato di un'unità, indicizzato ai costi. */
export function unitRent(state: CityState, config: BalanceConfig, kind: PropertyKind): number {
  const r = config.progression.realEstate;
  const base = kind === 'residential' ? r.residentialUnitRentMonthly : r.commercialUnitRentMonthly;
  return base * state.macro.costIndex;
}

/** Rendimento richiesto dal mercato: sale con i tassi d'interesse, quindi i prezzi scendono. */
export function capRate(state: CityState, config: BalanceConfig): number {
  const r = config.progression.realEstate;
  return Math.max(
    0.02,
    r.baseCapRate +
      r.capRateRateSensitivity * (state.macro.policyRate - config.economy.macro.neutralRate),
  );
}

/** Prezzo di un'unità: affitto netto annuo diviso per il rendimento richiesto. */
export function unitPrice(state: CityState, config: BalanceConfig, kind: PropertyKind): number {
  const net =
    unitRent(state, config, kind) * 12 * (1 - config.progression.realEstate.maintenanceShare);
  return net / capRate(state, config);
}

/** Unità richieste dagli inquilini (persone e aziende) e unità possedute dai giocatori. */
export function rentalMarket(
  state: CityState,
  config: BalanceConfig,
  kind: PropertyKind,
): { demand: number; supply: number; occupancy: number; playerShare: number } {
  let demand = 0;
  if (kind === 'residential') {
    const levels = config.economy.lifestyle.monthlyCostByLevel;
    for (const player of Object.values(state.players)) {
      demand += (levels[player.lifestyleLevel - 1] ?? 0) * config.economy.lifestyle.housingShare;
    }
    demand = (demand * state.macro.costIndex) / unitRent(state, config, kind);
  } else {
    for (const company of Object.values(state.companies)) {
      if (company.status !== 'active') continue;
      demand += 1 + config.economy.market.rentPerWorkerFactor * company.npcWorkers;
    }
  }
  const supply = Object.values(state.players).reduce((sum, p) => sum + p.properties[kind], 0);
  return {
    demand,
    supply,
    occupancy: supply > 0 ? Math.min(1, demand / supply) : 0,
    playerShare: demand > 0 ? Math.min(1, supply / demand) : 0,
  };
}

/** Un inquilino paga l'affitto: la quota dei giocatori va al conto di compensazione. */
export function payRent(
  ctx: TickContext,
  tenant: Debtor,
  value: Amount,
  kind: PropertyKind,
  playerShare: number,
  reason: string,
): void {
  const toLandlords = credits((value / 100) * playerShare);
  settle(
    ctx,
    tenant,
    [
      { to: rentAccount(kind), amount: toLandlords },
      { to: SINK_ACCOUNT, amount: amount(value - toLandlords) },
    ],
    reason,
  );
}

/** Distribuisce gli affitti incassati ai proprietari in base alle unità, meno la manutenzione. */
export function distributeRents(ctx: TickContext, kind: PropertyKind): void {
  const { state, config } = ctx;
  const account = rentAccount(kind);
  const collected = balanceOf(state.ledger, account);
  if (collected <= 0) return;
  const owners = Object.values(state.players).filter((p) => p.properties[kind] > 0);
  const units = owners.reduce((sum, p) => sum + p.properties[kind], 0);
  const maintenance = amount(
    Math.round(collected * config.progression.realEstate.maintenanceShare),
  );
  const distributable = collected - maintenance;
  const postings: Posting[] = [];
  let paid = 0;
  owners.forEach((owner, i) => {
    const value =
      i === owners.length - 1
        ? distributable - paid
        : Math.floor((distributable * owner.properties[kind]) / units);
    if (value > 0) {
      postings.push({ account: owner.account, amount: amount(value) });
      owner.month.capitalIncome = add(owner.month.capitalIncome, amount(value));
      paid += value;
    }
  });
  if (maintenance > 0) postings.push({ account: SINK_ACCOUNT, amount: maintenance });
  postings.push({ account, amount: amount(-(paid + maintenance)) });
  ctx.post({ kind: maintenance > 0 ? 'sink' : 'transfer', reason: `rent:${kind}`, postings });
}

export function propertyValue(state: CityState, config: BalanceConfig, player: Player): number {
  return (
    player.properties.residential * unitPrice(state, config, 'residential') +
    player.properties.commercial * unitPrice(state, config, 'commercial')
  );
}

/** Affitto netto mensile atteso dagli immobili posseduti, tenendo conto dell'occupazione. */
export function propertyIncomeMonthly(
  state: CityState,
  config: BalanceConfig,
  player: Player,
): number {
  const maintenance = config.progression.realEstate.maintenanceShare;
  let total = 0;
  for (const kind of ['residential', 'commercial'] as const) {
    if (player.properties[kind] === 0) continue;
    const market = rentalMarket(state, config, kind);
    total +=
      player.properties[kind] *
      unitRent(state, config, kind) *
      market.occupancy *
      (1 - maintenance);
  }
  return total;
}
