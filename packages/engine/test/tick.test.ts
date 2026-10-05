import { loadBalanceConfig } from '@business-game/config';
import { describe, expect, it } from 'vitest';
import {
  APPLY_COMMANDS_STEP,
  type CityState,
  type Command,
  CommandRejectedError,
  DEFAULT_PIPELINE,
  InvariantViolationError,
  MINT_ACCOUNT,
  type Pipeline,
  SINK_ACCOUNT,
  SeasonOverError,
  amount,
  balanceOf,
  createCityState,
  fingerprint,
  openAccount,
  runTick,
} from '../src/index';

const config = loadBalanceConfig();
const SEASON_TICKS = config.global.time.ticksPerMonth * config.global.time.monthsPerSeason;
const PLAYERS = ['player:1', 'player:2', 'player:3', 'player:4'];

function cityWithPlayers(seed: string): CityState {
  const state = createCityState({ cityId: 'test', seed });
  for (const id of PLAYERS) {
    openAccount(state.ledger, id);
  }
  return state;
}

/** Pipeline di prova: usa il caso per creare, spostare e distruggere denaro. */
const randomEconomy: Pipeline = {
  weekly: [
    {
      name: 'random_flows',
      run(ctx) {
        const rng = ctx.rng('flows');
        const pick = () => PLAYERS[rng.int(0, PLAYERS.length - 1)] as string;
        const to = pick();
        const income = rng.int(1, 10_000);
        ctx.post({
          kind: 'faucet',
          reason: 'test:income',
          postings: [
            { account: MINT_ACCOUNT, amount: amount(-income) },
            { account: to, amount: amount(income) },
          ],
        });
        const from = pick();
        const available = balanceOf(ctx.state.ledger, from);
        if (available > 0) {
          const spend = rng.int(1, available);
          const target = pick();
          if (target !== from) {
            ctx.post({
              kind: 'transfer',
              reason: 'test:spend',
              postings: [
                { account: from, amount: amount(-spend) },
                { account: target, amount: amount(spend) },
              ],
            });
          }
        }
      },
    },
  ],
  monthly: [
    {
      name: 'random_tax',
      run(ctx) {
        for (const id of PLAYERS) {
          const tax = Math.floor(balanceOf(ctx.state.ledger, id) / 10);
          if (tax > 0) {
            ctx.post({
              kind: 'sink',
              reason: 'test:tax',
              postings: [
                { account: id, amount: amount(-tax) },
                { account: SINK_ACCOUNT, amount: amount(tax) },
              ],
            });
          }
        }
      },
    },
  ],
};

function playSeason(seed: string): { state: CityState; fingerprints: string[] } {
  let state = cityWithPlayers(seed);
  const fingerprints: string[] = [];
  for (let i = 0; i < SEASON_TICKS; i++) {
    state = runTick(state, [], config, { pipeline: randomEconomy }).state;
    fingerprints.push(fingerprint(state));
  }
  return { state, fingerprints };
}

