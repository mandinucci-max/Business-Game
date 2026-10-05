import { SECTOR_IDS, type SectorId } from '@business-game/config';
import { SINK_ACCOUNT, balanceOf } from '../ledger';
import { type Amount, ZERO, add, amount, credits, multiply, toCredits } from '../money';
import { type Company, type Player, unitsPerNpcWorkerWeek } from '../state';
import type { TickContext } from '../tick';
import {
  type Competitor,
  morale,
  nextBrand,
  nextRndStock,
  overhead,
  quality,
  satisfaction,
  service,
  stepCustomerFlows,
  weeklyRate,
} from './market';
import {
  activeCompanies,
  inputRequirements,
  marketParams,
  marketWage,
  marketAccount,
  operatorPrice,
  referenceWeeklyRevenue,
} from './sector';
import { type Payment, receiveFromOutside, repayArrears, settle } from './settle';
import { bankruptCompany, bankruptPlayer } from './insolvency';

/** Moltiplicatori di domanda e prezzi dell'operatore per settore (GDD §7.4, §13). */
export function updateMarketConditions(ctx: TickContext): void {
  const { state, config } = ctx;
  const demand = config.economy.demand;
  const payroll = toCredits(state.macro.lastNpcPayroll);
  const payrollMultiplier =
    demand.payrollMultiplierMin +
    (demand.payrollMultiplierMax - demand.payrollMultiplierMin) *
      Math.min(1, payroll / demand.payrollReferenceMonthly);

  for (const sector of SECTOR_IDS) {
    let eventDemand = 1;
    let eventPrice = 1;
    for (const active of state.macro.activeEvents) {
      const event = config.economy.events.find((e) => e.id === active.id);
      for (const effect of event?.effects ?? []) {
        if (effect.sector === 'all' || effect.sector === sector) {
          eventDemand *= effect.demand ?? 1;
          eventPrice *= effect.operatorPrice ?? 1;
        }
      }
    }
    const rateEffect =
      1 -
      config.sectors[sector].economics.interestRateSensitivity *
        (state.macro.policyRate - config.economy.macro.neutralRate);
    const market = state.markets[sector];
    market.demandMultiplier = Math.max(
      demand.minimumDemandMultiplier,
      state.macro.demandStabilizer *
        payrollMultiplier *
        Math.max(demand.minimumDemandMultiplier, rateEffect) *
        eventDemand,
    );
    market.operatorPriceMultiplier = eventPrice;
  }
}

/** Morale e dimissioni dei lavoratori pagati sotto il mercato. */
export function updateLabour(ctx: TickContext): void {
  const { state, config } = ctx;
  const labour = config.economy.labour;
  const rng = ctx.rng('labour');
  for (const company of activeCompanies(state)) {
    company.morale = morale(
      toCredits(company.wage),
      marketWage(state, config, company.sector),
      labour.moraleWageExponent,
      labour.moraleMin,
      labour.moraleMax,
    );
    if (company.morale < 1 && company.npcWorkers > 0) {
      const quitRate =
        (labour.lowMoraleWeeklyQuitRate * (1 - company.morale)) / (1 - labour.moraleMin);
      let quits = 0;
      for (let i = 0; i < company.npcWorkers; i++) {
        if (rng.chance(Math.min(1, quitRate))) quits += 1;
      }
      if (quits > 0) {
        company.npcWorkers -= quits;
        state.macro.employment -= quits;
        ctx.emit({ type: 'workers_quit', companyId: company.id, count: quits });
      }
    }
  }
}

export function updateCapacity(ctx: TickContext): void {
  const { state, config } = ctx;
  const market = config.economy.market;
  const labour = config.economy.labour;
  for (const company of activeCompanies(state)) {
    const workers = company.npcWorkers;
    const training =
      1 +
      labour.trainingMaxBonus *
        (1 -
          Math.exp(
            -toCredits(company.budget.training) /
              (Math.max(1, workers) * labour.trainingReferencePerWorkerWeekly),
          ));
    company.capacity =
      workers *
      unitsPerNpcWorkerWeek(config, company.sector) *
      company.morale *
      training *
      (1 -
        overhead(
          workers,
          market.overheadBase,
          market.overheadReferenceWorkers,
          config.global.market.overheadExponent,
          market.maxOverhead,
        ));
  }
}

