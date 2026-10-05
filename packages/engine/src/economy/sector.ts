import { type BalanceConfig, SECTOR_IDS, type SectorId } from '@business-game/config';
import type { CityState, Company } from '../state';
import type { MarketParams } from './market';

/** Prezzo dell'operatore cittadino: prezzo base + ricarico, modificato dagli eventi. */
export function operatorPrice(state: CityState, config: BalanceConfig, sector: SectorId): number {
  return (
    config.sectors[sector].economics.basePrice *
    (1 + config.global.npc.cityOperatorMarkup) *
    state.markets[sector].operatorPriceMultiplier *
    state.macro.costIndex
  );
}

/** Salario di mercato di un lavoratore, indicizzato ai costi. */
export function marketWage(state: CityState, config: BalanceConfig, sector: SectorId): number {
  return config.sectors[sector].economics.npcWageMonthly * state.macro.costIndex;
}

/** Unità di `input` necessarie per produrre un'unità di `sector`, ai prezzi base. */
export function inputUnitsPerUnit(
  config: BalanceConfig,
  sector: SectorId,
  input: SectorId,
): number {
  const share = config.sectors[sector].inputShares[input] ?? 0;
  return (
    (share * config.sectors[sector].economics.basePrice) / config.sectors[input].economics.basePrice
  );
}

/** Settori da cui ogni settore compra input, con le relative unità per unità prodotta. */
export function inputRequirements(
  config: BalanceConfig,
  sector: SectorId,
): { sector: SectorId; units: number }[] {
  return SECTOR_IDS.flatMap((input) => {
    const units = inputUnitsPerUnit(config, sector, input);
    return units > 0 ? [{ sector: input, units }] : [];
  });
}

/** Ricavo settimanale del mercato ai prezzi base: scala di riferimento per marketing e ricerca. */
export function referenceWeeklyRevenue(config: BalanceConfig, sector: SectorId): number {
  const economics = config.sectors[sector].economics;
  return Math.max(1, economics.npcDemandFloorWeekly) * economics.basePrice;
}

export function marketParams(
  state: CityState,
  config: BalanceConfig,
  sector: SectorId,
): MarketParams {
  const sectorConfig = config.sectors[sector];
  const market = config.economy.market;
  return {
    basePrice: sectorConfig.economics.basePrice,
    priceElasticity: sectorConfig.priceElasticity,
    exponents: {
      quality: sectorConfig.attractivenessExponents.quality,
      brand: sectorConfig.attractivenessExponents.brand,
      location: sectorConfig.attractivenessExponents.location,
      service: market.serviceExponent,
      reputation: market.reputationExponent,
    },
    monthlyBaseChurn: sectorConfig.baseMonthlyChurn ?? market.projectMonthlyTurnover,
    churnSatisfactionSensitivity: config.global.market.churnSatisfactionSensitivity,
    competitorPressure: config.global.market.competitorPressure,
    maxWeeklyChurn: market.maxWeeklyChurn,
    weeklySearchRate: market.weeklySearchRate,
    referralStrength: market.referralStrength,
    minimumVisibility: market.minimumVisibility,
    outside: {
      price: operatorPrice(state, config, sector),
      quality: market.operatorQuality,
      brand: market.operatorBrand,
    },
  };
}

export function activeCompanies(state: CityState, sector?: SectorId): Company[] {
  return Object.values(state.companies).filter(
    (company) => company.status === 'active' && (sector === undefined || company.sector === sector),
  );
}
