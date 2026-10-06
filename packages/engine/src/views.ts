import {
  type BalanceConfig,
  CLASS_IDS,
  type ClassId,
  SKILL_IDS,
  type SectorId,
  type SkillId,
} from '@business-game/config';
import { balanceOf } from './ledger';
import { toCredits } from './money';
import type {
  AutopilotRules,
  CityState,
  Company,
  MonthlyReport,
  Player,
  PublicReport,
  TraitId,
} from './state';
import { lendingRate, monthlyDebtService } from './economy/finance';
import {
  careerLevelId,
  committedHours,
  freelanceRate,
  hasClass,
  hourLimit,
  investorLevel,
  npcJobWage,
  skillLevel,
  unlockBlocker,
  xpForLevel,
} from './economy/progression';
import { rentalMarket, unitPrice, unitRent } from './economy/realEstate';
import { operatorPrice, requiredEquipment } from './economy/sector';
import { companyValue, economicValue, netWorth, passiveMonthlyCashflow } from './economy/valuation';

/**
 * Vista del giocatore (GDD §17): solo ciò che può vedere. I dati riservati degli altri giocatori
 * (liquidità, prezzi e bilanci delle loro aziende in tempo reale) non escono mai dal server.
 */
export interface PlayerView {
  readonly tick: number;
  readonly date: { year: number; month: number; week: number; monthIndex: number };
  readonly seasonMonths: number;
  readonly player: PlayerSummary;
  readonly companies: readonly CompanyView[];
  readonly holdings: readonly HoldingView[];
  readonly loans: readonly LoanView[];
  readonly market: PublicReport | null;
  readonly operatorPrices: Readonly<Record<SectorId, number>>;
  readonly offers: {
    readonly loans: readonly LoanOfferView[];
    readonly equity: readonly EquityOfferView[];
  };
  readonly realEstate: Readonly<
    Record<'residential' | 'commercial', { price: number; rent: number; occupancy: number }>
  >;
  readonly ranking: {
    readonly top: readonly RankingRow[];
    readonly me: RankingRow | null;
    readonly total: number;
  };
  readonly report: MonthlyReport | null;
  readonly cards: readonly DecisionCard[];
}

export interface PlayerSummary {
  readonly id: string;
  readonly classId: ClassId;
  readonly activeClasses: readonly ClassId[];
  readonly role: string | null;
  readonly lifestyleLevel: number;
  readonly wellbeing: number;
  readonly reputation: number;
  readonly network: number;
  readonly burnout: boolean;
  readonly creditRating: string;
  readonly bankLoanRate: number | null;
  readonly cash: number;
  readonly fund: number;
  readonly netWorth: number;
  readonly economicValue: number;
  readonly passiveMonthly: number;
  readonly monthlyDebtService: number;
  readonly lastMonthIncome: number;
  readonly hours: { readonly committed: number; readonly limit: number; readonly base: number };
  readonly study: { readonly skill: SkillId | null; readonly hours: number };
  readonly skills: Readonly<
    Record<SkillId, { level: number; xp: number; nextLevelXp: number | null }>
  >;
  readonly traits: Readonly<Partial<Record<TraitId, number>>>;
  readonly job: {
    readonly level: string | null;
    readonly hours: number;
    readonly monthlyWage: number;
    readonly monthsInJob: number;
  } | null;
  readonly freelance: {
    readonly hours: number;
    readonly hourlyRate: number;
    readonly monthsActive: number;
    readonly collaborators: number;
    readonly productHoursLeft: number | null;
    readonly royaltyMonthly: number;
  } | null;
  readonly properties: { readonly residential: number; readonly commercial: number };
  readonly investorLevel: number;
  readonly unlocks: Readonly<Record<ClassId, string | null>>;
  readonly autopilot: AutopilotRules;
}

