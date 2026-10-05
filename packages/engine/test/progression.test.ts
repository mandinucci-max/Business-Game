import { loadBalanceConfig } from '@business-game/config';
import { describe, expect, it } from 'vitest';
import {
  type CityState,
  type Command,
  type TickResult,
  balanceOf,
  checkLedgerInvariants,
  committedHours,
  createCityState,
  economicValue,
  runTick,
  skillLevel,
  toCredits,
  xpForLevel,
} from '../src/index';

const config = loadBalanceConfig();
const ticksPerMonth = config.global.time.ticksPerMonth;

function player(state: CityState, id: string) {
  const found = state.players[id];
  if (found === undefined) throw new Error(`giocatore ${id} assente`);
  return found;
}

function cmd(id: string, playerId: string, type: string, payload: unknown): Command {
  return { id, playerId, type, payload };
}

function city(...joins: Command[]): CityState {
  const result = runTick(createCityState({ cityId: 'test', seed: 'fase2', config }), joins, config);
  expect(result.report.rejectedCommands).toEqual([]);
  return result.state;
}

const employee = cmd('j-emp', 'emp', 'player.join', { classId: 'employee', role: 'sales' });
const investor = cmd('j-inv', 'inv', 'player.join', { classId: 'investor' });
const entrepreneur = cmd('j-ent', 'ent', 'player.join', {
  classId: 'entrepreneur',
  sector: 'retail',
});

function run(state: CityState, commands: Command[] = []): TickResult {
  return runTick(state, commands, config);
}

function months(state: CityState, count: number, every: (s: CityState) => Command[] = () => []) {
  let current = state;
  const events: string[] = [];
  for (let i = 0; i < count * ticksPerMonth; i++) {
    const result = run(current, every(current));
    events.push(...result.report.events.map((e) => `${e.type}:${String(e.level ?? '')}`));
    current = result.state;
  }
  return { state: current, events };
}

describe('competenze, ore e benessere', () => {
  it('ogni classe parte con le competenze previste', () => {
    const state = city(employee, investor, entrepreneur);
    expect(skillLevel(config, player(state, 'emp'), 'commercial')).toBe(2);
    expect(skillLevel(config, player(state, 'inv'), 'finance')).toBe(4);
    expect(skillLevel(config, player(state, 'ent'), 'management')).toBe(3);
  });

  it('le ore del mese limitano studio e attività', () => {
    const state = city(employee);
    const tooMuch = run(state, [
      cmd('s1', 'emp', 'skill.setStudy', { skill: 'management', hours: 120 }),
    ]);
    expect(tooMuch.report.rejectedCommands[0]?.message).toMatch(/Ore/);
    const ok = run(state, [cmd('s2', 'emp', 'skill.setStudy', { skill: 'management', hours: 90 })]);
    expect(ok.report.rejectedCommands).toEqual([]);
    expect(committedHours(ok.state, config, player(ok.state, 'emp'))).toBe(250);
  });

  it('studiare fa salire di livello e gli straordinari consumano il benessere', () => {
    let state = city(employee);
    state = run(state, [
      cmd('s', 'emp', 'skill.setStudy', { skill: 'management', hours: 90 }),
    ]).state;
    const before = player(state, 'emp');
    const after = player(months(state, 6).state, 'emp');
    expect(after.skills.management).toBeGreaterThan(before.skills.management + 6 * 90);
    expect(after.wellbeing).toBeLessThan(before.wellbeing);
  });

  it('il dipendente viene promosso quando raggiunge i requisiti', () => {
    const state = city(employee);
    player(state, 'emp').skills.commercial = xpForLevel(config, 4);
    const { state: after, events } = months(state, 7);
    expect(events).toContain('promotion:senior');
    expect(after.players.emp?.npcJob?.careerLevel).toBe(1);
  });
});

describe('salto di classe', () => {
  it('servono i requisiti per diventare imprenditore', () => {
    const state = city(employee);
    const blocked = run(state, [cmd('u', 'emp', 'class.unlock', { classId: 'entrepreneur' })]);
    expect(blocked.report.rejectedCommands[0]?.message).toMatch(/Gestione/);

    player(state, 'emp').skills.management = xpForLevel(config, 3);
    const noCash = run(state, [cmd('u', 'emp', 'class.unlock', { classId: 'entrepreneur' })]);
    expect(noCash.report.rejectedCommands[0]?.message).toMatch(/capitale/);

    // Dopo uno stipendio supera i 10.000 Cr richiesti.
    const paid = months(state, 1).state;
    const unlocked = run(paid, [cmd('u', 'emp', 'class.unlock', { classId: 'entrepreneur' })]);
    expect(unlocked.report.rejectedCommands).toEqual([]);
    expect(unlocked.state.players.emp?.activeClasses).toEqual(['employee', 'entrepreneur']);
  });

  it('un imprenditore fonda una SRL solo con capitale e competenze', () => {
    const state = city(entrepreneur);
    const found = (capital: number) =>
      cmd('f', 'ent', 'company.found', { sector: 'manufacturing', legalForm: 'srl', capital });
    expect(run(state, [found(10_000)]).report.rejectedCommands[0]?.message).toMatch(/Gestione 4/);

    player(state, 'ent').skills.management = xpForLevel(config, 4);
    expect(run(state, [found(5_000)]).report.rejectedCommands[0]?.message).toMatch(/Capitale/);
  });

  it('la ditta diventa SRL con Gestione 4 e 10.000 Cr in cassa', () => {
    const state = city(entrepreneur);
    player(state, 'ent').skills.management = xpForLevel(config, 4);
    const tooEarly = run(state, [
      cmd('i', 'ent', 'company.incorporate', { companyId: 'c1', legalForm: 'srl' }),
    ]);
    expect(tooEarly.report.rejectedCommands[0]?.message).toMatch(/10000 Cr/);
    const result = run(state, [
      cmd('d', 'ent', 'company.transferCash', {
        companyId: 'c1',
        direction: 'deposit',
        amount: 4500,
      }),
      cmd('i', 'ent', 'company.incorporate', { companyId: 'c1', legalForm: 'srl' }),
    ]);
    expect(result.report.rejectedCommands).toEqual([]);
    expect(result.state.companies.c1?.legalForm).toBe('srl');
  });
});

