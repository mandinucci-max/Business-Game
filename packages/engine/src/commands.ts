import {
  type BalanceConfig,
  CLASS_IDS,
  LEGAL_FORMS,
  type LegalForm,
  SECTOR_IDS,
  SKILL_IDS,
} from '@business-game/config';
import { z } from 'zod';
import { SINK_ACCOUNT, balanceOf, openAccount } from './ledger';
import { type Amount, amount, credits, multiply } from './money';
import { type CityState, type Company, type Player, removeLoan } from './state';
import {
  amortizingPayment,
  lendingRate,
  monthlyDebtService,
  outstandingDebt,
} from './economy/finance';
import { investmentAssets } from './economy/valuation';
import {
  committedHours,
  hasClass,
  hourLimit,
  investorLevel,
  skillLevel,
  unlockBlocker,
} from './economy/progression';
import { unitPrice } from './economy/realEstate';
import { requiredEquipment } from './economy/sector';
import { addLoan, foundCompany, joinPlayer, maxWorkers } from './economy/setup';
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
const hours = z.int().min(0).max(400);
const propertyKind = z.enum(['residential', 'commercial']);

const schemas = {
  'player.join': z.strictObject({
    classId: z.enum(CLASS_IDS),
    sector: z.enum(SECTOR_IDS).optional(),
    role: z.string().min(1).max(40).optional(),
  }),
  'player.setLifestyle': z.strictObject({ level: z.int().min(1).max(5) }),
  'skill.setStudy': z.strictObject({ skill: z.enum(SKILL_IDS), hours }),
  'class.unlock': z.strictObject({
    classId: z.enum(CLASS_IDS),
    role: z.string().min(1).max(40).optional(),
  }),
  'job.acceptNpc': z.strictObject({ partTime: z.boolean().optional() }),
  'job.quitNpc': z.strictObject({}),
  'freelance.setHours': z.strictObject({ hours }),
  'freelance.setCollaborators': z.strictObject({ count: z.int().min(0).max(100) }),
  'freelance.startProduct': z.strictObject({}),
  'company.found': z.strictObject({
    sector: z.enum(SECTOR_IDS),
    legalForm: z.enum(LEGAL_FORMS),
    capital: positiveCredits,
  }),
  'company.incorporate': z.strictObject({ companyId, legalForm: z.enum(['srl', 'spa']) }),
  'company.payDividend': z.strictObject({ companyId, amount: positiveCredits }),
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
  'company.buyEquipment': z.strictObject({ companyId, amount: positiveCredits }),
  'equity.offer': z.strictObject({
    companyId,
    share: z.number().finite().gt(0).max(0.49),
    price: positiveCredits,
  }),
  'equity.cancel': z.strictObject({ companyId }),
  'equity.buy': z.strictObject({ companyId, share: z.number().finite().gt(0).max(0.49) }),
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
  'loan.portfolio': z.strictObject({ amount: positiveCredits, months: z.int().min(1) }),
  'loan.repay': z.strictObject({ loanId: z.string().min(1).max(40), amount: positiveCredits }),
  'loan.offer': z.strictObject({
    amount: positiveCredits,
    annualRate: z.number().finite().min(0).max(1),
    months: z.int().min(1),
  }),
  'loan.cancelOffer': z.strictObject({ offerId: z.string().min(1).max(40) }),
  'loan.acceptOffer': z.strictObject({
    offerId: z.string().min(1).max(40),
    amount: positiveCredits,
    companyId: companyId.optional(),
  }),
  'property.buy': z.strictObject({ kind: propertyKind, units: z.int().min(1).max(1000) }),
  'property.sell': z.strictObject({ kind: propertyKind, units: z.int().min(1).max(1000) }),
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

function requireClass(player: Player, classId: (typeof CLASS_IDS)[number], what: string): void {
  if (!hasClass(player, classId))
    throw new CommandRejectedError(`${what}: serve la classe ${classId}`);
}

/** Le ore del mese sono il vincolo che limita il "fare più cose insieme" (GDD §3). */
function requireHours(ctx: TickContext, player: Player, extra: number): void {
  if (extra <= 0) return;
  if (committedHours(ctx.state, ctx.config, player) + extra > hourLimit(ctx.config, player)) {
    throw new CommandRejectedError('Ore insufficienti nel mese');
  }
}

function requireCash(ctx: TickContext, account: string, value: Amount): void {
  if (balanceOf(ctx.state.ledger, account) < value)
    throw new CommandRejectedError('Fondi insufficienti');
}

function validRole(
  config: BalanceConfig,
  role: string | undefined,
  table: 'employee' | 'freelancer',
) {
  return role !== undefined && Object.hasOwn(config.progression.roles[table], role);
}

/** Rate mensili sostenibili rispetto al reddito (GDD §12.1). */
function requireAffordable(
  state: CityState,
  config: BalanceConfig,
  player: Player,
  company: Company | undefined,
  payment: Amount,
): void {
  const income: Amount = company?.lastMonth.revenue ?? player.lastMonthIncome;
  const existing = company
    ? monthlyDebtService(state, 'company', company.id)
    : monthlyDebtService(state, 'player', player.id);
  if (existing + payment > income * config.economy.bank.maxDebtServiceRatio) {
    throw new CommandRejectedError('Le rate supererebbero il limite rispetto al reddito');
  }
}

/** Conto di garanzia dove l'investitore accantona il denaro delle sue offerte di prestito. */
export function escrowAccount(playerId: string): string {
  return `escrow:${playerId}`;
}

/** Acquisto di attrezzature dai fornitori gestiti dal computer (il denaro esce dal sistema). */
function buyEquipment(ctx: TickContext, company: Company, value: Amount): void {
  requireCash(ctx, company.account, value);
  ctx.post({
    kind: 'sink',
    reason: 'company:equipment',
    postings: [
      { account: company.account, amount: amount(-value) },
      { account: SINK_ACCOUNT, amount: value },
    ],
  });
  company.equipment = amount(company.equipment + value);
}

const LEGAL_RANK: Record<LegalForm, number> = {
  sole_proprietorship: 0,
  srl: 1,
  spa: 2,
  spa_with_license: 3,
};

function handler<T extends CommandType>(
  type: T,
  run: (ctx: TickContext, command: Command, payload: CommandPayload<T>) => void,
): CommandHandler {
  return (ctx, command) => run(ctx, command, parse(type, command.payload));
}

export const DEFAULT_COMMAND_HANDLERS: CommandHandlers = {
  'player.join': handler('player.join', (ctx, command, payload) => {
    if (!PLAYER_ID.test(command.playerId)) {
      throw new CommandRejectedError('Id giocatore non valido');
    }
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
    if (
      (payload.classId === 'employee' || payload.classId === 'freelancer') &&
      !validRole(ctx.config, payload.role, payload.classId)
    ) {
      throw new CommandRejectedError('Scegli un ruolo o una professione valida');
    }
    joinPlayer(ctx, {
      playerId: command.playerId,
      classId: payload.classId,
      ...(payload.sector === undefined ? {} : { sector: payload.sector }),
      ...(payload.role === undefined ? {} : { role: payload.role }),
    });
  }),

  'player.setLifestyle': handler('player.setLifestyle', (ctx, command, payload) => {
    requirePlayer(ctx, command).lifestyleLevel = payload.level;
  }),

  'skill.setStudy': handler('skill.setStudy', (ctx, command, payload) => {
    const player = requirePlayer(ctx, command);
    requireHours(ctx, player, payload.hours - player.study.hours);
    player.study = { skill: payload.hours > 0 ? payload.skill : null, hours: payload.hours };
  }),

  'class.unlock': handler('class.unlock', (ctx, command, payload) => {
    const { state, config } = ctx;
    const player = requirePlayer(ctx, command);
    const blocker = unlockBlocker(state, config, player, payload.classId);
    if (blocker !== null) throw new CommandRejectedError(blocker);
    if (payload.classId === 'freelancer') {
      if (player.role === null) {
        if (!validRole(config, payload.role, 'freelancer')) {
          throw new CommandRejectedError('Scegli una professione');
        }
        player.role = payload.role ?? null;
      }
      // Esame di abilitazione: costa ore libere e denaro.
      const exam = config.progression.unlock.freelancer;
      requireHours(ctx, player, exam.examHours);
      ctx.post({
        kind: 'sink',
        reason: 'unlock:exam',
        postings: [
          { account: player.account, amount: credits(-exam.examCost) },
          { account: SINK_ACCOUNT, amount: credits(exam.examCost) },
        ],
      });
      player.freelance = {
        hours: 0,
        monthsActive: 0,
        collaborators: 0,
        productHoursLeft: null,
        royaltyMonthly: 0,
      };
    }
    player.activeClasses.push(payload.classId);
    ctx.emit({ type: 'class_unlocked', playerId: player.id, classId: payload.classId });
  }),

  // Un lavoro presso un datore gestito dal computer è sempre disponibile (GDD §5.4).
  'job.acceptNpc': handler('job.acceptNpc', (ctx, command, payload) => {
    const player = requirePlayer(ctx, command);
    if (player.npcJob !== null) throw new CommandRejectedError('Hai già un lavoro');
    const h = ctx.config.progression.hours;
    const jobHours = payload.partTime === true ? h.npcJobPartTime : h.npcJobFullTime;
    requireHours(ctx, player, jobHours);
    player.npcJob = { hours: jobHours, careerLevel: 0, monthsInJob: 0 };
    if (!hasClass(player, 'employee')) player.activeClasses.push('employee');
    if (player.role === null)
      player.role = Object.keys(ctx.config.progression.roles.employee)[0] ?? null;
    player.benefitMonthsLeft = 0;
  }),

  'job.quitNpc': handler('job.quitNpc', (ctx, command) => {
    const player = requirePlayer(ctx, command);
    if (player.npcJob === null) throw new CommandRejectedError('Non hai un lavoro');
    player.npcJob = null;
  }),

  'freelance.setHours': handler('freelance.setHours', (ctx, command, payload) => {
    const player = requirePlayer(ctx, command);
    requireClass(player, 'freelancer', 'Attività professionale');
    const practice = player.freelance;
    if (practice === null) throw new CommandRejectedError('Nessuna attività professionale');
    requireHours(ctx, player, payload.hours - practice.hours);
    practice.hours = payload.hours;
  }),

  'freelance.setCollaborators': handler('freelance.setCollaborators', (ctx, command, payload) => {
    const player = requirePlayer(ctx, command);
    const career = ctx.config.progression.careers.freelancer;
    if (player.freelance === null) throw new CommandRejectedError('Nessuna attività professionale');
    if (
      payload.count > 0 &&
      skillLevel(ctx.config, player, 'management') < career.studioManagement
    ) {
      throw new CommandRejectedError(`Per uno studio serve Gestione ${career.studioManagement}`);
    }
    if (payload.count > career.maxCollaborators)
      throw new CommandRejectedError('Troppi collaboratori');
    requireHours(
      ctx,
      player,
      (payload.count - player.freelance.collaborators) *
        ctx.config.progression.hours.hoursPerCollaborator,
    );
    player.freelance.collaborators = payload.count;
  }),

  'freelance.startProduct': handler('freelance.startProduct', (ctx, command) => {
    const player = requirePlayer(ctx, command);
    const career = ctx.config.progression.careers.freelancer;
    const practice = player.freelance;
    if (practice === null) throw new CommandRejectedError('Nessuna attività professionale');
    if (practice.productHoursLeft !== null || practice.royaltyMonthly > 0) {
      throw new CommandRejectedError('Prodotto già avviato');
    }
    const best = Math.max(...SKILL_IDS.map((s) => skillLevel(ctx.config, player, s)));
    if (best < career.productSkill) {
      throw new CommandRejectedError(`Serve una competenza al livello ${career.productSkill}`);
    }
    practice.productHoursLeft = career.productHours;
  }),

  'company.found': handler('company.found', (ctx, command, payload) => {
    const { state, config } = ctx;
    const player = requirePlayer(ctx, command);
    requireClass(player, 'entrepreneur', 'Fondare un’azienda');
    const e = config.progression.careers.entrepreneur;
    const entry = config.sectors[payload.sector].entryLegalForm;
    if (LEGAL_RANK[payload.legalForm] < LEGAL_RANK[entry]) {
      throw new CommandRejectedError('Forma giuridica insufficiente per questo settore');
    }
    const management = skillLevel(config, player, 'management');
    const minimum: Record<LegalForm, { capital: number; management: number }> = {
      sole_proprietorship: { capital: e.soleProprietorshipCapital, management: 0 },
      srl: { capital: e.srlCapital, management: e.srlManagement },
      spa: { capital: e.spaCapital, management: e.spaManagement },
      spa_with_license: { capital: e.financeLicenseCapital, management: e.spaManagement },
    };
    const required = minimum[payload.legalForm];
    if (payload.capital < required.capital) {
      throw new CommandRejectedError(`Capitale minimo ${required.capital} Cr`);
    }
    if (management < required.management) {
      throw new CommandRejectedError(`Serve Gestione ${required.management}`);
    }
    if (payload.legalForm === 'spa_with_license') {
      requireClass(player, 'investor', 'Licenza finanziaria');
      if (skillLevel(config, player, 'finance') < e.financeLicenseFinance) {
        throw new CommandRejectedError(
          `Licenza finanziaria: serve Finanza ${e.financeLicenseFinance}`,
        );
      }
    }
    requireHours(ctx, player, config.progression.hours.managementPerCompany);
    const capital = credits(payload.capital);
    requireCash(ctx, player.account, capital);
    const company = foundCompany(ctx, {
      ownerId: player.id,
      sector: payload.sector,
      legalForm: payload.legalForm,
      equipment: 0,
      creditRating: player.creditRating === 'D' ? 'CCC' : player.creditRating,
      rng: ctx.rng(`found:${player.id}:${state.counters.company}`),
    });
    transfer(ctx, player.account, company.account, capital, 'company:capital');
    ctx.emit({ type: 'company_founded', companyId: company.id, sector: payload.sector });
  }),

  'company.incorporate': handler('company.incorporate', (ctx, command, payload) => {
    const { state, config } = ctx;
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    const player = requirePlayer(ctx, command);
    const e = config.progression.careers.entrepreneur;
    const management = skillLevel(config, player, 'management');
    const cash = balanceOf(state.ledger, company.account);
    if (payload.legalForm === 'srl') {
      if (company.legalForm !== 'sole_proprietorship')
        throw new CommandRejectedError('Già società');
      if (management < e.srlManagement)
        throw new CommandRejectedError(`Serve Gestione ${e.srlManagement}`);
      if (cash < credits(e.srlCapital))
        throw new CommandRejectedError(`Servono ${e.srlCapital} Cr in cassa`);
    } else {
      if (company.legalForm !== 'srl') throw new CommandRejectedError('Prima serve una SRL');
      if (management < e.spaManagement)
        throw new CommandRejectedError(`Serve Gestione ${e.spaManagement}`);
      if (cash + company.equipment < credits(e.spaCapital)) {
        throw new CommandRejectedError(`Servono ${e.spaCapital} Cr di patrimonio`);
      }
      const profitable = company.profitHistory.filter((p) => p > 0).length;
      if (profitable < e.spaProfitableMonths) {
        throw new CommandRejectedError(`Servono ${e.spaProfitableMonths} mesi in utile`);
      }
    }
    company.legalForm = payload.legalForm;
    ctx.emit({ type: 'company_incorporated', companyId: company.id, legalForm: payload.legalForm });
  }),

  // Il dividendo va a tutti i soci in proporzione alle quote.
  'company.payDividend': handler('company.payDividend', (ctx, command, payload) => {
    const { state } = ctx;
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    if (company.legalForm === 'sole_proprietorship') {
      throw new CommandRejectedError('La ditta individuale usa i prelievi');
    }
    const value = credits(payload.amount);
    requireCash(ctx, company.account, value);
    const holders = Object.entries(company.shares).filter(
      ([id, share]) => share > 0 && state.players[id],
    );
    let paid = 0;
    holders.forEach(([id, share], i) => {
      const holder = state.players[id] as Player;
      const part = i === holders.length - 1 ? value - paid : Math.floor(value * share);
      if (part > 0) {
        transfer(ctx, company.account, holder.account, amount(part), 'company:dividend');
        holder.month.capitalIncome = amount(holder.month.capitalIncome + part);
        // Per il titolare il dividendo è un prelievo: il valore della società è già nel suo patrimonio.
        if (holder.id !== company.ownerId) {
          holder.month.passiveIncome = amount(holder.month.passiveIncome + part);
        }
        paid += part;
      }
    });
  }),

  // Raccolta di capitale (GDD §5.2): il titolare vende quote, deve restare sopra il 50%.
  'equity.offer': handler('equity.offer', (ctx, command, payload) => {
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    if (company.legalForm === 'sole_proprietorship') {
      throw new CommandRejectedError('Solo le società possono vendere quote');
    }
    const ownerShare = company.shares[company.ownerId] ?? 0;
    if (ownerShare * (1 - payload.share) < 0.5) {
      throw new CommandRejectedError('Il titolare deve mantenere almeno il 50%');
    }
    company.equityOffer = { share: payload.share, price: credits(payload.price) };
  }),

  'equity.cancel': handler('equity.cancel', (ctx, command, payload) => {
    requireOwnedCompany(ctx, command, payload.companyId).equityOffer = null;
  }),

  'equity.buy': handler('equity.buy', (ctx, command, payload) => {
    const { state } = ctx;
    const buyer = requirePlayer(ctx, command);
    requireClass(buyer, 'investor', 'Comprare quote');
    const company = Object.hasOwn(state.companies, payload.companyId)
      ? state.companies[payload.companyId]
      : undefined;
    const offer = company?.equityOffer ?? null;
    if (company === undefined || company.status !== 'active' || offer === null) {
      throw new CommandRejectedError('Nessuna quota in vendita');
    }
    if (company.ownerId === buyer.id) throw new CommandRejectedError('Sei già il titolare');
    if (payload.share > offer.share + 1e-9) throw new CommandRejectedError('Quota oltre l’offerta');
    const cost = amount(Math.round((offer.price * payload.share) / offer.share));
    requireCash(ctx, buyer.account, cost);
    transfer(ctx, buyer.account, company.account, cost, 'equity:capital_increase');
    // Aumento di capitale: le nuove quote diluiscono in proporzione tutti i soci esistenti.
    for (const id of Object.keys(company.shares)) {
      company.shares[id] = (company.shares[id] ?? 0) * (1 - payload.share);
    }
    company.shares[buyer.id] = (company.shares[buyer.id] ?? 0) + payload.share;
    const remaining = offer.share - payload.share;
    company.equityOffer =
      remaining > 1e-6 ? { share: remaining, price: amount(offer.price - cost) } : null;
    buyer.network += 1;
    const owner = state.players[company.ownerId];
    if (owner !== undefined) owner.network += 1;
  }),

  'company.setPrice': handler('company.setPrice', (ctx, command, payload) => {
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    const basePrice = ctx.config.sectors[company.sector].economics.basePrice;
    if (payload.price > basePrice * 10) throw new CommandRejectedError('Prezzo troppo alto');
    const price = credits(payload.price);
    if (price <= 0) throw new CommandRejectedError('Prezzo troppo basso');
    company.price = price;
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
    // Chi assume deve avere le attrezzature: la differenza si compra subito dalla cassa.
    if (hires > 0) {
      const needed = credits(
        requiredEquipment(ctx.state, ctx.config, company.sector, payload.workers),
      );
      const missing = amount(Math.max(0, needed - company.equipment));
      if (missing > 0) buyEquipment(ctx, company, missing);
    }
    company.npcWorkers = payload.workers;
    company.wage = credits(payload.wage);
    macro.employment += hires;
    macro.unemployment = Math.max(0, 1 - macro.employment / macro.laborForce);
  }),

  'company.buyEquipment': handler('company.buyEquipment', (ctx, command, payload) => {
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    buyEquipment(ctx, company, credits(payload.amount));
  }),

  'company.transferCash': handler('company.transferCash', (ctx, command, payload) => {
    const company = requireOwnedCompany(ctx, command, payload.companyId);
    if (payload.direction === 'withdraw' && company.legalForm !== 'sole_proprietorship') {
      throw new CommandRejectedError('Dalle società si preleva con i dividendi');
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
    requireAffordable(
      state,
      config,
      player,
      company,
      amortizingPayment(principal, rate, payload.months),
    );
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

  // Prestito garantito dal portafoglio (solo investitori): il limite è il valore investito,
  // non il reddito. Le rate restano a carico del giocatore come per ogni prestito.
  'loan.portfolio': handler('loan.portfolio', (ctx, command, payload) => {
    const { state, config } = ctx;
    const player = requirePlayer(ctx, command);
    requireClass(player, 'investor', 'Prestito sul portafoglio');
    if (payload.months > config.economy.bank.maxLoanTermMonths) {
      throw new CommandRejectedError('Durata troppo lunga');
    }
    const rate = lendingRate(state, config, player.creditRating);
    if (rate === null) throw new CommandRejectedError('Rating insufficiente per il credito');
    const principal = credits(payload.amount);
    const limit = multiply(
      investmentAssets(state, config, player.id),
      config.progression.peerLending.portfolioLoanToValue,
    );
    if (outstandingDebt(state, 'player', player.id) + principal > limit) {
      throw new CommandRejectedError('Oltre il limite garantito dal portafoglio');
    }
    addLoan(state, {
      borrower: { kind: 'player', id: player.id },
      principal,
      annualRate: rate,
      months: payload.months,
      repayment: 'amortizing',
      purpose: 'portfolio_loan',
    });
    receiveFromOutside(ctx, [{ to: player.account, amount: principal }], 'loan:disbursement');
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
    requireCash(ctx, account, value);
    const lender = loan.lenderId === undefined ? undefined : state.players[loan.lenderId];
    ctx.post({
      kind: lender === undefined ? 'sink' : 'transfer',
      reason: 'loan:early_repayment',
      postings: [
        { account, amount: amount(-value) },
        { account: lender?.account ?? SINK_ACCOUNT, amount: value },
      ],
    });
    loan.principal = amount(loan.principal - value);
    if (loan.principal === 0) removeLoan(state, loan.id);
  }),

  // Prestiti tra giocatori (GDD §12.2): l'investitore pubblica un'offerta, chiunque può accettarla.
  'loan.offer': handler('loan.offer', (ctx, command, payload) => {
    const { state, config } = ctx;
    const player = requirePlayer(ctx, command);
    requireClass(player, 'investor', 'Prestare denaro');
    const lending = config.progression.peerLending;
    const level = config.progression.careers.investor[investorLevel(state, config, player)];
    if (payload.amount > (level?.maxPeerLoan ?? 0)) {
      throw new CommandRejectedError('Importo oltre il limite del tuo livello di investitore');
    }
    if (payload.annualRate < lending.minAnnualRate || payload.annualRate > lending.maxAnnualRate) {
      throw new CommandRejectedError('Tasso fuori dai limiti');
    }
    if (payload.months > config.economy.bank.maxLoanTermMonths) {
      throw new CommandRejectedError('Durata troppo lunga');
    }
    const open = Object.values(state.loanOffers).filter((o) => o.lenderId === player.id).length;
    if (open >= lending.maxOpenOffers) throw new CommandRejectedError('Troppe offerte aperte');
    // L'importo offerto viene accantonato: un'offerta è sempre coperta.
    const escrow = escrowAccount(player.id);
    if (!Object.hasOwn(state.ledger.accounts, escrow)) openAccount(state.ledger, escrow);
    requireCash(ctx, player.account, credits(payload.amount));
    transfer(ctx, player.account, escrow, credits(payload.amount), 'loan:offer_escrow');
    state.counters.offer += 1;
    const id = `o${state.counters.offer}`;
    state.loanOffers[id] = {
      id,
      lenderId: player.id,
      available: credits(payload.amount),
      annualRate: payload.annualRate,
      months: payload.months,
    };
  }),

  'loan.cancelOffer': handler('loan.cancelOffer', (ctx, command, payload) => {
    const offer = Object.hasOwn(ctx.state.loanOffers, payload.offerId)
      ? ctx.state.loanOffers[payload.offerId]
      : undefined;
    if (offer === undefined || offer.lenderId !== command.playerId) {
      throw new CommandRejectedError('Offerta inesistente o non tua');
    }
    const lender = requirePlayer(ctx, command);
    transfer(ctx, escrowAccount(lender.id), lender.account, offer.available, 'loan:offer_cancel');
    Reflect.deleteProperty(ctx.state.loanOffers, payload.offerId);
  }),

  'loan.acceptOffer': handler('loan.acceptOffer', (ctx, command, payload) => {
    const { state, config } = ctx;
    const player = requirePlayer(ctx, command);
    const offer = Object.hasOwn(state.loanOffers, payload.offerId)
      ? state.loanOffers[payload.offerId]
      : undefined;
    if (offer === undefined) throw new CommandRejectedError('Offerta inesistente');
    if (offer.lenderId === player.id)
      throw new CommandRejectedError('Non puoi prestare a te stesso');
    const company =
      payload.companyId === undefined
        ? undefined
        : requireOwnedCompany(ctx, command, payload.companyId);
    const principal = credits(payload.amount);
    if (principal > offer.available) throw new CommandRejectedError('Importo oltre l’offerta');
    const lender = state.players[offer.lenderId];
    if (lender === undefined) throw new CommandRejectedError('Prestatore inesistente');
    requireAffordable(
      state,
      config,
      player,
      company,
      amortizingPayment(principal, offer.annualRate, offer.months),
    );
    const borrower = company ?? player;
    transfer(ctx, escrowAccount(lender.id), borrower.account, principal, 'loan:peer_disbursement');
    addLoan(state, {
      borrower: company ? { kind: 'company', id: company.id } : { kind: 'player', id: player.id },
      principal,
      annualRate: offer.annualRate,
      months: offer.months,
      repayment: 'amortizing',
      purpose: 'peer_loan',
      lenderId: lender.id,
    });
    offer.available = amount(offer.available - principal);
    if (offer.available === 0) Reflect.deleteProperty(state.loanOffers, offer.id);
    player.network += 1;
    lender.network += 1;
  }),

  // Immobili (GDD §6.2): li compra l'investitore dalla città e li affitta a persone e aziende.
  'property.buy': handler('property.buy', (ctx, command, payload) => {
    const { state, config } = ctx;
    const player = requirePlayer(ctx, command);
    requireClass(player, 'investor', 'Comprare immobili');
    const level = config.progression.careers.investor[investorLevel(state, config, player)];
    const owned = player.properties.residential + player.properties.commercial;
    if (owned + payload.units > (level?.maxPropertyUnits ?? 0)) {
      throw new CommandRejectedError('Troppe unità per il tuo livello di investitore');
    }
    const cost = credits(
      unitPrice(state, config, payload.kind) *
        payload.units *
        (1 + config.progression.realEstate.transactionFee),
    );
    requireCash(ctx, player.account, cost);
    ctx.post({
      kind: 'sink',
      reason: 'property:buy',
      postings: [
        { account: player.account, amount: amount(-cost) },
        { account: SINK_ACCOUNT, amount: cost },
      ],
    });
    player.properties[payload.kind] += payload.units;
  }),

  'property.sell': handler('property.sell', (ctx, command, payload) => {
    const { state, config } = ctx;
    const player = requirePlayer(ctx, command);
    if (player.properties[payload.kind] < payload.units) {
      throw new CommandRejectedError('Non possiedi abbastanza unità');
    }
    const proceeds = credits(
      unitPrice(state, config, payload.kind) *
        payload.units *
        (1 - config.progression.realEstate.transactionFee),
    );
    player.properties[payload.kind] -= payload.units;
    receiveFromOutside(ctx, [{ to: player.account, amount: proceeds }], 'property:sell');
  }),
};