/** Qualità media degli input acquistati, pesata sul costo (GDD §8.3). */
export function updateInputQuality(ctx: TickContext): void {
  const { state, config } = ctx;
  for (const company of activeCompanies(state)) {
    let weighted = 0;
    let weight = 0;
    for (const input of inputRequirements(config, company.sector)) {
      const share = config.sectors[company.sector].inputShares[input.sector] ?? 0;
      weighted += share * state.markets[input.sector].averageQuality;
      weight += share;
    }
    company.inputQuality = weight > 0 ? weighted / weight : config.economy.market.operatorQuality;
  }
}

export function produce(ctx: TickContext): void {
  for (const company of activeCompanies(ctx.state)) {
    company.output = Math.min(company.customers, company.capacity);
  }
}

interface Buyer {
  readonly kind: 'npc' | 'player' | 'company';
  readonly entity?: Player | Company;
  readonly units: number;
}

/**
 * Mercati (GDD §8.2): la produzione viene venduta alla domanda del tick e pagata da chi compra
 * (popolazione gestita dal computer, panieri dei giocatori, aziende per i loro input), poi i
 * clienti si spostano per attrattività e soddisfazione.
 */
export function runMarkets(ctx: TickContext): void {
  const { state, config } = ctx;
  const lifestyle = config.economy.lifestyle;

  const buyers = new Map<SectorId, Buyer[]>(SECTOR_IDS.map((s) => [s, []]));
  for (const sector of SECTOR_IDS) {
    const floor =
      config.sectors[sector].economics.npcDemandFloorWeekly *
      state.markets[sector].demandMultiplier;
    if (floor > 0) buyers.get(sector)?.push({ kind: 'npc', units: floor });
  }
  for (const player of Object.values(state.players)) {
    // GDD §7.1: se la liquidità non basta, il paniere scende al livello base.
    if (
      player.lifestyleLevel > 1 &&
      balanceOf(state.ledger, player.account) < credits(basketWeeklyCost(ctx, player))
    ) {
      player.lifestyleLevel = 1;
      ctx.emit({ type: 'lifestyle_downgraded', playerId: player.id });
    }
    const weekly = basketWeeklyCost(ctx, player);
    for (const [sector, share] of Object.entries(lifestyle.basketShares) as [SectorId, number][]) {
      const units =
        (weekly * share) /
        (config.sectors[sector].economics.basePrice * (1 + config.global.npc.cityOperatorMarkup));
      if (units > 0) buyers.get(sector)?.push({ kind: 'player', entity: player, units });
    }
    settle(
      ctx,
      player,
      [{ to: SINK_ACCOUNT, amount: credits(weekly * lifestyle.housingShare) }],
      'basket:housing',
    );
  }
  for (const company of activeCompanies(state)) {
    if (company.lastOutput <= 0) continue;
    for (const input of inputRequirements(config, company.sector)) {
      buyers.get(input.sector)?.push({
        kind: 'company',
        entity: company,
        units: company.lastOutput * input.units,
      });
    }
  }

  for (const sector of SECTOR_IDS) {
    settleSector(ctx, sector, buyers.get(sector) ?? []);
  }

  for (const company of activeCompanies(state)) {
    company.lastOutput = company.output;
  }
}

