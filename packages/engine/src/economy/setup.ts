import {
  type BalanceConfig,
  type ClassId,
  type CreditRating,
  type LegalForm,
  type SectorId,
  type SkillId,
} from '@business-game/config';
import { openAccount } from '../ledger';
import { ZERO, credits } from '../money';
import type { Rng } from '../rng';
import { type CityState, type Company, type Player, unitsPerNpcWorkerWeek } from '../state';
import type { TickContext } from '../tick';
import { quality } from './market';
import { emptySkills, roleSkillOf, traitEffect, xpForLevel } from './progression';
import { receiveFromOutside } from './settle';

export const playerAccount = (id: string) => `player:${id}`;
export const fundAccount = (id: string) => `fund:${id}`;
export const companyAccount = (id: string) => `company:${id}`;

/**
 * Ingresso di un giocatore con le condizioni di partenza della sua classe (GDD §4.1):
 * liquidità iniziale, eventuali debiti e, per l'imprenditore, la ditta individuale.
 */
export function joinPlayer(
  ctx: TickContext,
  params: { playerId: string; classId: ClassId; sector?: SectorId; role?: string },
): Player {
  const { state, config } = ctx;
  const start = config.classes.classes[params.classId];
  const progression = config.progression;
  const player: Player = {
    id: params.playerId,
    classId: params.classId,
    account: playerAccount(params.playerId),
    fundAccount: fundAccount(params.playerId),
    arrears: ZERO,
    arrearsSinceTick: null,
    joinedTick: ctx.date.tick,
    activeClasses: [params.classId],
    role: params.role ?? null,
    skills: emptySkills(),
    wellbeing: progression.wellbeing.start,
    reputation: progression.reputation.startByClass[params.classId] ?? progression.reputation.start,
    network: 0,
    traits: {},
    study: { skill: null, hours: 0 },
    burnout: false,
    lifestyleLevel: 1,
    npcJob:
      params.classId === 'employee'
        ? { hours: progression.hours.npcJobFullTime, careerLevel: 0, monthsInJob: 0 }
        : null,
    freelance:
      params.classId === 'freelancer'
        ? {
            hours: progression.hours.defaultFreelanceHours,
            monthsActive: 0,
            collaborators: 0,
            productHoursLeft: null,
            royaltyMonthly: 0,
          }
        : null,
    properties: { residential: 0, commercial: 0 },
    creditRating: start.creditRating,
    companyIds: [],
    month: { earnedIncome: ZERO, capitalIncome: ZERO, debtService: ZERO },
    lastMonthIncome: ZERO,
    bankruptcies: 0,
    lastBankruptcyTick: null,
    benefitMonthsLeft: 0,
  };
  // Competenze di partenza (GDD §4.1): quelle fisse della classe e quella del ruolo scelto.
  for (const [skill, level] of Object.entries(start.fixedSkills) as [SkillId, number][]) {
    player.skills[skill] = xpForLevel(config, level);
  }
  const roleSkill = roleSkillOf(config, player);
  if (roleSkill !== null && start.chosenSkillLevel !== null) {
    player.skills[roleSkill] = xpForLevel(config, start.chosenSkillLevel);
  }
  openAccount(state.ledger, player.account);
  openAccount(state.ledger, player.fundAccount);
  state.players[player.id] = player;
  receiveFromOutside(ctx, [{ to: player.account, amount: credits(start.cash) }], 'start:capital');

  // L'imprenditore parte con una ditta individuale: i debiti iniziali sono della ditta e
  // si ammortizzano; quelli delle altre classi (capitale dei soci) si restituiscono a scadenza.
  let borrower: { kind: 'player' | 'company'; id: string } = { kind: 'player', id: player.id };
  if (params.classId === 'entrepreneur') {
    if (params.sector === undefined) {
      throw new Error("L'imprenditore deve scegliere un settore");
    }
    const company = foundCompany(ctx, {
      ownerId: player.id,
      sector: params.sector,
      legalForm: 'sole_proprietorship',
      equipment: start.otherAssets,
      creditRating: start.creditRating,
      rng: ctx.rng('join'),
    });
    borrower = { kind: 'company', id: company.id };
  }
  for (const debt of start.debts) {
    addLoan(state, {
      borrower,
      principal: credits(debt.principal),
      annualRate: debt.annualRate,
      months: debt.termMonths,
      repayment: borrower.kind === 'company' ? 'amortizing' : 'bullet',
      purpose: debt.label,
    });
  }
  return player;
}

