import { SECTOR_IDS, type SectorId } from '@business-game/config';
import { SINK_ACCOUNT, balanceOf } from '../ledger';
import { type Amount, ZERO, add, amount, credits, multiply, negate } from '../money';
import { type Company, type Loan, removeLoan, unitsPerNpcWorkerWeek } from '../state';
import type { TickContext } from '../tick';
import {
  loanInstallment,
  monthlyDebtService,
  personalIncomeTax,
  stepRatingToward,
  targetRating,
} from './finance';
import { activeCompanies } from './sector';
import { gaussian } from './setup';
import { receiveFromOutside, settle } from './settle';

const PROFIT_HISTORY_MONTHS = 12;
const BANKRUPTCY_RATING_LOCK_MONTHS = 12;

/** Redditi, interessi, rendimento del fondo, salari, affitti e rate dei prestiti. */
export function monthlyPayments(ctx: TickContext): void {
  const { state, config } = ctx;
  const indexReturn =
    (state.macro.policyRate + config.economy.indexFund.equityPremium) / 12 +
    config.economy.indexFund.monthlyVolatility * gaussian(ctx.rng('index_fund'));
  state.macro.lastIndexReturn = indexReturn;
  const depositRate = Math.max(
    0,
    state.macro.policyRate - config.economy.bank.depositSpreadBelowPolicy,
  );
  const incomeRng = ctx.rng('freelance_income');

  for (const player of Object.values(state.players)) {
    // Redditi da datori e clienti gestiti dal computer, indicizzati ai costi.
    const index = state.macro.costIndex;
    const earned: Amount[] = [];
    if (player.npcJobMonthlyWage > 0) earned.push(multiply(player.npcJobMonthlyWage, index));
    if (player.freelanceMonthlyIncome > 0) {
      const factor = Math.max(
        0,
        1 + config.economy.npcIncome.freelancerMonthlyVolatility * gaussian(incomeRng),
      );
      earned.push(multiply(player.freelanceMonthlyIncome, factor * index));
    }
    if (player.benefitMonthsLeft > 0) {
      const base = config.classes.classes.employee.monthlyIncome.min;
      earned.push(credits(base * config.economy.labour.unemploymentBenefitShare * index));
      player.benefitMonthsLeft -= 1;
    }
    for (const value of earned) {
      receiveFromOutside(ctx, [{ to: player.account, amount: value }], 'income:npc_clients');
      player.month.earnedIncome = add(player.month.earnedIncome, value);
    }

    const cash = balanceOf(state.ledger, player.account);
    const interest = multiply(amount(Math.max(0, cash)), depositRate / 12);
    if (interest > 0) {
      receiveFromOutside(ctx, [{ to: player.account, amount: interest }], 'income:deposit');
      player.month.capitalIncome = add(player.month.capitalIncome, interest);
    }

    const fund = balanceOf(state.ledger, player.fundAccount);
    const fundChange = multiply(amount(fund), indexReturn);
    if (fundChange > 0) {
      receiveFromOutside(ctx, [{ to: player.fundAccount, amount: fundChange }], 'fund:return');
    } else if (fundChange < 0) {
      ctx.post({
        kind: 'sink',
        reason: 'fund:return',
        postings: [
          { account: player.fundAccount, amount: fundChange },
          { account: SINK_ACCOUNT, amount: negate(fundChange) },
        ],
      });
    }
    player.month.capitalIncome = add(player.month.capitalIncome, fundChange);
  }

  for (const company of activeCompanies(state)) {
    const economics = config.sectors[company.sector].economics;
    const wages = multiply(company.wage, company.npcWorkers);
    const rent = credits(
      economics.baseRentMonthly *
        state.macro.costIndex *
        (1 + config.economy.market.rentPerWorkerFactor * company.npcWorkers),
    );
    settle(ctx, company, [{ to: SINK_ACCOUNT, amount: add(wages, rent) }], 'payroll_and_rent');
    company.month.costs = add(company.month.costs, add(wages, rent));
    state.macro.npcPayrollThisMonth = add(state.macro.npcPayrollThisMonth, wages);
  }

  for (const loan of Object.values(state.loans)) {
    serviceLoan(ctx, loan);
  }
}

function serviceLoan(ctx: TickContext, loan: Loan): void {
  const { state } = ctx;
  const debtor =
    loan.borrower.kind === 'player'
      ? state.players[loan.borrower.id]
      : state.companies[loan.borrower.id];
  if (debtor === undefined) return;
  const { interest, principal } = loanInstallment(loan);
  const due = add(interest, principal);
  settle(ctx, debtor, [{ to: SINK_ACCOUNT, amount: due }], `loan:${loan.purpose}`);
  debtor.month.debtService = add(debtor.month.debtService, due);
  if (loan.borrower.kind === 'company') {
    const company = debtor as Company;
    company.month.costs = add(company.month.costs, interest);
  }
  // Il debito si riduce comunque: ciò che non è stato pagato è diventato arretrato.
  loan.principal = amount(loan.principal - principal);
  loan.remainingMonths -= 1;
  if (loan.principal <= 0 || loan.remainingMonths <= 0) {
    removeLoan(state, loan.id);
  }
}

