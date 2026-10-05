import type { BalanceConfig, ClassId, SectorId, SkillId } from '@business-game/config';
import {
  type Amount,
  type CityState,
  type Command,
  type Company,
  type Player,
  type Rng,
  balanceOf,
  companyValue,
  committedHours,
  hasClass,
  hourLimit,
  inputRequirements,
  investmentAssets,
  investorLevel,
  npcJobWage,
  capRate,
  lendingRate,
  rentalMarket,
  requiredEquipment,
  roleSkillOf,
  skillLevel,
  unitPrice,
  unitRent,
  unlockBlocker,
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
  readonly role?: string;
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
      ...(bot.role === undefined ? {} : { role: bot.role }),
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
    (economics.baseRentMonthly * state.macro.costIndex * (1 + company.npcWorkers * 0.2)) /
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
  const step = Math.min(unemployed - 2, strategy.name === 'aggressive' ? 2 : 1);
  // Assumere richiede le attrezzature per i nuovi lavoratori, pagate dalla cassa.
  const equipment = toCredits(company.equipment);
  const capexForHire = Math.max(
    0,
    requiredEquipment(state, config, sector, workers + Math.max(1, step)) - equipment,
  );
  const canAffordHire = cash > monthlyPayroll * 0.5 + capexForHire;
  if (demandRatio > 1.2 && workers < maxWorkers && canAffordHire && step > 0) {
    workers += step;
  } else if (demandRatio < 0.6 && workers > 1) {
    workers -= 1;
  }
  workers = Math.min(maxWorkers, workers);
  if (workers !== company.npcWorkers || Math.abs(toCredits(company.wage) - wage) / wage > 0.02) {
    add('company.setWorkforce', { companyId: company.id, workers, wage: round2(wage) });
  }

  // Crescita a credito: se la domanda supera la capacità e mancano i soldi per le attrezzature,
  // chiede un prestito in banca (le rate restano entro il limite rispetto ai ricavi).
  if (
    monthStart &&
    demandRatio > 1.2 &&
    !canAffordHire &&
    workers < maxWorkers &&
    capexForHire > 0 &&
    company.creditRating !== 'D' &&
    strategy.name !== 'prudent'
  ) {
    add('loan.request', {
      companyId: company.id,
      amount: round2(capexForHire + monthlyPayroll * 0.5),
      months: 36,
    });
  }

  // Manutenzione: riacquista le attrezzature consumate se la cassa lo permette.
  const shortfall = requiredEquipment(state, config, sector, company.npcWorkers) - equipment;
  if (monthStart && shortfall > 0 && cash > shortfall + monthlyPayroll) {
    add('company.buyEquipment', { companyId: company.id, amount: round2(shortfall) });
  }

  // Le società che vorrebbero crescere ma non hanno capitale vendono quote agli investitori.
  if (
    monthStart &&
    company.legalForm !== 'sole_proprietorship' &&
    company.equityOffer === null &&
    demandRatio > 1.2 &&
    !canAffordHire &&
    (company.shares[company.ownerId] ?? 0) * 0.85 >= 0.5
  ) {
    const value = toCredits(companyValue(state, config, company));
    const price = Math.max(5000, value * 0.15 * 0.95);
    add('equity.offer', { companyId: company.id, share: 0.15, price: round2(price) });
  }

  // Budget come quota del ricavo settimanale; si azzera se la cassa è sotto un mese di salari.
  // I budget si calcolano sul margine lordo: nei settori ad alto volume il fatturato inganna.
  const grossMargin = Math.max(0, (price - unitCost) / price);
  const weeklyRevenue =
    (toCredits(company.lastMonth.revenue) / config.global.time.ticksPerMonth) * grossMargin * 4;
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

  // Il titolare preleva quanto serve per vivere più una quota dell'utile:
  // dalla ditta con un prelievo, dalle società con un dividendo.
  for (const company of companies) {
    const companyCash = toCredits(balanceOf(state.ledger, company.account));
    // Riserva: una parte dei costi fissi del mese (salari, affitto); gli input si pagano coi ricavi.
    const economics = config.sectors[company.sector].economics;
    const fixedCosts =
      toCredits(company.wage) * company.npcWorkers +
      economics.baseRentMonthly * state.macro.costIndex * (1 + 0.2 * company.npcWorkers);
    const reserve = fixedCosts * 0.3;
    const profit = Math.max(
      0,
      toCredits(company.lastMonth.revenue) - toCredits(company.lastMonth.costs),
    );
    const wanted = Math.max(0, need - cash) + profit * strategy.drawShare;
    const draw = Math.min(wanted, companyCash - reserve);
    if (draw > 50) {
      if (company.legalForm === 'sole_proprietorship') {
        add('company.transferCash', {
          companyId: company.id,
          direction: 'withdraw',
          amount: round2(draw),
        });
      } else {
        add('company.payDividend', { companyId: company.id, amount: round2(draw) });
      }
      cash += draw;
    }
  }

  const hasIncome =
    player.npcJob !== null ||
    player.freelance !== null ||
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

  cash = manageCareer(bot, player, companies, state, config, add, rng, cash, buffer, fund);

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

/** Obiettivo di studio per classe: la competenza che sblocca il prossimo passo di carriera. */
function studyTarget(config: BalanceConfig, player: Player, strategy: Strategy): SkillId | null {
  const level = (skill: SkillId) => skillLevel(config, player, skill);
  const role = roleSkillOf(config, player);
  const goals: [SkillId, number][] = [];
  // Chi punta in alto prepara presto la strada d'impresa (Gestione per lo sblocco).
  if (strategy.name !== 'prudent' && !hasClass(player, 'entrepreneur')) {
    goals.push(['management', config.progression.unlock.entrepreneur.management]);
  }
  if (hasClass(player, 'employee') && role !== null) goals.push([role, 7], ['management', 7]);
  if (hasClass(player, 'freelancer') && role !== null) goals.push([role, 8], ['management', 3]);
  if (hasClass(player, 'entrepreneur')) goals.push(['management', 6], ['commercial', 6]);
  if (hasClass(player, 'investor')) goals.push(['finance', 8]);
  goals.push(['finance', 3], ['management', 3]);
  const next = goals.find(([skill, target]) => level(skill) < target);
  return next?.[0] ?? null;
}

/**
 * Carriera: studio, salti di classe, crescita dell'attività, investimenti. Restituisce la
 * liquidità rimasta dopo gli impegni presi in questo turno.
 */
function manageCareer(
  bot: BotProfile,
  player: Player,
  companies: Company[],
  state: CityState,
  config: BalanceConfig,
  add: Add,
  rng: Rng,
  available: number,
  buffer: number,
  fund: number,
): number {
  const { strategy } = bot;
  let cash = available;
  const p = config.progression;

  // Studio: le ore libere, con un margine che dipende dalla propensione al rischio e dal benessere.
  const target = studyTarget(config, player, strategy);
  const free =
    hourLimit(config, player) -
    committedHours(state, config, player) +
    player.study.hours -
    (strategy.name === 'aggressive' ? 0 : 60);
  const hours =
    target === null || player.wellbeing < 45 ? 0 : Math.max(0, Math.floor(free / 10) * 10);
  const studyCost = hours * p.skills.studyCostPerHour * state.macro.costIndex;
  if (target !== null && cash > studyCost + buffer * 0.5) {
    if (hours !== player.study.hours || target !== player.study.skill) {
      add('skill.setStudy', { skill: target, hours });
    }
    cash -= studyCost;
  } else if (player.study.hours > 0) {
    add('skill.setStudy', { skill: player.study.skill ?? 'management', hours: 0 });
  }

  // Salti di classe.
  const wantsBusiness =
    strategy.name === 'aggressive' || (strategy.name === 'random' && rng.chance(0.5));
  if (
    !hasClass(player, 'entrepreneur') &&
    wantsBusiness &&
    unlockBlocker(state, config, player, 'entrepreneur') === null &&
    cash > p.unlock.entrepreneur.cash + buffer
  ) {
    add('class.unlock', { classId: 'entrepreneur' });
    const sector = STARTERS[Math.floor(rng.next() * STARTERS.length)] as SectorId;
    const capital = p.careers.entrepreneur.soleProprietorshipCapital * 1.5;
    add('company.found', { sector, legalForm: 'sole_proprietorship', capital });
    cash -= capital;
  }
  if (!hasClass(player, 'investor') && unlockBlocker(state, config, player, 'investor') === null) {
    add('class.unlock', { classId: 'investor' });
  }

  // Quando l'attività rende più dello stipendio, il dipendente passa al part-time e poi si licenzia.
  if (player.npcJob !== null && companies.length > 0) {
    const profit = companies.reduce(
      (sum, c) => sum + Math.max(0, toCredits(c.lastMonth.revenue) - toCredits(c.lastMonth.costs)),
      0,
    );
    const wage = npcJobWage(state, config, player);
    if (profit > wage * 1.5 && player.npcJob.hours < p.hours.npcJobFullTime) {
      add('job.quitNpc', {});
    } else if (profit > wage * 0.7 && player.npcJob.hours === p.hours.npcJobFullTime) {
      add('job.quitNpc', {});
      add('job.acceptNpc', { partTime: true });
    }
  }

  // Libero professionista: studio associato e prodotto quando le competenze lo permettono.
  const practice = player.freelance;
  if (practice !== null) {
    if (
      practice.collaborators < p.careers.freelancer.maxCollaborators &&
      skillLevel(config, player, 'management') >= p.careers.freelancer.studioManagement
    ) {
      add('freelance.setCollaborators', { count: practice.collaborators + 1 });
    }
    const role = roleSkillOf(config, player);
    if (
      practice.productHoursLeft === null &&
      practice.royaltyMonthly === 0 &&
      role !== null &&
      skillLevel(config, player, role) >= p.careers.freelancer.productSkill
    ) {
      add('freelance.startProduct', {});
    }
    if (practice.hours === 0 && hasClass(player, 'freelancer')) {
      const room = hourLimit(config, player) - committedHours(state, config, player) - 40;
      if (room >= 40) add('freelance.setHours', { hours: Math.min(120, room) });
    }
  }

  // Imprenditore: la ditta diventa SRL, poi SPA; con capitale si apre una seconda azienda.
  const management = skillLevel(config, player, 'management');
  const e = p.careers.entrepreneur;
  for (const company of companies) {
    const companyCash = toCredits(balanceOf(state.ledger, company.account));
    if (
      company.legalForm === 'sole_proprietorship' &&
      management >= e.srlManagement &&
      companyCash > e.srlCapital
    ) {
      add('company.incorporate', { companyId: company.id, legalForm: 'srl' });
    } else if (
      company.legalForm === 'srl' &&
      management >= e.spaManagement &&
      companyCash + toCredits(company.equipment) > e.spaCapital &&
      company.profitHistory.filter((x) => x > 0).length >= e.spaProfitableMonths
    ) {
      add('company.incorporate', { companyId: company.id, legalForm: 'spa' });
    }
  }
  if (
    hasClass(player, 'entrepreneur') &&
    companies.length > 0 &&
    companies.length < (strategy.name === 'aggressive' ? 3 : 2) &&
    management >= e.srlManagement &&
    cash > e.srlCapital * 1.5 + buffer &&
    player.wellbeing > 55
  ) {
    const owned = new Set(companies.map((c) => c.sector));
    const options = GROWTH_SECTORS.filter((s) => !owned.has(s));
    const sector = options[Math.floor(rng.next() * options.length)];
    if (sector !== undefined) {
      add('company.found', { sector, legalForm: 'srl', capital: e.srlCapital * 1.5 });
      cash -= e.srlCapital * 1.5;
    }
  }

  // Investitore: immobili se rendono più del fondo, prestiti agli altri giocatori.
  if (hasClass(player, 'investor')) {
    const level = p.careers.investor[investorLevel(state, config, player)];
    const owned = player.properties.residential + player.properties.commercial;
    const investable = cash + fund - buffer;
    for (const kind of ['residential', 'commercial'] as const) {
      const price = unitPrice(state, config, kind) * (1 + p.realEstate.transactionFee);
      const market = rentalMarket(state, config, kind);
      // Occupazione attesa aggiungendo un'unità al mercato.
      const occupancy = market.demand > 0 ? Math.min(1, market.demand / (market.supply + 1)) : 0;
      const yieldRate =
        (unitRent(state, config, kind) *
          12 *
          (1 - p.realEstate.maintenanceShare) *
          Math.max(0.5, occupancy)) /
        price;
      const fundRate = state.macro.policyRate + config.economy.indexFund.equityPremium;
      if (
        yieldRate > fundRate * 0.9 &&
        occupancy > 0.95 &&
        owned < (level?.maxPropertyUnits ?? 0) &&
        investable > price
      ) {
        if (cash < price + buffer) {
          add('fund.redeem', { amount: round2(Math.min(fund, price + buffer - cash)) });
          cash = price + buffer;
        }
        add('property.buy', { kind, units: 1 });
        cash -= price;
        break;
      }
    }
    // Quote delle società: rendimento sull'utile oppure crescita forte (logica da venture capital).
    const allocation =
      strategy.name === 'aggressive' ? 0.6 : strategy.name === 'random' ? 0.4 : 0.25;
    const candidates = Object.values(state.companies)
      .filter((c) => c.equityOffer !== null && c.status === 'active' && c.ownerId !== player.id)
      .map((company) => {
        const history = company.profitHistory.map((x) => x / 100);
        const recent = average(history.slice(-3));
        const before = average(history.slice(-6, -3));
        const growth = history.length >= 6 && before > 0 ? recent / before - 1 : 0;
        const offer = company.equityOffer as { share: number; price: Amount };
        const earningsYield = (recent * 12 * offer.share) / toCredits(offer.price);
        return { company, offer, growth, earningsYield, recent };
      })
      .filter((c) => c.recent > 0 && (c.earningsYield >= 0.12 || c.growth > 0.15))
      .sort((a, b) => b.growth + b.earningsYield - (a.growth + a.earningsYield));
    const pickedOffer = candidates[0];
    if (pickedOffer !== undefined) {
      const price = toCredits(pickedOffer.offer.price);
      const budget = (cash + fund - buffer) * allocation;
      const share =
        Math.floor(
          Math.min(pickedOffer.offer.share, (pickedOffer.offer.share * budget) / price) * 10_000,
        ) / 10_000;
      // Più investitori nello stesso turno: ognuno prova solo una parte delle volte.
      if (share >= 0.005 && rng.chance(0.5)) {
        const cost = (price * share) / pickedOffer.offer.share;
        if (cash < cost + buffer) {
          add('fund.redeem', { amount: round2(Math.min(fund, cost + buffer - cash)) });
          cash = cost + buffer;
        }
        add('equity.buy', { companyId: pickedOffer.company.id, share });
        cash -= cost;
      }
    }

    // Leva: i più aggressivi si indebitano sul portafoglio quando gli immobili rendono più del tasso.
    const portfolioRate = lendingRate(state, config, player.creditRating);
    const assets = toCredits(investmentAssets(state, config, player.id));
    const debt = Object.values(state.loans)
      .filter((l) => l.borrower.kind === 'player' && l.borrower.id === player.id)
      .reduce((sum, l) => sum + toCredits(l.principal), 0);
    const room = assets * config.progression.peerLending.portfolioLoanToValue - debt;
    if (
      strategy.name !== 'prudent' &&
      portfolioRate !== null &&
      portfolioRate < capRate(state, config) &&
      room > 5000
    ) {
      add('loan.portfolio', { amount: round2(room * 0.8), months: 60 });
      cash += room * 0.8;
    }

    const myOffers = Object.values(state.loanOffers).filter((o) => o.lenderId === player.id);
    const lendable = Math.min(level?.maxPeerLoan ?? 0, (cash + fund - buffer) * 0.3);
    if (myOffers.length === 0 && lendable > 2000) {
      const rate = (lendingRate(state, config, 'BBB') ?? 0.06) - 0.005;
      add('loan.offer', {
        amount: round2(lendable),
        annualRate: round2(rate * 1000) / 1000,
        months: 36,
      });
    }
  }

  // Chi ha bisogno di capitale (imprenditori pronti a crescere) prende il prestito più economico.
  if (hasClass(player, 'entrepreneur') && companies.length > 0 && cash < e.srlCapital) {
    const ownRate = lendingRate(state, config, player.creditRating);
    const offers = Object.values(state.loanOffers)
      .filter((o) => o.lenderId !== player.id && (ownRate === null || o.annualRate < ownRate))
      .sort((a, b) => a.annualRate - b.annualRate);
    const best = offers[0];
    const income = toCredits(player.lastMonthIncome);
    const amountWanted = Math.min(toCredits(best?.available ?? (0 as never)), income * 6);
    if (best !== undefined && amountWanted > 1000) {
      add('loan.acceptOffer', { offerId: best.id, amount: round2(amountWanted) });
      cash += amountWanted;
    }
  }
  return cash;
}

const STARTERS: readonly SectorId[] = ['logistics', 'technology', 'retail', 'food_service'];
const GROWTH_SECTORS: readonly SectorId[] = [
  'raw_materials',
  'manufacturing',
  'construction',
  'logistics',
  'technology',
  'retail',
  'food_service',
];

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
