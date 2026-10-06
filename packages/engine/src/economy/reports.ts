import { SECTOR_IDS, SKILL_IDS, type SectorId, type SkillId } from '@business-game/config';
import { balanceOf } from '../ledger';
import { toCredits } from '../money';
import type { Company, MonthlyReport, Player, PublicReport, ReportItem } from '../state';
import type { TickContext } from '../tick';
import { monthlyDebtService } from './finance';
import { skillLevel } from './progression';
import { activeCompanies } from './sector';
import { economicValue, netWorth } from './valuation';

type Why = ReportItem['why'][number];

const MAX_ITEMS = 8;

/**
 * Chiusura del mese: classifica, report pubblico di mercato (GDD §17) e rapporto personale con
 * i "Perché?" (GDD §19.2). Le voci sono chiavi di traduzione: la lingua la sceglie la web app.
 */
export function monthlyReports(ctx: TickContext): void {
  const { state, config } = ctx;
  const previousRank = new Map(state.ranking.map((r, i) => [r.playerId, i + 1]));
  state.ranking = Object.values(state.players)
    .map((p) => ({
      playerId: p.id,
      value: Math.round(toCredits(economicValue(state, config, p.id))),
    }))
    .sort((a, b) => b.value - a.value || (a.playerId < b.playerId ? -1 : 1));
  const rank = new Map(state.ranking.map((r, i) => [r.playerId, i + 1]));

  const previousEvents = new Set(state.publicReport?.activeEvents ?? []);
  state.publicReport = publicReport(ctx);
  const newEvents = state.macro.activeEvents.filter((e) => !previousEvents.has(e.id));

  for (const player of Object.values(state.players)) {
    const items: ReportItem[] = [];
    for (const event of newEvents) {
      items.push({
        key: 'report.eventStarted',
        params: { event: event.id, months: event.monthsLeft },
        why: [],
        tone: 'neutral',
      });
    }
    for (const note of player.notes) {
      const item = noteItem(note.type, note.params);
      if (item !== null) items.push(item);
    }
    const companies = activeCompanies(state).filter((c) => c.ownerId === player.id);
    for (const company of companies) {
      items.push(...companyItems(ctx, company));
      company.previous = {
        customers: company.customers,
        satisfaction: company.satisfaction,
        price: company.price,
        workers: company.npcWorkers,
      };
    }
    items.push(...skillItems(ctx, player));

    const worth = Math.round(toCredits(netWorth(state, config, player.id)));
    const previousWorth = player.report?.netWorth ?? config.classes.startingNetWorth;
    const levels = config.economy.lifestyle.monthlyCostByLevel;
    const living = (levels[player.lifestyleLevel - 1] ?? 0) * state.macro.costIndex;
    const cashflow =
      toCredits(player.lastMonthIncome) -
      living -
      toCredits(monthlyDebtService(state, 'player', player.id));
    const position = rank.get(player.id) ?? state.ranking.length;
    const report: MonthlyReport = {
      monthIndex: ctx.date.monthIndex,
      netWorth: worth,
      netWorthChange: worth - previousWorth,
      monthlyCashflow: Math.round(cashflow),
      rank: position,
      rankChange: (previousRank.get(player.id) ?? position) - position,
      items: prioritize(items).slice(0, MAX_ITEMS),
      skillLevels: Object.fromEntries(
        SKILL_IDS.map((s) => [s, skillLevel(config, player, s)]),
      ) as Record<SkillId, number>,
    };
    player.report = report;
    player.notes = [];
  }
}

function publicReport(ctx: TickContext): PublicReport {
  const { state } = ctx;
  const markets = {} as Record<SectorId, PublicReport['markets'][SectorId]>;
  for (const sector of SECTOR_IDS) {
    const market = state.markets[sector];
    markets[sector] = {
      averagePrice: Math.round(market.averagePrice * 100) / 100,
      demand: Math.round(market.demand),
      playerShare:
        market.demand > 0 ? Math.round((market.playerSales / market.demand) * 1000) / 1000 : 0,
      companies: activeCompanies(state, sector).length,
    };
  }
  return {
    monthIndex: ctx.date.monthIndex,
    inflation: state.macro.inflation,
    unemployment: state.macro.unemployment,
    policyRate: state.macro.policyRate,
    activeEvents: state.macro.activeEvents.map((e) => e.id),
    markets,
  };
}

