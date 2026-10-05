import { loadBalanceConfig } from '@business-game/config';
import { describe, expect, it } from 'vitest';
import {
  amount,
  type CityState,
  type Command,
  type TickResult,
  balanceOf,
  checkLedgerInvariants,
  createCityState,
  credits,
  fingerprint,
  runTick,
  toCredits,
} from '../src/index';

const config = loadBalanceConfig();

const joins: Command[] = [
  { id: 'j1', playerId: 'emp', type: 'player.join', payload: { classId: 'employee' } },
  { id: 'j2', playerId: 'fre', type: 'player.join', payload: { classId: 'freelancer' } },
  {
    id: 'j3',
    playerId: 'ent',
    type: 'player.join',
    payload: { classId: 'entrepreneur', sector: 'food_service' },
  },
  { id: 'j4', playerId: 'inv', type: 'player.join', payload: { classId: 'investor' } },
];

function cmd(id: string, playerId: string, type: string, payload: unknown): Command {
  return { id, playerId, type, payload };
}

function start(seed = 'economia'): { state: CityState; result: TickResult } {
  const state = createCityState({ cityId: 'test', seed, config });
  const result = runTick(state, joins, config);
  return { state: result.state, result };
}

/** Un imprenditore attento: prezzo competitivo, cassa in azienda, prelievi per vivere. */
function playMonths(initial: CityState, months: number): CityState {
  let state = initial;
  const ticks = months * config.global.time.ticksPerMonth;
  for (let i = 0; i < ticks; i++) {
    const commands: Command[] = [];
    if (state.tick === 1) {
      commands.push(
        cmd('dep', 'ent', 'company.transferCash', {
          companyId: 'c1',
          direction: 'deposit',
          amount: 2500,
        }),
        cmd('price', 'ent', 'company.setPrice', { companyId: 'c1', price: 19 }),
        cmd('hire', 'ent', 'company.setWorkforce', { companyId: 'c1', workers: 5, wage: 1800 }),
        cmd('fund', 'inv', 'fund.invest', { amount: 30_000 }),
      );
    }
    const company = state.companies.c1;
    if (
      state.tick % config.global.time.ticksPerMonth === 0 &&
      company?.status === 'active' &&
      balanceOf(state.ledger, company.account) > credits(3000)
    ) {
      commands.push(
        cmd(`draw${state.tick}`, 'ent', 'company.transferCash', {
          companyId: 'c1',
          direction: 'withdraw',
          amount: 1300,
        }),
      );
    }
    const result = runTick(state, commands, config);
    expect(result.report.rejectedCommands).toEqual([]);
    state = result.state;
  }
  return state;
}

describe('economia di base', () => {
  it('ogni classe parte con 10.000 Cr di patrimonio netto', () => {
    const { state, result } = start();
    const capital = new Map(
      result.report.transactions
        .filter((t) => t.reason === 'start:capital')
        .map((t) => [t.postings[1]?.account, t.postings[1]?.amount ?? 0]),
    );
    const cash = (id: string) => toCredits(amount(capital.get(`player:${id}`) ?? 0));
    expect(cash('emp')).toBe(10_000);
    expect(cash('fre')).toBe(6_000);
    expect(cash('ent')).toBe(5_000);
    expect(cash('inv')).toBe(40_000);
    const entrepreneurLoan = Object.values(state.loans).find((l) => l.borrower.id === 'c1');
    expect(toCredits(entrepreneurLoan?.principal ?? credits(0))).toBe(25_000);
    const investorLoan = Object.values(state.loans).find((l) => l.borrower.id === 'inv');
    expect(investorLoan?.repayment).toBe('bullet');
  });

  it("l'azienda produce, vende e paga input, salari e tasse", () => {
    const { state } = start();
    const after = playMonths(state, 6);
    const company = after.companies.c1;
    expect(company?.status).toBe('active');
    expect(company?.customers).toBeGreaterThan(0);
    expect(company?.lastMonth.revenue).toBeGreaterThan(0);
    expect(company?.lastMonth.costs).toBeGreaterThan(0);
    expect(after.ledger.totalSink).toBeGreaterThan(0);
    expect(checkLedgerInvariants(after.ledger)).toEqual([]);
  });

  it('una stagione completa è deterministica e rispetta le invarianti', () => {
    const a = playMonths(start('stagione').state, 24);
    const b = playMonths(start('stagione').state, 24);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(checkLedgerInvariants(a.ledger)).toEqual([]);
    expect(a.macro.cpiHistory).toHaveLength(24);
  });

  it('il dipendente riceve lo stipendio e paga le tasse progressive', () => {
    let state = start().state;
    const taxes: number[] = [];
    for (let i = 1; i < config.global.time.ticksPerMonth; i++) {
      const result = runTick(state, [], config);
      taxes.push(
        ...result.report.transactions
          .filter((t) => t.reason === 'tax:personal' && t.postings[0]?.account === 'player:emp')
          .map((t) => toCredits(amount(-(t.postings[0]?.amount ?? 0)))),
      );
      state = result.state;
    }
    // Stipendio 2.200 al mese: 15% fino a 2.000 + 28% sul resto = 356.
    expect(taxes).toEqual([356]);
  });
});