export function foundCompany(
  ctx: TickContext,
  params: {
    ownerId: string;
    sector: SectorId;
    legalForm: LegalForm;
    equipment: number;
    creditRating: CreditRating;
    rng: Rng;
  },
): Company {
  const { state, config } = ctx;
  const economics = config.sectors[params.sector].economics;
  const market = config.economy.market;
  state.counters.company += 1;
  const id = `c${state.counters.company}`;
  const workers = config.economy.start.entrepreneurStartingWorkers;
  const location = Math.min(1.6, Math.max(0.6, 1 + market.locationSpread * gaussian(params.rng)));
  const company: Company = {
    id,
    ownerId: params.ownerId,
    sector: params.sector,
    legalForm: params.legalForm,
    status: 'active',
    foundedTick: ctx.date.tick,
    account: companyAccount(id),
    arrears: ZERO,
    arrearsSinceTick: null,
    price: credits(economics.basePrice * config.economy.start.startingPriceMarkup),
    budget: { marketing: ZERO, rnd: ZERO, training: ZERO, service: ZERO },
    npcWorkers: workers,
    wage: credits(economics.npcWageMonthly),
    location,
    brand: market.newCompanyBrand + newCompanyBrandBonus(state, config, params.ownerId),
    rndStock: 0,
    reputation: 1,
    quality: quality({
      baseQuality: market.baseQuality,
      inputQuality: market.operatorQuality,
      inputQualityExponent: market.inputQualityExponent,
      rndStock: 0,
      rndReference: 1,
      rndWeight: market.rndQualityWeight,
    }),
    service: 1,
    inputQuality: market.operatorQuality,
    morale: 1,
    customers: 0,
    satisfaction: 1,
    capacity: workers * unitsPerNpcWorkerWeek(config, params.sector),
    output: 0,
    lastOutput: 0,
    equipment: credits(params.equipment),
    shares: { [params.ownerId]: 1 },
    equityOffer: null,
    creditRating: params.creditRating,
    month: { revenue: ZERO, costs: ZERO, debtService: ZERO },
    lastMonth: { revenue: ZERO, costs: ZERO },
    profitHistory: [],
    lossCarryForward: ZERO,
  };
  // Una ditta nuova parte con una piccola clientela pari alla sua capacità, sottratta
  // all'operatore cittadino: i suoi dipendenti vengono dal lavoro che l'operatore perde
  // (l'occupazione si ricalcola alla chiusura mensile).
  company.customers = company.capacity;
  openAccount(state.ledger, company.account);
  state.companies[id] = company;
  state.players[params.ownerId]?.companyIds.push(id);
  return company;
}

/** Il tratto "Fondatore di successo" porta parte del brand nelle nuove aziende (GDD §5.3). */
function newCompanyBrandBonus(state: CityState, config: BalanceConfig, ownerId: string): number {
  const owner = state.players[ownerId];
  return owner === undefined ? 0 : 3 * traitEffect(config, owner, 'successful_founder');
}

export function addLoan(
  state: CityState,
  params: {
    borrower: { kind: 'player' | 'company'; id: string };
    principal: ReturnType<typeof credits>;
    annualRate: number;
    months: number;
    repayment: 'amortizing' | 'bullet';
    purpose: string;
    lenderId?: string;
  },
): string {
  state.counters.loan += 1;
  const id = `l${state.counters.loan}`;
  state.loans[id] = {
    id,
    borrower: params.borrower,
    principal: params.principal,
    annualRate: params.annualRate,
    remainingMonths: params.months,
    repayment: params.repayment,
    purpose: params.purpose,
    ...(params.lenderId === undefined ? {} : { lenderId: params.lenderId, monthsInDefault: 0 }),
  };
  return id;
}

/** Normale standard (Box–Muller) dal generatore con seed. */
export function gaussian(rng: Rng): number {
  const u = Math.max(rng.next(), 1e-12);
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function maxWorkers(config: BalanceConfig, legalForm: LegalForm): number {
  return config.economy.labour.maxWorkersByLegalForm[legalForm];
}