function settleSector(ctx: TickContext, sector: SectorId, buyers: readonly Buyer[]): void {
  const { state, config } = ctx;
  const market = state.markets[sector];
  const basePrice = config.sectors[sector].economics.basePrice;
  const opPrice = operatorPrice(state, config, sector);
  const suppliers = activeCompanies(state, sector);
  const demand = buyers.reduce((sum, b) => sum + b.units, 0);

  const produced = suppliers.reduce((sum, c) => sum + c.output, 0);
  const scale = produced > demand && produced > 0 ? demand / produced : 1;
  const sold = new Map(suppliers.map((c) => [c.id, c.output * scale]));
  const playerSales = produced * scale;
  // Si produce solo ciò che si vende: gli input del tick successivo seguono le vendite.
  for (const supplier of suppliers) supplier.output = sold.get(supplier.id) ?? 0;
  const servedShare = demand > 0 ? playerSales / demand : 0;

  // Valore per unità di domanda servita dai giocatori: media dei prezzi pesata sulle vendite.
  const playerValuePerUnit =
    demand > 0
      ? suppliers.reduce((sum, c) => sum + toCredits(c.price) * (sold.get(c.id) ?? 0), 0) / demand
      : 0;
  const revenue = new Map<string, Amount>(suppliers.map((c) => [c.id, ZERO]));
  const credit = (supplierId: string, value: Amount) =>
    revenue.set(supplierId, add(revenue.get(supplierId) ?? ZERO, value));

  // Gli acquirenti giocatori pagano una sola volta al conto di compensazione del mercato, che poi
  // paga i fornitori: il costo è proporzionale ad acquirenti + fornitori, non al loro prodotto.
  const clearing = marketAccount(sector);
  for (const buyer of buyers) {
    if (buyer.kind === 'npc') {
      const payments: Payment[] = [];
      for (const supplier of suppliers) {
        const units = demand > 0 ? (buyer.units * (sold.get(supplier.id) ?? 0)) / demand : 0;
        const value = multiply(supplier.price, units);
        if (value > 0) {
          payments.push({ to: supplier.account, amount: value });
          credit(supplier.id, value);
        }
      }
      receiveFromOutside(ctx, payments, `sales:${sector}:npc`);
      continue;
    }
    const entity = buyer.entity as Player | Company;
    const toSuppliers = credits(buyer.units * playerValuePerUnit);
    const toOperator = credits(buyer.units * (1 - servedShare) * opPrice);
    settle(
      ctx,
      entity,
      [
        { to: clearing, amount: toSuppliers },
        { to: SINK_ACCOUNT, amount: toOperator },
      ],
      buyer.kind === 'player' ? `basket:${sector}` : `inputs:${sector}`,
    );
    if (buyer.kind === 'company') {
      const company = entity as Company;
      company.month.costs = add(company.month.costs, add(toSuppliers, toOperator));
    }
  }
  distributeClearing(ctx, clearing, suppliers, sold, credit);

  let soldValue = 0;
  let soldQuality = 0;
  for (const supplier of suppliers) {
    const units = sold.get(supplier.id) ?? 0;
    supplier.month.revenue = add(supplier.month.revenue, revenue.get(supplier.id) ?? ZERO);
    const fill = supplier.customers > 0 ? units / supplier.customers : 1;
    supplier.satisfaction = satisfaction(
      supplier.quality,
      toCredits(supplier.price),
      basePrice,
      fill,
    );
    soldValue += units * toCredits(supplier.price);
    soldQuality += units * supplier.quality;
  }

  const competitors: Competitor[] = suppliers.map((c) => ({
    id: c.id,
    price: toCredits(c.price),
    quality: c.quality,
    brand: c.brand,
    service: c.service,
    reputation: c.reputation,
    location: c.location,
    customers: c.customers,
    satisfaction: c.satisfaction,
  }));
  const flows = stepCustomerFlows(
    competitors,
    demand,
    marketParams(state, config, sector),
    config.global.time.ticksPerMonth,
  );
  for (const supplier of suppliers) {
    supplier.customers = flows.customers[supplier.id] ?? 0;
  }

  const operatorUnits = Math.max(0, demand - playerSales);
  market.demand = demand;
  market.playerSales = playerSales;
  market.operatorSales = operatorUnits;
  market.operatorSalesThisMonth += operatorUnits;
  market.averagePrice = demand > 0 ? (soldValue + operatorUnits * opPrice) / demand : opPrice;
  market.averageQuality =
    demand > 0
      ? (soldQuality + operatorUnits * config.economy.market.operatorQuality) / demand
      : config.economy.market.operatorQuality;
}

/**
 * Il conto di compensazione distribuisce tutto ciò che ha incassato ai fornitori in proporzione
 * al valore venduto; l'ultimo riceve il resto, così il conto torna sempre esattamente a zero.
 */