export interface CompanyView {
  readonly id: string;
  readonly sector: SectorId;
  readonly legalForm: string;
  readonly status: string;
  readonly price: number;
  readonly operatorPrice: number;
  readonly budget: { marketing: number; rnd: number; training: number; service: number };
  readonly workers: number;
  readonly targetWorkers: number;
  readonly wage: number;
  readonly marketWage: number;
  readonly capacity: number;
  readonly customers: number;
  readonly satisfaction: number;
  readonly quality: number;
  readonly brand: number;
  readonly reputation: number;
  readonly morale: number;
  readonly cash: number;
  readonly equipment: number;
  readonly requiredEquipment: number;
  readonly arrears: number;
  readonly creditRating: string;
  readonly lastMonth: { revenue: number; costs: number; profit: number };
  readonly profitHistory: readonly number[];
  readonly value: number;
  readonly myShare: number;
  readonly equityOffer: { share: number; price: number } | null;
}

export interface HoldingView {
  readonly companyId: string;
  readonly sector: SectorId;
  readonly legalForm: string;
  readonly share: number;
  readonly estimatedValue: number;
}

export interface LoanView {
  readonly id: string;
  readonly role: 'borrower' | 'lender';
  readonly principal: number;
  readonly annualRate: number;
  readonly remainingMonths: number;
  readonly purpose: string;
  readonly monthsInDefault: number;
}

export interface LoanOfferView {
  readonly id: string;
  readonly lenderId: string;
  readonly available: number;
  readonly annualRate: number;
  readonly months: number;
  readonly mine: boolean;
}

/** Dati che il titolare comunica agli investitori quando mette in vendita delle quote. */
export interface EquityOfferView {
  readonly companyId: string;
  readonly sector: SectorId;
  readonly legalForm: string;
  readonly share: number;
  readonly price: number;
  readonly averageMonthlyProfit: number;
  readonly mine: boolean;
}

export interface RankingRow {
  readonly position: number;
  readonly playerId: string;
  readonly classId: ClassId;
  readonly value: number;
}

export interface DecisionCard {
  readonly id: string;
  readonly severity: 'urgent' | 'important' | 'tip';
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
  /** Comando suggerito, che la web app propone con un clic. */
  readonly suggestion?: { readonly type: string; readonly payload: unknown };
}

const TOP_RANKING = 20;

export function buildPlayerView(
  state: CityState,
  config: BalanceConfig,
  playerId: string,
): PlayerView | null {
  const player = state.players[playerId];
  if (player === undefined) return null;
  const ticksPerMonth = config.global.time.ticksPerMonth;
  const monthIndex = Math.floor(state.tick / ticksPerMonth);
  const companies = Object.values(state.companies).filter((c) => c.ownerId === playerId);

  const operatorPrices = Object.fromEntries(
    Object.keys(state.markets).map((s) => [s, round2(operatorPrice(state, config, s as SectorId))]),
  ) as Record<SectorId, number>;

  const top = state.ranking.slice(0, TOP_RANKING).map((r, i) => rankingRow(state, r, i + 1));
  const myIndex = state.ranking.findIndex((r) => r.playerId === playerId);
  const me =
    myIndex >= 0
      ? rankingRow(
          state,
          state.ranking[myIndex] as { playerId: string; value: number },
          myIndex + 1,
        )
      : null;

  const view: Omit<PlayerView, 'cards'> = {
    tick: state.tick,
    date: {
      year: Math.floor(monthIndex / 12) + 1,
      month: (monthIndex % 12) + 1,
      week: (state.tick % ticksPerMonth) + 1,
      monthIndex,
    },
    seasonMonths: config.global.time.monthsPerSeason,
    player: summary(state, config, player),
    companies: companies.map((c) => companyView(state, config, c, playerId)),
    holdings: Object.values(state.companies)
      .filter((c) => c.ownerId !== playerId && (c.shares[playerId] ?? 0) > 0)
      .map((c) => ({
        companyId: c.id,
        sector: c.sector,
        legalForm: c.legalForm,
        share: round4(c.shares[playerId] ?? 0),
        estimatedValue: Math.round(
          toCredits(companyValue(state, config, c)) * (c.shares[playerId] ?? 0),
        ),
      })),
    loans: Object.values(state.loans).flatMap((loan) => {
      const borrowerOwner =
        loan.borrower.kind === 'player'
          ? loan.borrower.id
          : state.companies[loan.borrower.id]?.ownerId;
      const role =
        borrowerOwner === playerId ? 'borrower' : loan.lenderId === playerId ? 'lender' : null;
      return role === null
        ? []
        : [
            {
              id: loan.id,
              role,
              principal: Math.round(toCredits(loan.principal)),
              annualRate: loan.annualRate,
              remainingMonths: loan.remainingMonths,
              purpose: loan.purpose,
              monthsInDefault: loan.monthsInDefault ?? 0,
            } satisfies LoanView,
          ];
    }),
    market: state.publicReport,
    operatorPrices,
    offers: {
      loans: Object.values(state.loanOffers).map((o) => ({
        id: o.id,
        lenderId: o.lenderId,
        available: Math.round(toCredits(o.available)),
        annualRate: o.annualRate,
        months: o.months,
        mine: o.lenderId === playerId,
      })),
      equity: Object.values(state.companies)
        .filter((c) => c.status === 'active' && c.equityOffer !== null)
        .map((c) => ({
          companyId: c.id,
          sector: c.sector,
          legalForm: c.legalForm,
          share: round4(c.equityOffer?.share ?? 0),
          price: Math.round(toCredits(c.equityOffer?.price ?? (0 as never))),
          averageMonthlyProfit: Math.round(average(c.profitHistory.slice(-6)) / 100),
          mine: c.ownerId === playerId,
        })),
    },
    realEstate: {
      residential: realEstateView(state, config, 'residential'),
      commercial: realEstateView(state, config, 'commercial'),
    },
    ranking: { top, me, total: state.ranking.length },
    report: player.report,
  };
  return { ...view, cards: decisionCards(state, config, player, view) };
}

