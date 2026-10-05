import { CLASS_IDS, SECTOR_IDS } from '@business-game/config';
import { z } from 'zod';
import { SINK_ACCOUNT, balanceOf } from './ledger';
import { type Amount, amount, credits } from './money';
import { type Company, type Player, removeLoan } from './state';
import { amortizingPayment, lendingRate, monthlyDebtService } from './economy/finance';
import { addLoan, joinPlayer, maxWorkers } from './economy/setup';
import { receiveFromOutside, transfer } from './economy/settle';
import { type Command, CommandRejectedError } from './command-core';
import type { CommandHandler, CommandHandlers, TickContext } from './tick';

/**
 * Comandi dei giocatori. Ogni handler valida il contenuto con uno schema, verifica che il
 * giocatore possa agire sull'oggetto (autorizzazione) e solo dopo modifica lo stato.
 */

const PLAYER_ID = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_CREDITS = 1e9;
const creditsValue = z.number().finite().min(0).max(MAX_CREDITS);
const positiveCredits = z.number().finite().gt(0).max(MAX_CREDITS);
const companyId = z.string().min(1).max(40);

const schemas = {
  'player.join': z.strictObject({
    classId: z.enum(CLASS_IDS),
    sector: z.enum(SECTOR_IDS).optional(),
  }),
  'player.setLifestyle': z.strictObject({ level: z.int().min(1).max(5) }),
  'job.acceptNpc': z.strictObject({}),
  'job.quitNpc': z.strictObject({}),
  'company.setPrice': z.strictObject({ companyId, price: positiveCredits }),
  'company.setBudget': z.strictObject({
    companyId,
    marketing: creditsValue,
    rnd: creditsValue,
    training: creditsValue,
    service: creditsValue,
  }),
  'company.setWorkforce': z.strictObject({
    companyId,
    workers: z.int().min(0),
    wage: positiveCredits,
  }),
  'company.transferCash': z.strictObject({
    companyId,
    direction: z.enum(['deposit', 'withdraw']),
    amount: positiveCredits,
  }),
  'fund.invest': z.strictObject({ amount: positiveCredits }),
  'fund.redeem': z.strictObject({ amount: positiveCredits }),
  'loan.request': z.strictObject({
    companyId: companyId.optional(),
    amount: positiveCredits,
    months: z.int().min(1),
  }),
  'loan.repay': z.strictObject({ loanId: z.string().min(1).max(40), amount: positiveCredits }),
} as const;

export type CommandType = keyof typeof schemas;
export type CommandPayload<T extends CommandType> = z.infer<(typeof schemas)[T]>;

function parse<T extends CommandType>(type: T, payload: unknown): CommandPayload<T> {
  const result = schemas[type].safeParse(payload);
  if (!result.success) {
    throw new CommandRejectedError(`Dati non validi: ${result.error.issues[0]?.message ?? ''}`);
  }
  return result.data as CommandPayload<T>;
}

function requirePlayer(ctx: TickContext, command: Command): Player {
  const player = Object.hasOwn(ctx.state.players, command.playerId)
    ? ctx.state.players[command.playerId]
    : undefined;
  if (player === undefined) throw new CommandRejectedError('Giocatore inesistente');
  return player;
}

/** Il giocatore può agire solo sulle aziende attive di cui è titolare. */
function requireOwnedCompany(ctx: TickContext, command: Command, id: string): Company {
  requirePlayer(ctx, command);
  const company = Object.hasOwn(ctx.state.companies, id) ? ctx.state.companies[id] : undefined;
  if (company === undefined || company.ownerId !== command.playerId) {
    throw new CommandRejectedError('Azienda inesistente o non tua');
  }
  if (company.status !== 'active') throw new CommandRejectedError("L'azienda è chiusa");
  return company;
}

function handler<T extends CommandType>(
  type: T,
  run: (ctx: TickContext, command: Command, payload: CommandPayload<T>) => void,
): CommandHandler {
  return (ctx, command) => run(ctx, command, parse(type, command.payload));
}

