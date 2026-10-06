import { loadBalanceConfig } from '@business-game/config';
import {
  type CityState,
  type Command,
  createCityState,
  fingerprint,
  runTick,
} from '@business-game/engine';
import { describe, expect, it } from 'vitest';
import { GameService, MemoryStore, PostgresStore, type Store } from '../src/index';

const config = loadBalanceConfig();

const joins: Command[] = [
  {
    id: 'j1',
    playerId: 'p1',
    type: 'player.join',
    payload: { classId: 'entrepreneur', sector: 'retail' },
  },
  { id: 'j2', playerId: 'p2', type: 'player.join', payload: { classId: 'investor' } },
  {
    id: 'j3',
    playerId: 'p3',
    type: 'player.join',
    payload: { classId: 'freelancer', role: 'tax' },
  },
];

function play(state: CityState, ticks: number, roundTrip: boolean): CityState {
  let current = state;
  for (let i = 0; i < ticks; i++) {
    current = runTick(current, [], config, { recordTransactions: false }).state;
    if (roundTrip) current = JSON.parse(JSON.stringify(current)) as CityState;
  }
  return current;
}

describe('persistenza', () => {
  it('salvare e ricaricare lo stato in JSON non cambia la partita', () => {
    const start = runTick(
      createCityState({ cityId: 't', seed: 'json', config }),
      joins,
      config,
    ).state;
    const direct = play(start, 20, false);
    const saved = play(start, 20, true);
    expect(fingerprint(saved)).toBe(fingerprint(direct));
  });

  const databaseUrl = process.env.TEST_DATABASE_URL;
  it.skipIf(databaseUrl === undefined)(
    'PostgreSQL: stessa semantica dell’archivio in memoria',
    async () => {
      const pgStore = await PostgresStore.connect(databaseUrl ?? '');
      const city = `test-${Date.now()}`;
      try {
        for (const store of [new MemoryStore(), pgStore] as Store[]) {
          const user = {
            id: `u-${city}`,
            username: `Utente${city.slice(-6)}`,
            passwordHash: 'h',
            playerId: `p-${city}`,
            createdAt: 1,
          };
          expect(await store.createUser(user)).toBe(true);
          expect(await store.createUser({ ...user, id: 'altro', playerId: 'altro' })).toBe(false);
          expect((await store.findUserByName(user.username.toUpperCase()))?.id).toBe(user.id);

          const game = await GameService.open({ store, config, cityId: city, seed: 's' });
          expect((await game.join(user.playerId, { classId: 'investor' })).ok).toBe(true);
          const first = await game.submit(user.playerId, 'abc12345', 'player.setLifestyle', {
            level: 2,
          });
          expect(first.status).toBe('queued');
          expect(
            (await game.submit(user.playerId, 'abc12345', 'player.setLifestyle', { level: 2 }))
              .status,
          ).toBe('duplicate');
          await game.tick();
          const reopened = await GameService.open({ store, config, cityId: city, seed: 's' });
          expect(reopened.state.tick).toBe(1);
          expect(reopened.state.players[user.playerId]?.lifestyleLevel).toBe(2);
          expect(fingerprint(reopened.state)).toBe(fingerprint(game.state));
          const view = await reopened.view(user.playerId);
          expect(view?.commands[0]).toMatchObject({ id: 'abc12345', status: 'applied' });
          expect(view?.names[user.playerId]).toBe(user.username);
        }
      } finally {
        await pgStore.close();
      }
    },
  );
});