function summary(state: CityState, config: BalanceConfig, player: Player): PlayerSummary {
  const skills = Object.fromEntries(
    SKILL_IDS.map((skill) => {
      const level = skillLevel(config, player, skill);
      const next =
        level >= config.progression.skills.maxLevel ? null : xpForLevel(config, level + 1);
      return [skill, { level, xp: Math.floor(player.skills[skill]), nextLevelXp: next }];
    }),
  ) as Record<SkillId, { level: number; xp: number; nextLevelXp: number | null }>;
  const unlocks = Object.fromEntries(
    CLASS_IDS.map((c) => [c, hasClass(player, c) ? null : unlockBlocker(state, config, player, c)]),
  ) as Record<ClassId, string | null>;
  return {
    id: player.id,
    classId: player.classId,
    activeClasses: player.activeClasses,
    role: player.role,
    lifestyleLevel: player.lifestyleLevel,
    wellbeing: Math.round(player.wellbeing),
    reputation: Math.round(player.reputation),
    network: player.network,
    burnout: player.burnout,
    creditRating: player.creditRating,
    bankLoanRate: lendingRate(state, config, player.creditRating),
    cash: round2(toCredits(balanceOf(state.ledger, player.account))),
    fund: round2(toCredits(balanceOf(state.ledger, player.fundAccount))),
    netWorth: Math.round(toCredits(netWorth(state, config, player.id))),
    economicValue: Math.round(toCredits(economicValue(state, config, player.id))),
    passiveMonthly: Math.round(toCredits(passiveMonthlyCashflow(state, config, player.id))),
    monthlyDebtService: Math.round(toCredits(monthlyDebtService(state, 'player', player.id))),
    lastMonthIncome: Math.round(toCredits(player.lastMonthIncome)),
    hours: {
      committed: committedHours(state, config, player),
      limit: hourLimit(config, player),
      base: config.global.time.hoursPerMonth,
    },
    study: player.study,
    skills,
    traits: player.traits,
    job:
      player.npcJob === null
        ? null
        : {
            level: careerLevelId(config, player),
            hours: player.npcJob.hours,
            monthlyWage: Math.round(npcJobWage(state, config, player)),
            monthsInJob: player.npcJob.monthsInJob,
          },
    freelance:
      player.freelance === null
        ? null
        : {
            hours: player.freelance.hours,
            hourlyRate: round2(freelanceRate(state, config, player)),
            monthsActive: player.freelance.monthsActive,
            collaborators: player.freelance.collaborators,
            productHoursLeft: player.freelance.productHoursLeft,
            royaltyMonthly: Math.round(player.freelance.royaltyMonthly),
          },
    properties: player.properties,
    investorLevel: investorLevel(state, config, player),
    unlocks,
    autopilot: player.autopilot,
  };
}