export const DEFAULT_COMMAND_HANDLERS: CommandHandlers = {
  'player.join': handler('player.join', (ctx, command, payload) => {
    if (!PLAYER_ID.test(command.playerId))
      throw new CommandRejectedError('Id giocatore non valido');
    if (Object.hasOwn(ctx.state.players, command.playerId)) {
      throw new CommandRejectedError('Giocatore già presente');
    }
    if (payload.classId === 'entrepreneur') {
      const sector = payload.sector;
      if (sector === undefined) throw new CommandRejectedError('Scegli un settore');
      if (ctx.config.sectors[sector].entryLegalForm !== 'sole_proprietorship') {
        throw new CommandRejectedError('Settore non accessibile con una ditta individuale');
      }
    }
    joinPlayer(ctx, {
      playerId: command.playerId,
      classId: payload.classId,
      ...(payload.sector === undefined ? {} : { sector: payload.sector }),
    });
  }),

  'player.setLifestyle': handler('player.setLifestyle', (ctx, command, payload) => {
    requirePlayer(ctx, command).lifestyleLevel = payload.level;
  }),

  // Un lavoro presso un datore gestito dal computer è sempre disponibile al salario base del
  // dipendente (GDD §5.4: "Dipendente: sempre, se qualcuno ti assume").
  'job.acceptNpc': handler('job.acceptNpc', (ctx, command) => {
    const player = requirePlayer(ctx, command);
    if (player.npcJobMonthlyWage > 0) throw new CommandRejectedError('Hai già un lavoro');
    player.npcJobMonthlyWage = credits(ctx.config.classes.classes.employee.monthlyIncome.min);
    player.benefitMonthsLeft = 0;
  }),

  'job.quitNpc': handler('job.quitNpc', (ctx, command) => {
    const player = requirePlayer(ctx, command);
    if (player.npcJobMonthlyWage === 0) throw new CommandRejectedError('Non hai un lavoro');
    player.npcJobMonthlyWage = credits(0);
  }),

  'company.setPrice': handler('company.setPrice', (ctx, command, payload) => {
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    const basePrice = ctx.config.sectors[company.sector].economics.basePrice;
    if (payload.price > basePrice * 10) throw new CommandRejectedError('Prezzo troppo alto');
    company.price = credits(payload.price);
    if (company.price <= 0) throw new CommandRejectedError('Prezzo troppo basso');
  }),

  'company.setBudget': handler('company.setBudget', (ctx, command, payload) => {
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    company.budget = {
      marketing: credits(payload.marketing),
      rnd: credits(payload.rnd),
      training: credits(payload.training),
      service: credits(payload.service),
    };
  }),

  'company.setWorkforce': handler('company.setWorkforce', (ctx, command, payload) => {
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    const economics = ctx.config.sectors[company.sector].economics;
    if (payload.wage > economics.npcWageMonthly * 10) {
      throw new CommandRejectedError('Salario fuori scala');
    }
    if (payload.workers > maxWorkers(ctx.config, company.legalForm)) {
      throw new CommandRejectedError('Troppi dipendenti per questa forma giuridica');
    }
    const macro = ctx.state.macro;
    const hires = payload.workers - company.npcWorkers;
    const available = Math.floor(Math.max(0, macro.laborForce - macro.employment));
    if (hires > available) throw new CommandRejectedError('Non ci sono abbastanza disoccupati');
    company.npcWorkers = payload.workers;
    company.wage = credits(payload.wage);
    macro.employment += hires;
    macro.unemployment = Math.max(0, 1 - macro.employment / macro.laborForce);
  }),

  'company.transferCash': handler('company.transferCash', (ctx, command, payload) => {
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    if (company.legalForm !== 'sole_proprietorship') {
      throw new CommandRejectedError('Per le società servono dividendi o aumenti di capitale');
    }
    const player = requirePlayer(ctx, command);
    const value = credits(payload.amount);
    const [from, to] =
      payload.direction === 'deposit'
        ? [player.account, company.account]
        : [company.account, player.account];
    transfer(ctx, from, to, value, `owner:${payload.direction}`);
  }),

  'fund.invest': handler('fund.invest', (ctx, command, payload) => {
    const player = requirePlayer(ctx, command);
    transfer(ctx, player.account, player.fundAccount, credits(payload.amount), 'fund:invest');
  }),

  'fund.redeem': handler('fund.redeem', (ctx, command, payload) => {
    const player = requirePlayer(ctx, command);
    transfer(ctx, player.fundAccount, player.account, credits(payload.amount), 'fund:redeem');
  }),

  'loan.request': handler('loan.request', (ctx, command, payload) => {
    const { state, config } = ctx;
    const player = requirePlayer(ctx, command);
    const company =
      payload.companyId === undefined
        ? undefined
        : requireOwnedCompany(ctx, command, payload.companyId);
    if (payload.months > config.economy.bank.maxLoanTermMonths) {
      throw new CommandRejectedError('Durata troppo lunga');
    }
    const rating = company?.creditRating ?? player.creditRating;
    const rate = lendingRate(state, config, rating);
    if (rate === null) throw new CommandRejectedError('Rating insufficiente per il credito');

    const principal = credits(payload.amount);
    const payment = amortizingPayment(principal, rate, payload.months);
    const income: Amount = company?.lastMonth.revenue ?? player.lastMonthIncome;
    const existing = company
      ? monthlyDebtService(state, 'company', company.id)
      : monthlyDebtService(state, 'player', player.id);
    if (existing + payment > income * config.economy.bank.maxDebtServiceRatio) {
      throw new CommandRejectedError('Le rate supererebbero il limite rispetto al reddito');
    }

    const borrower = company ?? player;
    addLoan(state, {
      borrower: company ? { kind: 'company', id: company.id } : { kind: 'player', id: player.id },
      principal,
      annualRate: rate,
      months: payload.months,
      repayment: 'amortizing',
      purpose: 'bank_loan',
    });
    receiveFromOutside(ctx, [{ to: borrower.account, amount: principal }], 'loan:disbursement');
  }),

  'loan.repay': handler('loan.repay', (ctx, command, payload) => {
    const { state } = ctx;
    const loan = Object.hasOwn(state.loans, payload.loanId)
      ? state.loans[payload.loanId]
      : undefined;
    if (loan === undefined) throw new CommandRejectedError('Prestito inesistente');
    const account =
      loan.borrower.kind === 'player'
        ? loan.borrower.id === command.playerId
          ? requirePlayer(ctx, command).account
          : undefined
        : requireOwnedCompany(ctx, command, loan.borrower.id).account;
    if (account === undefined) throw new CommandRejectedError('Prestito non tuo');

    const value = amount(Math.min(credits(payload.amount), loan.principal));
    if (value > balanceOf(state.ledger, account))
      throw new CommandRejectedError('Fondi insufficienti');
    ctx.post({
      kind: 'sink',
      reason: 'loan:early_repayment',
      postings: [
        { account, amount: amount(-value) },
        { account: SINK_ACCOUNT, amount: value },
      ],
    });
    loan.principal = amount(loan.principal - value);
    if (loan.principal === 0) removeLoan(state, loan.id);
  }),
};