function distributeClearing(
  ctx: TickContext,
  clearing: string,
  suppliers: readonly Company[],
  sold: ReadonlyMap<string, number>,
  credit: (supplierId: string, value: Amount) => void,
): void {
  const received = balanceOf(ctx.state.ledger, clearing);
  if (received <= 0) return;
  const weights = suppliers.map((c) => toCredits(c.price) * (sold.get(c.id) ?? 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return;
  const payments: Payment[] = [];
  let paid = 0;
  suppliers.forEach((supplier, i) => {
    const isLast = i === suppliers.length - 1;
    const value = isLast ? received - paid : Math.floor((received * (weights[i] ?? 0)) / total);
    if (value > 0) {
      payments.push({ to: supplier.account, amount: amount(value) });
      credit(supplier.id, amount(value));
      paid += value;
    }
  });
  ctx.post({
    kind: 'transfer',
    reason: 'market:clearing',
    postings: [
      { account: clearing, amount: amount(-paid) },
      ...payments.map((p) => ({ account: p.to, amount: p.amount })),
    ],
  });
}

/** Spese settimanali per area e aggiornamento di brand, ricerca, qualità, servizio, reputazione. */
export function weeklyAccounting(ctx: TickContext): void {
  const { state, config } = ctx;
  const market = config.economy.market;
  const weeksPerMonth = config.global.time.ticksPerMonth;
  for (const company of activeCompanies(state)) {
    const { marketing, rnd, training } = company.budget;
    const spend = add(add(marketing, rnd), add(training, company.budget.service));
    if (spend > 0) {
      settle(ctx, company, [{ to: SINK_ACCOUNT, amount: spend }], 'budget');
      company.month.costs = add(company.month.costs, spend);
    }

    const reference = referenceWeeklyRevenue(config, company.sector);
    const basePrice = config.sectors[company.sector].economics.basePrice;
    company.brand = nextBrand(
      company.brand,
      toCredits(marketing),
      market.marketingReferenceShare * reference,
      config.global.market.brandMonthlyDecay,
      weeksPerMonth,
    );
    company.rndStock = nextRndStock(
      company.rndStock,
      toCredits(rnd),
      market.rndMonthlyDecay,
      weeksPerMonth,
    );
    company.quality = quality({
      baseQuality: market.baseQuality,
      inputQuality: company.inputQuality,
      inputQualityExponent: market.inputQualityExponent,
      rndStock: company.rndStock,
      rndReference:
        (market.rndReferenceShare * reference) / weeklyRate(market.rndMonthlyDecay, weeksPerMonth),
      rndWeight: market.rndQualityWeight,
    });
    company.service = service(
      toCredits(company.budget.service),
      company.customers,
      basePrice * market.serviceReferenceShare,
      market.serviceMaxBonus,
    );
    company.reputation +=
      market.reputationWeeklySmoothing * (company.satisfaction - company.reputation);
  }
}

/** Saldo degli arretrati e insolvenza dopo il periodo di tolleranza (GDD §9.5). */
export function handleInsolvency(ctx: TickContext): void {
  const { state, config } = ctx;
  const grace = config.economy.bank.arrearsGraceTicks;
  for (const company of activeCompanies(state)) {
    repayArrears(ctx, company);
    if (company.arrearsSinceTick !== null && ctx.date.tick - company.arrearsSinceTick >= grace) {
      bankruptCompany(ctx, company);
    }
  }
  for (const player of Object.values(state.players)) {
    repayArrears(ctx, player);
    if (player.arrearsSinceTick !== null && ctx.date.tick - player.arrearsSinceTick >= grace) {
      bankruptPlayer(ctx, player);
    }
  }
}

/** Costo settimanale del paniere personale al livello di vita scelto. */
export function basketWeeklyCost(ctx: TickContext, player: Player): number {
  const levels = ctx.config.economy.lifestyle.monthlyCostByLevel;
  const monthly = levels[Math.min(levels.length, Math.max(1, player.lifestyleLevel)) - 1] ?? 0;
  return monthly / ctx.config.global.time.ticksPerMonth;
}