describe('tick', () => {
  it('esegue le fasi settimanali e, a fine mese, anche quelle mensili', () => {
    let state = createCityState({ cityId: 'test', seed: 'fasi' });
    const weeklyNames = DEFAULT_PIPELINE.weekly.map((s) => s.name);
    const monthlyNames = DEFAULT_PIPELINE.monthly.map((s) => s.name);

    for (let week = 1; week <= 4; week++) {
      const { state: next, report } = runTick(state, [], config);
      const expected =
        week === 4
          ? [APPLY_COMMANDS_STEP, ...weeklyNames, ...monthlyNames]
          : [APPLY_COMMANDS_STEP, ...weeklyNames];
      expect(report.executedSteps).toEqual(expected);
      expect(report.date.week).toBe(week);
      state = next;
    }
    expect(state.tick).toBe(4);
  });

  it('è deterministico: stesso seed, stessa stagione', () => {
    const first = playSeason('seed-a');
    const second = playSeason('seed-a');
    expect(second.fingerprints).toEqual(first.fingerprints);
    expect(first.state.ledger.totalFaucet).toBeGreaterThan(0);
    expect(first.state.ledger.totalSink).toBeGreaterThan(0);
  });

  it('seed diversi producono stagioni diverse', () => {
    expect(playSeason('seed-a').fingerprints.at(-1)).not.toBe(
      playSeason('seed-b').fingerprints.at(-1),
    );
  });

  it('non modifica lo stato in ingresso', () => {
    const state = cityWithPlayers('immutabile');
    const before = fingerprint(state);
    runTick(state, [], config, { pipeline: randomEconomy });
    expect(fingerprint(state)).toBe(before);
  });

  it('rifiuta il tick se le invarianti non reggono e non conferma nulla', () => {
    const state = cityWithPlayers('invarianti');
    const before = fingerprint(state);
    const broken: Pipeline = {
      weekly: [
        {
          name: 'corrupt',
          run(ctx) {
            // Simula un bug: denaro creato aggirando il registro.
            const account = ctx.state.ledger.accounts['player:1'];
            if (account) account.balance = amount(1_000_000);
          },
        },
      ],
      monthly: [],
    };
    expect(() => runTick(state, [], config, { pipeline: broken })).toThrow(InvariantViolationError);
    expect(fingerprint(state)).toBe(before);
  });

  it('rifiuta comandi sconosciuti e duplicati, applica gli altri', () => {
    const state = cityWithPlayers('comandi');
    const commands: Command[] = [
      { id: 'c1', playerId: 'player:1', type: 'grant', payload: 500 },
      { id: 'c1', playerId: 'player:1', type: 'grant', payload: 500 },
      { id: 'c2', playerId: 'player:1', type: 'hack_the_bank', payload: null },
    ];
    const { state: next, report } = runTick(state, commands, config, {
      commandHandlers: {
        grant(ctx, command) {
          ctx.post({
            kind: 'faucet',
            reason: 'test:grant',
            postings: [
              { account: MINT_ACCOUNT, amount: amount(-(command.payload as number)) },
              { account: command.playerId, amount: amount(command.payload as number) },
            ],
          });
        },
      },
    });
    expect(balanceOf(next.ledger, 'player:1')).toBe(500);
    expect(report.transactions).toHaveLength(1);
    expect(report.rejectedCommands.map((r) => [r.commandId, r.reason])).toEqual([
      ['c1', 'duplicate_id'],
      ['c2', 'unknown_type'],
    ]);
  });

  it('i comandi rifiutati (anche per fondi insufficienti) non fermano il tick', () => {
    const state = cityWithPlayers('fondi');
    const { state: next, report } = runTick(
      state,
      [
        { id: 'pay', playerId: 'player:1', type: 'pay', payload: null },
        { id: 'refuse', playerId: 'player:1', type: 'refuse', payload: null },
      ],
      config,
      {
        commandHandlers: {
          pay(ctx) {
            ctx.post({
              kind: 'transfer',
              reason: 'test:pay',
              postings: [
                { account: 'player:1', amount: amount(-100) },
                { account: 'player:2', amount: amount(100) },
              ],
            });
          },
          refuse() {
            throw new CommandRejectedError('azione non consentita');
          },
        },
      },
    );
    expect(report.rejectedCommands).toMatchObject([
      { commandId: 'pay', reason: 'rejected' },
      { commandId: 'refuse', reason: 'rejected', message: 'azione non consentita' },
    ]);
    expect(next.tick).toBe(1);
  });

  it('gli errori inattesi in un comando fermano il tick', () => {
    const state = cityWithPlayers('bug');
    expect(() =>
      runTick(state, [{ id: 'x', playerId: 'player:1', type: 'buggy', payload: null }], config, {
        commandHandlers: {
          buggy() {
            throw new TypeError('bug');
          },
        },
      }),
    ).toThrow(TypeError);
  });

  it('non elabora tick oltre la fine della stagione', () => {
    const state = { ...createCityState({ cityId: 'test', seed: 'fine' }), tick: SEASON_TICKS };
    expect(() => runTick(state, [], config)).toThrow(SeasonOverError);
  });
});
