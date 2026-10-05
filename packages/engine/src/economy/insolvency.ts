import { SINK_ACCOUNT, balanceOf } from '../ledger';
import { ZERO, amount, multiply, negate } from '../money';
import { type Company, type Loan, type Player, removeLoan } from '../state';
import type { TickContext } from '../tick';
import { addArrears, receiveFromOutside, repayArrears, transfer } from './settle';

/** Quota del valore delle attrezzature recuperata in liquidazione. */
const LIQUIDATION_RECOVERY = 0.5;
/** Quota dei debiti residui cancellata con il fallimento personale (GDD §9.5). */
const PERSONAL_DEBT_RELIEF = 0.5;
const RESTRUCTURED_LOAN_MONTHS = 60;

/**
 * Fallimento di un'azienda (GDD §9.5): le attrezzature vengono liquidate, si pagano arretrati
 * e prestiti; ciò che resta va al titolare. Per la ditta individuale i debiti residui passano
 * alla persona; per SRL e SPA vengono cancellati.
 */
export function bankruptCompany(ctx: TickContext, company: Company): void {
  const { state } = ctx;
  const owner = state.players[company.ownerId];

  receiveFromOutside(
    ctx,
    [{ to: company.account, amount: multiply(company.equipment, LIQUIDATION_RECOVERY) }],
    'liquidation:equipment',
  );
  company.equipment = ZERO;
  repayArrears(ctx, company);

  for (const loan of loansOf(state.loans, 'company', company.id)) {
    payDownLoan(ctx, company.account, loan);
  }

  const personalLiability = company.legalForm === 'sole_proprietorship' && owner !== undefined;
  const leftover = balanceOf(state.ledger, company.account);
  if (leftover > 0 && owner !== undefined) {
    transfer(ctx, company.account, owner.account, amount(leftover), 'liquidation:to_owner');
  }

  for (const loan of loansOf(state.loans, 'company', company.id)) {
    if (personalLiability) {
      loan.borrower = { kind: 'player', id: owner.id };
      loan.repayment = 'amortizing';
    } else {
      removeLoan(state, loan.id);
    }
  }
  if (personalLiability && company.arrears > 0) {
    addArrears(owner, company.arrears, ctx.date.tick);
  }

  state.macro.employment -= company.npcWorkers;
  Object.assign(company, {
    status: 'closed',
    arrears: ZERO,
    arrearsSinceTick: null,
    customers: 0,
    npcWorkers: 0,
    output: 0,
    lastOutput: 0,
    capacity: 0,
  });
  ctx.emit({ type: 'company_bankrupt', companyId: company.id, ownerId: company.ownerId });
}

/**
 * Fallimento personale (GDD §9.5): liquidità e fondo vanno ai creditori, le ditte vengono
 * chiuse, gli arretrati cancellati e i prestiti residui dimezzati e ristrutturati.
 * Il giocatore resta in gioco con rating D.
 */
export function bankruptPlayer(ctx: TickContext, player: Player): void {
  const { state } = ctx;
  for (const companyId of player.companyIds) {
    const company = state.companies[companyId];
    if (company?.status === 'active' && company.legalForm === 'sole_proprietorship') {
      bankruptCompany(ctx, company);
    }
  }

  const fund = balanceOf(state.ledger, player.fundAccount);
  if (fund > 0) {
    transfer(ctx, player.fundAccount, player.account, amount(fund), 'bankruptcy:fund');
  }
  repayArrears(ctx, player);
  for (const loan of loansOf(state.loans, 'player', player.id)) {
    payDownLoan(ctx, player.account, loan);
  }
  const cash = balanceOf(state.ledger, player.account);
  if (cash > 0) {
    ctx.post({
      kind: 'sink',
      reason: 'bankruptcy:liquidation',
      postings: [
        { account: player.account, amount: negate(amount(cash)) },
        { account: SINK_ACCOUNT, amount: amount(cash) },
      ],
    });
  }

  for (const loan of loansOf(state.loans, 'player', player.id)) {
    loan.principal = multiply(loan.principal, 1 - PERSONAL_DEBT_RELIEF);
    loan.repayment = 'amortizing';
    loan.remainingMonths = Math.max(loan.remainingMonths, RESTRUCTURED_LOAN_MONTHS);
    if (loan.principal <= 0) removeLoan(state, loan.id);
  }
  player.arrears = ZERO;
  player.arrearsSinceTick = null;
  player.creditRating = 'D';
  player.bankruptcies += 1;
  player.lastBankruptcyTick = ctx.date.tick;
  player.lifestyleLevel = 1;
  if (player.npcJobMonthlyWage === 0 && player.freelanceMonthlyIncome === 0) {
    player.benefitMonthsLeft = ctx.config.economy.labour.unemploymentBenefitMonths;
  }
  ctx.emit({ type: 'player_bankrupt', playerId: player.id });
}

function loansOf(loans: Record<string, Loan>, kind: 'player' | 'company', id: string): Loan[] {
  return Object.values(loans).filter((l) => l.borrower.kind === kind && l.borrower.id === id);
}

/** Usa la liquidità disponibile per rimborsare il capitale di un prestito. */
function payDownLoan(ctx: TickContext, account: string, loan: Loan): void {
  const available = Math.max(0, balanceOf(ctx.state.ledger, account));
  const paid = amount(Math.min(available, loan.principal));
  if (paid > 0) {
    ctx.post({
      kind: 'sink',
      reason: 'loan:liquidation',
      postings: [
        { account, amount: negate(paid) },
        { account: SINK_ACCOUNT, amount: paid },
      ],
    });
    loan.principal = amount(loan.principal - paid);
  }
  if (loan.principal === 0) removeLoan(ctx.state, loan.id);
}