describe('prestiti tra giocatori', () => {
  it("l'investitore presta, incassa le rate e il patrimonio include il credito", () => {
    let state = city(employee, investor);
    state = months(state, 1).state;
    const offered = run(state, [
      cmd('o', 'inv', 'loan.offer', { amount: 5000, annualRate: 0.06, months: 24 }),
    ]);
    expect(offered.report.rejectedCommands).toEqual([]);
    const offerId = Object.keys(offered.state.loanOffers)[0] as string;
    const accepted = run(offered.state, [
      cmd('a', 'emp', 'loan.acceptOffer', { offerId, amount: 3000 }),
    ]);
    expect(accepted.report.rejectedCommands).toEqual([]);
    const loan = Object.values(accepted.state.loans).find((l) => l.lenderId === 'inv');
    expect(toCredits(loan?.principal ?? (0 as never))).toBe(3000);
    expect(accepted.state.players.emp?.network).toBe(1);

    const later = months(accepted.state, 3).state;
    const remaining = Object.values(later.loans).find((l) => l.lenderId === 'inv');
    expect(toCredits(remaining?.principal ?? (0 as never))).toBeLessThan(3000);
    expect(checkLedgerInvariants(later.ledger)).toEqual([]);
  });

  it('solo un investitore può offrire prestiti, entro il limite del suo livello', () => {
    const state = city(employee, investor);
    const result = run(state, [
      cmd('a', 'emp', 'loan.offer', { amount: 1000, annualRate: 0.05, months: 12 }),
      cmd('b', 'inv', 'loan.offer', { amount: 50_000, annualRate: 0.05, months: 12 }),
    ]);
    expect(result.report.rejectedCommands.map((r) => r.commandId)).toEqual(['a', 'b']);
  });

  it('se il debitore non paga, il prestatore perde parte del capitale', () => {
    let state = city(employee, investor);
    state = months(state, 1).state;
    state = run(state, [
      cmd('o', 'inv', 'loan.offer', { amount: 5000, annualRate: 0.1, months: 12 }),
    ]).state;
    const offerId = Object.keys(state.loanOffers)[0] as string;
    state = run(state, [cmd('a', 'emp', 'loan.acceptOffer', { offerId, amount: 3000 })]).state;
    // Il debitore perde il lavoro e vive al di sopra dei suoi mezzi: fallisce.
    player(state, 'emp').npcJob = null;
    state = run(state, [cmd('l', 'emp', 'player.setLifestyle', { level: 5 })]).state;

    let recovered = 0;
    let current = state;
    for (let i = 0; i < 24 * ticksPerMonth; i++) {
      const result = runTick(current, [], config);
      for (const t of result.report.transactions) {
        if (!t.reason.startsWith('loan:')) continue;
        recovered += toCredits(
          (t.postings.find((p) => p.account === 'player:inv')?.amount ?? 0) as never,
        );
      }
      current = result.state;
    }
    expect(current.players.emp?.bankruptcies).toBeGreaterThan(0);
    expect(recovered).toBeLessThan(3000);
    expect(checkLedgerInvariants(current.ledger)).toEqual([]);
  });
});

describe('immobili', () => {
  it("l'investitore compra unità, incassa affitti e il loro valore entra nel patrimonio", () => {
    const state = city(employee, investor);
    const before = toCredits(economicValue(state, config, 'inv'));
    const bought = run(state, [cmd('p', 'inv', 'property.buy', { kind: 'residential', units: 2 })]);
    expect(bought.report.rejectedCommands).toEqual([]);
    expect(bought.state.players.inv?.properties.residential).toBe(2);

    const cash = toCredits(balanceOf(bought.state.ledger, 'player:inv'));
    const later = months(bought.state, 2).state;
    const rents = player(later, 'inv');
    expect(toCredits(economicValue(later, config, 'inv'))).toBeGreaterThan(before * 0.8);
    expect(rents.properties.residential).toBe(2);
    // Gli affitti incassati coprono una parte del costo della vita dell'investitore.
    expect(toCredits(balanceOf(later.ledger, 'player:inv'))).toBeGreaterThan(cash - 2 * 1500);
  });

  it('il livello di investitore limita le unità', () => {
    const state = city(investor);
    const result = run(state, [cmd('p', 'inv', 'property.buy', { kind: 'residential', units: 3 })]);
    expect(result.report.rejectedCommands[0]?.message).toMatch(/livello/);
  });
});