/** Tasse (GDD §13): ditta tassata in capo al titolare, società al 22%, redditi da capitale al 20%. */
export function monthlyTaxes(ctx: TickContext): void {
  const { state, config } = ctx;
  const taxes = config.economy.taxes;
  const businessIncome = new Map<string, { company: Company; taxable: Amount }[]>();

  for (const company of activeCompanies(state)) {
    const profit = amount(company.month.revenue - company.month.costs);
    let taxable = ZERO;
    if (profit < 0) {
      company.lossCarryForward = add(company.lossCarryForward, negate(profit));
    } else {
      const offset = amount(Math.min(profit, company.lossCarryForward));
      company.lossCarryForward = amount(company.lossCarryForward - offset);
      taxable = amount(profit - offset);
    }
    if (company.legalForm === 'sole_proprietorship') {
      const list = businessIncome.get(company.ownerId) ?? [];
      list.push({ company, taxable });
      businessIncome.set(company.ownerId, list);
    } else if (taxable > 0) {
      settle(
        ctx,
        company,
        [{ to: SINK_ACCOUNT, amount: multiply(taxable, taxes.corporate) }],
        'tax:corporate',
      );
    }
    company.profitHistory = [...company.profitHistory, profit].slice(-PROFIT_HISTORY_MONTHS);
    company.lastMonth = { revenue: company.month.revenue, costs: company.month.costs };
    company.month = { revenue: ZERO, costs: ZERO, debtService: ZERO };
  }

  for (const player of Object.values(state.players)) {
    const businesses = businessIncome.get(player.id) ?? [];
    const business = businesses.reduce((sum, b) => add(sum, b.taxable), ZERO);
    const taxableIncome = add(player.month.earnedIncome, business);
    const tax = personalIncomeTax(taxableIncome, config);
    if (tax > 0 && taxableIncome > 0) {
      // La parte di imposta dovuta agli utili della ditta la paga la ditta.
      let fromBusinesses = ZERO;
      for (const { company, taxable } of businesses) {
        const share = multiply(tax, taxable / taxableIncome);
        if (share > 0) {
          settle(ctx, company, [{ to: SINK_ACCOUNT, amount: share }], 'tax:personal_business');
          fromBusinesses = add(fromBusinesses, share);
        }
      }
      const rest = amount(tax - fromBusinesses);
      if (rest > 0) settle(ctx, player, [{ to: SINK_ACCOUNT, amount: rest }], 'tax:personal');
    }
    const capitalTax = multiply(amount(Math.max(0, player.month.capitalIncome)), taxes.capital);
    if (capitalTax > 0) {
      settle(ctx, player, [{ to: SINK_ACCOUNT, amount: capitalTax }], 'tax:capital');
    }
    player.lastMonthIncome = amount(
      taxableIncome + Math.max(0, player.month.capitalIncome) - tax - capitalTax,
    );
    player.month = { earnedIncome: ZERO, capitalIncome: ZERO, debtService: ZERO };
  }
}