/** Variazione dei clienti e dell'utile di un'azienda, con le cause leggibili. */
function companyItems(ctx: TickContext, company: Company): ReportItem[] {
  const { state } = ctx;
  const items: ReportItem[] = [];
  const market = state.markets[company.sector];
  const before = company.previous.customers;
  const delta = company.customers - before;
  const name = company.id;

  if (before > 0 && Math.abs(delta) / before > 0.05) {
    const why: Why[] = [];
    if (company.capacity < company.customers * 0.9) {
      why.push({
        key: 'why.capacity',
        params: {
          capacity: Math.round(company.capacity),
          customers: Math.round(company.customers),
        },
      });
    }
    const price = toCredits(company.price);
    if (price > market.averagePrice * 1.03) {
      why.push({ key: 'why.priceAbove', params: { price, average: round2(market.averagePrice) } });
    } else if (price < market.averagePrice * 0.97) {
      why.push({ key: 'why.priceBelow', params: { price, average: round2(market.averagePrice) } });
    }
    if (company.quality < market.averageQuality * 0.95) {
      why.push({
        key: 'why.qualityBelow',
        params: { quality: round2(company.quality), average: round2(market.averageQuality) },
      });
    } else if (company.quality > market.averageQuality * 1.05) {
      why.push({
        key: 'why.qualityAbove',
        params: { quality: round2(company.quality), average: round2(market.averageQuality) },
      });
    }
    if (company.satisfaction < 0.8) {
      why.push({
        key: 'why.lowSatisfaction',
        params: { satisfaction: round2(company.satisfaction) },
      });
    }
    if (company.brand < 0.3)
      why.push({ key: 'why.lowBrand', params: { brand: round2(company.brand) } });
    if (company.npcWorkers < company.previous.workers) {
      why.push({
        key: 'why.workersLeft',
        params: { count: company.previous.workers - company.npcWorkers },
      });
    }
    items.push({
      key: delta > 0 ? 'report.customersUp' : 'report.customersDown',
      params: {
        company: name,
        sector: company.sector,
        change: Math.round(Math.abs(delta)),
        percent: Math.round((Math.abs(delta) / before) * 100),
      },
      why,
      tone: delta > 0 ? 'good' : 'bad',
    });
  }

  const profit = toCredits(company.lastMonth.revenue) - toCredits(company.lastMonth.costs);
  const why: Why[] = [];
  if (profit < 0 && company.customers < company.capacity * 0.6) {
    why.push({
      key: 'why.idleCapacity',
      params: { capacity: Math.round(company.capacity), customers: Math.round(company.customers) },
    });
  }
  if (profit < 0 && company.morale < 0.9)
    why.push({ key: 'why.lowMorale', params: { morale: round2(company.morale) } });
  items.push({
    key: profit >= 0 ? 'report.companyProfit' : 'report.companyLoss',
    params: { company: name, sector: company.sector, amount: Math.round(Math.abs(profit)) },
    why,
    tone: profit >= 0 ? 'good' : 'bad',
  });

  const cash = toCredits(balanceOf(state.ledger, company.account));
  const fixed = toCredits(company.wage) * company.npcWorkers;
  if (cash < fixed) {
    items.push({
      key: 'report.lowCash',
      params: { company: name, cash: Math.round(cash), payroll: Math.round(fixed) },
      why: [],
      tone: 'bad',
    });
  }
  return items;
}

function skillItems(ctx: TickContext, player: Player): ReportItem[] {
  const before = player.report?.skillLevels;
  if (before === undefined) return [];
  return SKILL_IDS.flatMap((skill) => {
    const now = skillLevel(ctx.config, player, skill);
    return now > (before[skill] ?? 0)
      ? [{ key: 'report.skillUp', params: { skill, level: now }, why: [], tone: 'good' as const }]
      : [];
  });
}

const NOTE_ITEMS: Record<string, { key: string; tone: ReportItem['tone'] }> = {
  promotion: { key: 'report.promotion', tone: 'good' },
  burnout: { key: 'report.burnout', tone: 'bad' },
  player_bankrupt: { key: 'report.personalBankruptcy', tone: 'bad' },
  company_bankrupt: { key: 'report.companyBankruptcy', tone: 'bad' },
  class_unlocked: { key: 'report.classUnlocked', tone: 'good' },
  company_founded: { key: 'report.companyFounded', tone: 'good' },
  company_incorporated: { key: 'report.companyIncorporated', tone: 'good' },
  lifestyle_downgraded: { key: 'report.lifestyleDowngraded', tone: 'bad' },
};

function noteItem(
  type: string,
  params: Readonly<Record<string, string | number | boolean>>,
): ReportItem | null {
  const known = NOTE_ITEMS[type];
  if (known === undefined) return null;
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number] => typeof entry[1] !== 'boolean',
    ),
  );
  return { key: known.key, params: clean, why: [], tone: known.tone };
}

/** Prima le notizie negative con una causa, poi le altre: le 3 in cima sono quelle che contano. */
function prioritize(items: ReportItem[]): ReportItem[] {
  const score = (item: ReportItem) =>
    (item.tone === 'bad' ? 2 : item.tone === 'good' ? 1 : 0) + (item.why.length > 0 ? 1 : 0);
  return [...items].sort((a, b) => score(b) - score(a));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
