import { loadBalanceConfig } from '@business-game/config';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, GameService, loadEnv, MemoryStore } from '../src/index';

const config = loadBalanceConfig();
const ADMIN = 'a'.repeat(40);

interface Client {
  cookie: string;
  csrf: string;
  playerId: string;
}

let app: FastifyInstance;
let store: MemoryStore;
let game: GameService;

beforeEach(async () => {
  store = new MemoryStore();
  game = await GameService.open({ store, config, cityId: 'test', seed: 'server' });
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ADMIN_TOKEN: ADMIN });
  app = await buildApp({ env, store, game });
});

afterEach(async () => {
  await app.close();
});

function sessionCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (raw === undefined) throw new Error('cookie mancante');
  return raw.split(';')[0] ?? '';
}

async function register(username: string, password = 'una-password-lunga'): Promise<Client> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json<{ csrfToken: string; user: { playerId: string } }>();
  return {
    cookie: sessionCookie(res.headers['set-cookie']),
    csrf: body.csrfToken,
    playerId: body.user.playerId,
  };
}

function post(client: Client, url: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url,
    payload: payload as Record<string, unknown>,
    headers: { cookie: client.cookie, 'x-csrf-token': client.csrf },
  });
}

function get(client: Client, url: string) {
  return app.inject({ method: 'GET', url, headers: { cookie: client.cookie } });
}

async function adminTick() {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/tick',
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  expect(res.statusCode).toBe(200);
}

describe('autenticazione', () => {
  it('registra, imposta un cookie sicuro e restituisce il token CSRF', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'mario', password: 'una-password-lunga' },
    });
    expect(res.statusCode).toBe(201);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(res.json<{ csrfToken: string }>().csrfToken.length).toBeGreaterThan(30);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('non salva la password in chiaro e usa Argon2id', async () => {
    await register('lucia');
    const user = await store.findUserByName('LUCIA');
    expect(user?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user?.passwordHash).not.toContain('una-password-lunga');
  });

  it('rifiuta nomi duplicati (senza distinzione di maiuscole) e password deboli', async () => {
    await register('anna');
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'ANNA', password: 'una-password-lunga' },
    });
    expect(dup.statusCode).toBe(409);
    const short = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'bruno', password: 'corta' },
    });
    expect(short.statusCode).toBe(400);
    const same = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'carlo', password: 'carlo12345678' },
    });
    expect(same.statusCode).toBe(400);
  });

  it('login: stesso errore per utente inesistente e password sbagliata', async () => {
    await register('dario');
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'dario', password: 'password-sbagliata' },
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nessuno', password: 'password-sbagliata' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.json()).toEqual(missing.json());
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'dario', password: 'una-password-lunga' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('il logout invalida la sessione lato server', async () => {
    const client = await register('elena');
    expect((await get(client, '/api/auth/me')).statusCode).toBe(200);
    expect((await post(client, '/api/auth/logout', {})).statusCode).toBe(200);
    expect((await get(client, '/api/auth/me')).statusCode).toBe(401);
  });

  it('limita i tentativi di accesso', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'x'.repeat(5), password: 'password-sbagliata' },
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});