/** Indicatori macro, banca centrale, stabilizzatore ed eventi (GDD §13). */
export function centralBank(ctx: TickContext): void {
  const { state, config } = ctx;
  const macro = state.macro;
  const policy = config.economy.macro;
  const ticksPerMonth = config.global.time.ticksPerMonth;

  let operatorEmployment = 0;
  for (const sector of SECTOR_IDS) {
    const market = state.markets[sector];
    operatorEmployment +=
      market.operatorSalesThisMonth / ticksPerMonth / unitsPerNpcWorkerWeek(config, sector);
    market.operatorSalesThisMonth = 0;
  }
  const companyEmployment = activeCompanies(state).reduce((sum, c) => sum + c.npcWorkers, 0);
  macro.employment = operatorEmployment + companyEmployment;
  macro.unemployment = Math.max(0, 1 - macro.employment / macro.laborForce);

  // Una città con poca disoccupazione attira lavoratori, una con troppa li perde.
  const migration = Math.max(
    -policy.maxMonthlyMigration,
    Math.min(
      policy.maxMonthlyMigration,
      policy.migrationSensitivity * (policy.unemploymentTarget - macro.unemployment),
    ),
  );
  macro.laborForce *= 1 + migration;

  macro.cpiHistory = [...macro.cpiHistory, consumerPriceIndex(ctx)];
  macro.inflation = annualInflation(macro.cpiHistory);

  const target =
    policy.neutralRate +
    policy.inflationWeight * (macro.inflation - policy.inflationTarget) -
    policy.unemploymentWeight * (macro.unemployment - policy.unemploymentTarget);
  const step = Math.max(
    -policy.maxMonthlyRateStep,
    Math.min(policy.maxMonthlyRateStep, target - macro.policyRate),
  );
  macro.policyRate = Math.max(policy.minRate, Math.min(policy.maxRate, macro.policyRate + step));

  // Lo stabilizzatore aggiunge domanda solo se c'è anche disoccupazione da assorbire,
  // e la toglie solo se il mercato del lavoro è teso: non crea mai più domanda del lavoro disponibile.
  const lowInflation = macro.inflation < policy.inflationTarget - policy.stabilizerTolerance;
  const highInflation = macro.inflation > policy.inflationTarget + policy.stabilizerTolerance;
  if (highInflation && macro.unemployment < policy.unemploymentTarget) {
    macro.demandStabilizer -= policy.stabilizerStep;
  } else if (lowInflation && macro.unemployment > policy.unemploymentTarget) {
    macro.demandStabilizer += policy.stabilizerStep;
  }
  macro.demandStabilizer = Math.max(
    policy.stabilizerMin,
    Math.min(policy.stabilizerMax, macro.demandStabilizer),
  );

  // Curva di Phillips: con poca disoccupazione salari e prezzi accelerano.
  const costInflation = Math.max(
    policy.minAnnualCostInflation,
    Math.min(
      policy.maxAnnualCostInflation,
      policy.inflationTarget +
        policy.phillipsSlope * (policy.unemploymentTarget - macro.unemployment),
    ),
  );
  macro.costIndex *= (1 + costInflation) ** (1 / 12);

  macro.lastNpcPayroll = macro.npcPayrollThisMonth;
  macro.npcPayrollThisMonth = ZERO;

  macro.activeEvents = macro.activeEvents
    .map((e) => ({ ...e, monthsLeft: e.monthsLeft - 1 }))
    .filter((e) => e.monthsLeft > 0);
  const rng = ctx.rng('events');
  if (rng.chance(policy.monthlyEventProbability)) {
    const activeGroups = new Set(
      macro.activeEvents.flatMap((active) => {
        const group = config.economy.events.find((e) => e.id === active.id)?.group;
        return group === undefined ? [] : [group];
      }),
    );
    const candidates = config.economy.events.filter(
      (e) =>
        !macro.activeEvents.some((active) => active.id === e.id) &&
        (e.group === undefined || !activeGroups.has(e.group)),
    );
    if (candidates.length > 0) {
      const event = candidates[rng.int(0, candidates.length - 1)];
      if (event !== undefined) {
        const months = rng.int(event.durationMonths.min, event.durationMonths.max);
        macro.activeEvents.push({ id: event.id, monthsLeft: months });
        ctx.emit({ type: 'event_started', eventId: event.id, months });
      }
    }
  }
}

/** Indice dei prezzi al consumo: prezzi medi pagati sui settori del paniere, rispetto al prezzo base. */
export function consumerPriceIndex(ctx: TickContext): number {
  const { state, config } = ctx;
  let weighted = 0;
  let weight = 0;
  for (const [sector, share] of Object.entries(config.economy.lifestyle.basketShares) as [
    SectorId,
    number,
  ][]) {
    weighted +=
      (share * state.markets[sector].averagePrice) / config.sectors[sector].economics.basePrice;
    weight += share;
  }
  return weight > 0 ? weighted / weight : 1;
}

export function annualInflation(cpi: readonly number[]): number {
  const n = cpi.length;
  const last = cpi[n - 1];
  if (last === undefined || n < 2) return 0;
  if (n >= 13) return last / (cpi[n - 13] as number) - 1;
  return (last / (cpi[0] as number)) ** (12 / (n - 1)) - 1;
}

/** Rating di credito: un gradino al mese verso l'obiettivo; D bloccato dopo un fallimento. */
export function updateRatings(ctx: TickContext): void {
  const { state, config } = ctx;
  const ticksPerMonth = config.global.time.ticksPerMonth;
  const levels = config.economy.lifestyle.monthlyCostByLevel;

  for (const player of Object.values(state.players)) {
    if (
      player.lastBankruptcyTick !== null &&
      ctx.date.tick - player.lastBankruptcyTick < BANKRUPTCY_RATING_LOCK_MONTHS * ticksPerMonth
    ) {
      player.creditRating = 'D';
      continue;
    }
    const target = targetRating({
      monthlyIncome: player.lastMonthIncome,
      debtService: monthlyDebtService(state, 'player', player.id),
      arrears: player.arrears,
      liquidity: amount(
        Math.max(0, balanceOf(state.ledger, player.account)) +
          Math.max(0, balanceOf(state.ledger, player.fundAccount)),
      ),
      monthlyExpenses: credits(levels[player.lifestyleLevel - 1] ?? 0),
    });
    player.creditRating = stepRatingToward(
      player.creditRating === 'D' ? 'CCC' : player.creditRating,
      target,
    );
  }

  for (const company of activeCompanies(state)) {
    const target = targetRating({
      monthlyIncome: company.lastMonth.revenue,
      debtService: monthlyDebtService(state, 'company', company.id),
      arrears: company.arrears,
      liquidity: amount(Math.max(0, balanceOf(state.ledger, company.account))),
      monthlyExpenses: company.lastMonth.costs,
    });
    company.creditRating = stepRatingToward(company.creditRating, target);
  }
}
