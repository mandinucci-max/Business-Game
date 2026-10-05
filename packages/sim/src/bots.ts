import type { BalanceConfig, ClassId, SectorId } from '@business-game/config';
import {
  type CityState,
  type Command,
  type Company,
  type Player,
  type Rng,
  balanceOf,
  inputRequirements,
  marketWage,
  operatorPrice,
  toCredits,
  unitsPerNpcWorkerWeek,
} from '@business-game/engine';

/** Stile di gioco di un bot: parametri che rendono le scelte più prudenti o più aggressive. */
export interface Strategy {
  readonly name: 'prudent' | 'aggressive' | 'random';
  /** Mesi di spese da tenere in liquidità prima di investire nel fondo. */
  readonly bufferMonths: number;
  /** Ricarico minimo sul costo unitario stimato. */
  readonly minMarkup: number;
  /** Quote del ricavo settimanale spese in marketing, ricerca e servizio. */
  readonly marketingShare: number;
  readonly rndShare: number;
  readonly serviceShare: number;
  /** Premio sul salario di mercato. */
  readonly wagePremium: number;
  /** Quota dell'utile mensile che il titolare preleva oltre al necessario per vivere. */
  readonly drawShare: number;
}

export function makeStrategy(name: Strategy['name'], rng: Rng): Strategy {
  if (name === 'prudent') {
    return {
      name,
      bufferMonths: 6,
      minMarkup: 0.12,
      marketingShare: 0.01,
      rndShare: 0.01,
      serviceShare: 0.005,
      wagePremium: 0,
      drawShare: 0.3,
    };
  }
  if (name === 'aggressive') {
    return {
      name,
      bufferMonths: 2,
      minMarkup: 0.04,
      marketingShare: 0.04,
      rndShare: 0.03,
      serviceShare: 0.01,
      wagePremium: 0.05,
      drawShare: 0.2,
    };
  }
  return {
    name,
    bufferMonths: 1 + rng.next() * 6,
    minMarkup: 0.02 + rng.next() * 0.15,
    marketingShare: rng.next() * 0.05,
    rndShare: rng.next() * 0.04,
    serviceShare: rng.next() * 0.015,
    wagePremium: rng.next() * 0.1 - 0.03,
    drawShare: rng.next() * 0.6,
  };
}

export interface BotProfile {
  readonly playerId: string;
  readonly classId: ClassId;
  readonly sector?: SectorId;
  readonly strategy: Strategy;
}

/** Il bot decide i comandi di un tick guardando lo stato (in sola lettura), come farebbe un giocatore. */
export function decide(
  bot: BotProfile,
  state: CityState,
  config: BalanceConfig,
  rng: Rng,
): Command[] {
  const commands: Command[] = [];
  const add = (type: string, payload: unknown) =>
    commands.push({
      id: `${bot.playerId}:${state.tick}:${commands.length}`,
      playerId: bot.playerId,
      type,
      payload,
    });

  const player = state.players[bot.playerId];
  if (player === undefined) {
    add('player.join', {
      classId: bot.classId,
      ...(bot.sector === undefined ? {} : { sector: bot.sector }),
    });
    return commands;
  }

  const ticksPerMonth = config.global.time.ticksPerMonth;
  const monthStart = state.tick % ticksPerMonth === 0;
  const companies = player.companyIds
    .map((id) => state.companies[id])
    .filter((c): c is Company => c?.status === 'active');

  for (const company of companies) {
    manageCompany(bot, company, state, config, add, monthStart);
  }

  if (monthStart) {
    managePersonalFinance(bot, player, companies, state, config, add, rng);
  }
  return commands;
}

type Add = (type: string, payload: unknown) => void;