function companyView(
  state: CityState,
  config: BalanceConfig,
  company: Company,
  playerId: string,
): CompanyView {
  const revenue = toCredits(company.lastMonth.revenue);
  const costs = toCredits(company.lastMonth.costs);
  return {
    id: company.id,
    sector: company.sector,
    legalForm: company.legalForm,
    status: company.status,
    price: toCredits(company.price),
    operatorPrice: round2(operatorPrice(state, config, company.sector)),
    budget: {
      marketing: toCredits(company.budget.marketing),
      rnd: toCredits(company.budget.rnd),
      training: toCredits(company.budget.training),
      service: toCredits(company.budget.service),
    },
    workers: company.npcWorkers,
    targetWorkers: company.targetWorkers,
    wage: toCredits(company.wage),
    marketWage: round2(
      config.sectors[company.sector].economics.npcWageMonthly * state.macro.costIndex,
    ),
    capacity: Math.round(company.capacity),
    customers: Math.round(company.customers),
    satisfaction: round2(company.satisfaction),
    quality: round2(company.quality),
    brand: round2(company.brand),
    reputation: round2(company.reputation),
    morale: round2(company.morale),
    cash: round2(toCredits(balanceOf(state.ledger, company.account))),
    equipment: Math.round(toCredits(company.equipment)),
    requiredEquipment: Math.round(
      requiredEquipment(state, config, company.sector, company.npcWorkers),
    ),
    arrears: round2(toCredits(company.arrears)),
    creditRating: company.creditRating,
    lastMonth: {
      revenue: Math.round(revenue),
      costs: Math.round(costs),
      profit: Math.round(revenue - costs),
    },
    profitHistory: company.profitHistory.map((p) => Math.round(p / 100)),
    value: Math.round(toCredits(companyValue(state, config, company))),
    myShare: round4(company.shares[playerId] ?? 0),
    equityOffer:
      company.equityOffer === null
        ? null
        : {
            share: round4(company.equityOffer.share),
            price: Math.round(toCredits(company.equityOffer.price)),
          },
  };
}

function realEstateView(
  state: CityState,
  config: BalanceConfig,
  kind: 'residential' | 'commercial',
) {
  return {
    price: Math.round(unitPrice(state, config, kind)),
    rent: round2(unitRent(state, config, kind)),
    occupancy: round2(rentalMarket(state, config, kind).occupancy),
  };
}

function rankingRow(
  state: CityState,
  row: { playerId: string; value: number },
  position: number,
): RankingRow {
  return {
    position,
    playerId: row.playerId,
    classId: state.players[row.playerId]?.classId ?? 'employee',
    value: row.value,
  };
}

/**
 * Carte decisione (GDD §19.2): le 3–5 cose più importanti da decidere ora, con un comando
 * suggerito quando c'è una mossa ovvia.
 */
