import { loadBalanceConfig } from '@business-game/config';
import { buildApp } from './app';
import { loadEnv } from './env';
import { GameService } from './game';
import { PostgresStore } from './pg-store';
import { MemoryStore, type Store } from './store';

/** Avvio del server: configurazione, archivio, città, HTTP e orologio dei tick. */
async function main(): Promise<void> {
  const env = loadEnv();
  const config = loadBalanceConfig();
  let store: Store;
  if (env.DATABASE_URL === undefined) {
    store = new MemoryStore();
  } else {
    const pgStore = await PostgresStore.connect(env.DATABASE_URL);
    await pgStore.acquireCityLock(env.CITY_ID);
    store = pgStore;
  }

  const game = await GameService.open({
    store,
    config,
    cityId: env.CITY_ID,
    seed: env.CITY_SEED,
    log: (message, data) => app.log.error(data ?? {}, message),
  });
  const app = await buildApp({ env, store, game });
  if (env.DATABASE_URL === undefined) app.log.warn('Nessun DATABASE_URL: stato solo in memoria');

  const schedule = () => {
    game.nextTickAt = Date.now() + env.TICK_INTERVAL_MS;
  };
  schedule();
  const timer = setInterval(() => {
    schedule();
    game
      .tick()
      .then((summary) => {
        if (summary !== null) app.log.info(summary, 'tick elaborato');
      })
      .catch((error: unknown) => app.log.error(error, 'tick fallito'));
  }, env.TICK_INTERVAL_MS);
  const cleanup = setInterval(
    () => {
      store.deleteExpiredSessions(Date.now()).catch((e: unknown) => app.log.error(e));
    },
    60 * 60 * 1000,
  );

  const shutdown = async () => {
    clearInterval(timer);
    clearInterval(cleanup);
    await app.close();
    await game.idle();
    await store.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  await app.listen({ host: env.HOST, port: env.PORT });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