function manageCompany(
  bot: BotProfile,
  company: Company,
  state: CityState,
  config: BalanceConfig,
  add: Add,
  monthStart: boolean,
): void {
  const { strategy } = bot;
  const sector = company.sector;
  const economics = config.sectors[sector].economics;
  const opPrice = operatorPrice(state, config, sector);
  const price = toCredits(company.price);
  const cash = toCredits(balanceOf(state.ledger, company.account));
  const wage = marketWage(state, config, sector) * (1 + strategy.wagePremium);
  const maxWorkers = config.economy.labour.maxWorkersByLegalForm[company.legalForm];
  const demandRatio = company.capacity > 0 ? company.customers / company.capacity : 2;

  // Costo unitario stimato: input ai prezzi medi di mercato + lavoro + affitto.
  const inputCost = inputRequirements(config, sector).reduce(
    (sum, input) => sum + input.units * state.markets[input.sector].averagePrice,
    0,
  );
  const unitsPerWorker = unitsPerNpcWorkerWeek(config, sector) * Math.max(0.5, company.morale);
  const laborCost = wage / config.global.time.ticksPerMonth / unitsPerWorker;
  const weeklyUnits = Math.max(1, Math.min(company.customers, company.capacity));
  const rentCost =
    (economics.baseRentMonthly * state.macro.costIndex * (1 + company.npcWorkers * 0.1)) /
    config.global.time.ticksPerMonth /
    weeklyUnits;
  const unitCost = inputCost + laborCost + rentCost;

  // Prezzo: sale se la domanda supera la capacità, scende verso il costo + ricarico se manca.
  const floor = unitCost * (1 + strategy.minMarkup);
  const ceiling = opPrice * 0.995;
  let target = price;
  if (demandRatio > 1.1) target = price * 1.02;
  else if (demandRatio < 0.9) target = price * 0.98;
  target = Math.min(ceiling, Math.max(floor, target));
  if (Math.abs(target - price) / price > 0.005) {
    add('company.setPrice', { companyId: company.id, price: round2(target) });
  }

  // Personale: assume se la domanda eccede e la cassa lo permette, riduce se è in eccesso.
  let workers = company.npcWorkers;
  const monthlyPayroll = wage * Math.max(1, workers);
  const unemployed = Math.floor(state.macro.laborForce - state.macro.employment);
  if (demandRatio > 1.2 && workers < maxWorkers && cash > monthlyPayroll * 0.5 && unemployed > 2) {
    workers += Math.min(unemployed - 2, strategy.name === 'aggressive' ? 2 : 1);
  } else if (demandRatio < 0.6 && workers > 1) {
    workers -= 1;
  }
  workers = Math.min(maxWorkers, workers);
  if (workers !== company.npcWorkers || Math.abs(toCredits(company.wage) - wage) / wage > 0.02) {
    add('company.setWorkforce', { companyId: company.id, workers, wage: round2(wage) });
  }

  // Budget come quota del ricavo settimanale; si azzera se la cassa è sotto un mese di salari.
  const weeklyRevenue = toCredits(company.lastMonth.revenue) / config.global.time.ticksPerMonth;
  const healthy = cash > monthlyPayroll;
  const budget = {
    marketing: round2(healthy ? weeklyRevenue * strategy.marketingShare : 0),
    rnd: round2(healthy ? weeklyRevenue * strategy.rndShare : 0),
    training: round2(healthy ? weeklyRevenue * 0.005 : 0),
    service: round2(healthy ? weeklyRevenue * strategy.serviceShare : 0),
  };
  const current = company.budget;
  if (
    monthStart &&
    (Math.abs(toCredits(current.marketing) - budget.marketing) > 1 ||
      Math.abs(toCredits(current.rnd) - budget.rnd) > 1 ||
      Math.abs(toCredits(current.service) - budget.service) > 1 ||
      Math.abs(toCredits(current.training) - budget.training) > 1)
  ) {
    add('company.setBudget', { companyId: company.id, ...budget });
  }
}

function managePersonalFinance(
  bot: BotProfile,
  player: Player,
  companies: Company[],
  state: CityState,
  config: BalanceConfig,
  add: Add,
  rng: Rng,
): void {
  const { strategy } = bot;
  const levels = config.economy.lifestyle.monthlyCostByLevel;
  const living = (levels[player.lifestyleLevel - 1] ?? 0) * state.macro.costIndex;
  const need = living * 1.25;
  let cash = toCredits(balanceOf(state.ledger, player.account));
  const fund = toCredits(balanceOf(state.ledger, player.fundAccount));

  // Il titolare preleva dalla ditta quanto serve per vivere più una quota dell'utile.
  for (const company of companies) {
    if (company.legalForm !== 'sole_proprietorship') continue;
    const companyCash = toCredits(balanceOf(state.ledger, company.account));
    // Riserva: una parte dei costi fissi del mese (salari, affitto); gli input si pagano coi ricavi.
    const economics = config.sectors[company.sector].economics;
    const fixedCosts =
      toCredits(company.wage) * company.npcWorkers +
      economics.baseRentMonthly * state.macro.costIndex * (1 + 0.1 * company.npcWorkers);
    const reserve = fixedCosts * 0.3;
    const profit = Math.max(
      0,
      toCredits(company.lastMonth.revenue) - toCredits(company.lastMonth.costs),
    );
    const wanted = Math.max(0, need - cash) + profit * strategy.drawShare;
    const draw = Math.min(wanted, companyCash - reserve);
    if (draw > 50) {
      add('company.transferCash', {
        companyId: company.id,
        direction: 'withdraw',
        amount: round2(draw),
      });
      cash += draw;
    }
  }

  const hasIncome =
    player.npcJobMonthlyWage > 0 ||
    player.freelanceMonthlyIncome > 0 ||
    companies.length > 0 ||
    player.benefitMonthsLeft > 1;
  if (!hasIncome) add('job.acceptNpc', {});

  // Il capitale dei soci dell'investitore va restituito a scadenza: si disinveste in tempo.
  const bullet = Object.values(state.loans).find(
    (l) => l.borrower.kind === 'player' && l.borrower.id === player.id && l.repayment === 'bullet',
  );
  const reserveForDebt =
    bullet !== undefined && bullet.remainingMonths <= 2 ? toCredits(bullet.principal) * 1.02 : 0;

  const buffer = living * strategy.bufferMonths + reserveForDebt;
  if (cash > buffer + 100) {
    add('fund.invest', { amount: round2(cash - buffer) });
  } else if (cash < buffer * 0.5 && fund > 0) {
    add('fund.redeem', { amount: round2(Math.min(fund, buffer - cash)) });
  }

  // Lo stile di vita sale solo con un buon margine di sicurezza (i prudenti non lo alzano mai).
  const wealth = cash + fund;
  if (
    strategy.name !== 'prudent' &&
    player.lifestyleLevel < 5 &&
    wealth > (levels[player.lifestyleLevel] ?? Infinity) * 24 &&
    rng.chance(0.25)
  ) {
    add('player.setLifestyle', { level: player.lifestyleLevel + 1 });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