export function decisionCards(
  state: CityState,
  config: BalanceConfig,
  player: Player,
  view: Omit<PlayerView, 'cards'>,
): DecisionCard[] {
  const cards: DecisionCard[] = [];
  const living =
    (config.economy.lifestyle.monthlyCostByLevel[player.lifestyleLevel - 1] ?? 0) *
    state.macro.costIndex;

  for (const company of view.companies) {
    if (company.status !== 'active') continue;
    if (company.customers > company.capacity * 1.2) {
      cards.push({
        id: `capacity:${company.id}`,
        severity: 'important',
        key: 'card.demandOverCapacity',
        params: { company: company.id, customers: company.customers, capacity: company.capacity },
        suggestion: {
          type: 'company.setWorkforce',
          payload: { companyId: company.id, workers: company.workers + 1, wage: company.wage },
        },
      });
    } else if (company.customers < company.capacity * 0.6 && company.workers > 1) {
      cards.push({
        id: `idle:${company.id}`,
        severity: 'important',
        key: 'card.idleCapacity',
        params: { company: company.id, customers: company.customers, capacity: company.capacity },
        suggestion: {
          type: 'company.setPrice',
          payload: { companyId: company.id, price: round2(company.price * 0.97) },
        },
      });
    }
    if (company.cash < company.wage * company.workers) {
      cards.push({
        id: `cash:${company.id}`,
        severity: 'urgent',
        key: 'card.companyLowCash',
        params: {
          company: company.id,
          cash: Math.round(company.cash),
          payroll: Math.round(company.wage * company.workers),
        },
      });
    }
    if (company.equipment < company.requiredEquipment * 0.9) {
      const missing = company.requiredEquipment - company.equipment;
      cards.push({
        id: `equipment:${company.id}`,
        severity: 'important',
        key: 'card.equipmentWorn',
        params: { company: company.id, missing: Math.round(missing) },
        suggestion: {
          type: 'company.buyEquipment',
          payload: { companyId: company.id, amount: Math.round(missing) },
        },
      });
    }
    if (company.morale < 0.9) {
      cards.push({
        id: `morale:${company.id}`,
        severity: 'important',
        key: 'card.lowWages',
        params: { company: company.id, wage: company.wage, marketWage: company.marketWage },
        suggestion: {
          type: 'company.setWorkforce',
          payload: { companyId: company.id, workers: company.workers, wage: company.marketWage },
        },
      });
    }
  }

  if (view.player.cash < living) {
    cards.push({
      id: 'personal:cash',
      severity: 'urgent',
      key: 'card.personalLowCash',
      params: { cash: Math.round(view.player.cash), living: Math.round(living) },
    });
  }
  if (player.wellbeing < 45) {
    cards.push({
      id: 'personal:wellbeing',
      severity: 'urgent',
      key: 'card.lowWellbeing',
      params: { wellbeing: Math.round(player.wellbeing) },
    });
  }
  const free = view.player.hours.base - view.player.hours.committed;
  if (player.study.hours === 0 && free >= 20 && player.wellbeing >= 45) {
    cards.push({
      id: 'study',
      severity: 'tip',
      key: 'card.planStudy',
      params: { hours: Math.floor(free / 10) * 10 },
      suggestion: {
        type: 'skill.setStudy',
        payload: {
          skill: suggestedSkill(config, player),
          hours: Math.min(40, Math.floor(free / 10) * 10),
        },
      },
    });
  }
  for (const classId of CLASS_IDS) {
    if (
      view.player.unlocks[classId] === null &&
      !hasClass(player, classId) &&
      classId !== 'employee'
    ) {
      cards.push({
        id: `unlock:${classId}`,
        severity: 'tip',
        key: 'card.unlockAvailable',
        params: { classId },
        suggestion: { type: 'class.unlock', payload: { classId } },
      });
    }
  }
  if (
    player.npcJob === null &&
    player.freelance === null &&
    view.companies.every((c) => c.status !== 'active')
  ) {
    cards.push({
      id: 'income',
      severity: 'urgent',
      key: 'card.noIncome',
      params: {},
      suggestion: { type: 'job.acceptNpc', payload: {} },
    });
  }

  const order = { urgent: 0, important: 1, tip: 2 } as const;
  return cards.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 5);
}

function suggestedSkill(config: BalanceConfig, player: Player): SkillId {
  if (hasClass(player, 'entrepreneur')) return 'management';
  if (hasClass(player, 'investor')) return 'finance';
  const role =
    player.role === null
      ? undefined
      : (config.progression.roles.employee[player.role] ??
        config.progression.roles.freelancer[player.role]);
  return role ?? 'management';
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