describe('protezioni CSRF e di input', () => {
  it('rifiuta richieste che modificano senza token CSRF o con token errato', async () => {
    const client = await register('franco');
    const noToken = await app.inject({
      method: 'POST',
      url: '/api/game/join',
      payload: { classId: 'employee', role: 'operations' },
      headers: { cookie: client.cookie },
    });
    expect(noToken.statusCode).toBe(403);
    const badToken = await app.inject({
      method: 'POST',
      url: '/api/game/join',
      payload: { classId: 'employee', role: 'operations' },
      headers: { cookie: client.cookie, 'x-csrf-token': 'x'.repeat(43) },
    });
    expect(badToken.statusCode).toBe(403);
  });

  it('rifiuta origini estranee', async () => {
    const client = await register('giulia');
    const res = await app.inject({
      method: 'POST',
      url: '/api/game/join',
      payload: { classId: 'employee', role: 'operations' },
      headers: {
        cookie: client.cookie,
        'x-csrf-token': client.csrf,
        origin: 'https://evil.example',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accetta solo JSON e corpi piccoli', async () => {
    const client = await register('ivo');
    const text = await app.inject({
      method: 'POST',
      url: '/api/game/commands',
      payload: 'ciao',
      headers: { cookie: client.cookie, 'x-csrf-token': client.csrf, 'content-type': 'text/plain' },
    });
    expect(text.statusCode).toBe(415);
    const big = await post(client, '/api/game/commands', {
      id: 'abcdefgh',
      type: 'x',
      payload: 'y'.repeat(20_000),
    });
    expect(big.statusCode).toBe(413);
  });

  it('senza sessione le API di gioco rispondono 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/game/view' });
    expect(res.statusCode).toBe(401);
  });

  it("l'admin richiede il token corretto", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tick',
      headers: { authorization: 'Bearer sbagliato' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('partita', () => {
  it('ingresso immediato, comandi accodati e applicati al tick', async () => {
    const client = await register('laura');
    expect((await get(client, '/api/game/view')).statusCode).toBe(404);
    const join = await post(client, '/api/game/join', {
      classId: 'entrepreneur',
      sector: 'food_service',
    });
    expect(join.statusCode).toBe(201);
    expect((await post(client, '/api/game/join', { classId: 'investor' })).statusCode).toBe(409);

    const view = await get(client, '/api/game/view');
    expect(view.statusCode).toBe(200);
    const body = view.json<{ companies: { id: string; price: number }[]; tick: number }>();
    expect(body.tick).toBe(0);
    const company = body.companies[0];
    if (company === undefined) throw new Error('azienda mancante');

    const command = {
      id: 'cmd-00000001',
      type: 'company.setPrice',
      payload: { companyId: company.id, price: company.price + 1 },
    };
    expect((await post(client, '/api/game/commands', command)).statusCode).toBe(202);
    // Idempotenza: lo stesso id non si accoda due volte.
    const again = await post(client, '/api/game/commands', command);
    expect(again.json<{ status: string }>().status).toBe('duplicate');

    await adminTick();
    const after = (await get(client, '/api/game/view')).json<{
      tick: number;
      companies: { price: number }[];
      commands: { id: string; status: string }[];
    }>();
    expect(after.tick).toBe(1);
    expect(after.commands[0]).toMatchObject({ id: 'cmd-00000001', status: 'applied' });
  });

  it('il playerId viene dalla sessione: non si può agire sulle aziende altrui', async () => {
    const owner = await register('marco');
    await post(owner, '/api/game/join', { classId: 'entrepreneur', sector: 'retail' });
    const ownerView = (await get(owner, '/api/game/view')).json<{ companies: { id: string }[] }>();
    const companyId = ownerView.companies[0]?.id ?? '';

    const attacker = await register('nadia');
    await post(attacker, '/api/game/join', { classId: 'employee', role: 'operations' });
    const res = await post(attacker, '/api/game/commands', {
      id: 'cmd-attack-1',
      type: 'company.setPrice',
      payload: { companyId, price: 0.01 },
    });
    expect(res.statusCode).toBe(202);
    await adminTick();
    const view = (await get(attacker, '/api/game/view')).json<{
      commands: { status: string }[];
      companies: unknown[];
    }>();
    expect(view.commands[0]?.status).toBe('rejected');
    expect(view.companies).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(companyId);
  });

  it('rifiuta tipi sconosciuti, dati non validi e troppi comandi in coda', async () => {
    const client = await register('olga');
    await post(client, '/api/game/join', { classId: 'employee', role: 'operations' });
    const unknown = await post(client, '/api/game/commands', {
      id: 'cmd-unknown1',
      type: 'admin.giveMoney',
      payload: {},
    });
    expect(unknown.statusCode).toBe(400);
    const invalid = await post(client, '/api/game/commands', {
      id: 'cmd-invalid1',
      type: 'player.setLifestyle',
      payload: { level: 99 },
    });
    expect(invalid.statusCode).toBe(400);
    const joinAgain = await post(client, '/api/game/commands', {
      id: 'cmd-join0001',
      type: 'player.join',
      payload: { classId: 'investor' },
    });
    expect(joinAgain.statusCode).toBe(400);

    let status = 0;
    for (let i = 0; i < 31; i++) {
      const res = await post(client, '/api/game/commands', {
        id: `cmd-flood-${String(i).padStart(3, '0')}`,
        type: 'player.setLifestyle',
        payload: { level: 2 },
      });
      status = res.statusCode;
    }
    expect(status).toBe(429);
  });

  it('lo stato sopravvive a un riavvio (salvataggio e ricarica)', async () => {
    const client = await register('paolo');
    await post(client, '/api/game/join', { classId: 'investor' });
    await adminTick();
    await adminTick();
    const reopened = await GameService.open({ store, config, cityId: 'test', seed: 'server' });
    expect(reopened.state.tick).toBe(2);
    expect(reopened.hasJoined(client.playerId)).toBe(true);
  });
});