describe('comandi', () => {
  it('nessuno può gestire l’azienda di un altro', () => {
    const { state } = start();
    const result = runTick(
      state,
      [cmd('x', 'emp', 'company.setPrice', { companyId: 'c1', price: 1 })],
      config,
    );
    expect(result.report.rejectedCommands[0]?.message).toMatch(/non tua/);
  });

  it('rifiuta dati non validi e chiavi in più', () => {
    const { state } = start();
    const result = runTick(
      state,
      [
        cmd('a', 'ent', 'company.setPrice', { companyId: 'c1', price: -5 }),
        cmd('b', 'ent', 'company.setPrice', { companyId: 'c1', price: 18, hack: true }),
        cmd('c', 'ent', 'company.setWorkforce', { companyId: 'c1', workers: 50, wage: 1800 }),
      ],
      config,
    );
    expect(result.report.rejectedCommands.map((r) => r.commandId)).toEqual(['a', 'b', 'c']);
  });

  it('un imprenditore può aprire solo in settori da ditta individuale', () => {
    const state = createCityState({ cityId: 'test', seed: 's', config });
    const result = runTick(
      state,
      [
        cmd('j', 'x', 'player.join', { classId: 'entrepreneur', sector: 'energy' }),
        cmd('k', 'y', 'player.join', { classId: 'entrepreneur' }),
        cmd('l', 'bad id!', 'player.join', { classId: 'employee' }),
      ],
      config,
    );
    expect(result.report.rejectedCommands).toHaveLength(3);
  });

  it('il prestito richiede reddito sufficiente', () => {
    const { state } = start();
    const month = playMonths(state, 1);
    const result = runTick(
      month,
      [
        cmd('small', 'emp', 'loan.request', { amount: 5000, months: 24 }),
        cmd('huge', 'fre', 'loan.request', { amount: 500_000, months: 24 }),
      ],
      config,
    );
    expect(result.report.rejectedCommands.map((r) => r.commandId)).toEqual(['huge']);
    expect(toCredits(balanceOf(result.state.ledger, 'player:emp'))).toBeGreaterThan(14_000);
  });
});

describe('fallimento', () => {
  it('una ditta che non paga fallisce e i debiti passano al titolare', () => {
    const { state } = start();
    // Salari altissimi: la ditta non riesce a pagarli.
    let current = runTick(
      state,
      [cmd('w', 'ent', 'company.setWorkforce', { companyId: 'c1', workers: 5, wage: 18_000 })],
      config,
    ).state;
    const events: string[] = [];
    for (let i = 0; i < 16; i++) {
      const result = runTick(current, [], config);
      events.push(...result.report.events.map((e) => e.type));
      current = result.state;
    }
    expect(events).toContain('company_bankrupt');
    expect(current.companies.c1?.status).toBe('closed');
    const loan = Object.values(current.loans).find((l) => l.purpose === 'startup_loan');
    expect(loan?.borrower).toEqual({ kind: 'player', id: 'ent' });
    expect(checkLedgerInvariants(current.ledger)).toEqual([]);
  });

  it('dopo il fallimento personale il giocatore resta in gioco con rating D e un sussidio', () => {
    const { state } = start();
    let current = runTick(
      state,
      [cmd('w', 'ent', 'company.setWorkforce', { companyId: 'c1', workers: 5, wage: 18_000 })],
      config,
    ).state;
    for (let i = 0; i < 24; i++) current = runTick(current, [], config).state;
    const player = current.players.ent;
    expect(player?.bankruptcies).toBeGreaterThan(0);
    expect(player?.creditRating).toBe('D');
    const job = runTick(current, [cmd('job', 'ent', 'job.acceptNpc', {})], config);
    expect(job.report.rejectedCommands).toEqual([]);
    expect(job.state.players.ent?.npcJobMonthlyWage).toBeGreaterThan(0);
  });
});
