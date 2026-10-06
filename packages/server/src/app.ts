import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { CLASS_IDS, SECTOR_IDS } from '@business-game/config';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  credentialsSchema,
  hashPassword,
  hashToken,
  randomId,
  randomToken,
  safeEqual,
  SESSION_TTL_MS,
  verifyPassword,
} from './auth';
import type { ServerEnv } from './env';
import type { GameService } from './game';
import type { SessionRecord, Store, UserRecord } from './store';

export interface AppDeps {
  readonly env: ServerEnv;
  readonly store: Store;
  readonly game: GameService;
  readonly now?: () => number;
}

interface Authenticated {
  readonly user: UserRecord;
  readonly session: SessionRecord;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: Authenticated | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const commandBodySchema = z.strictObject({
  /** Id scelto dal client per l'idempotenza (un retry non applica due volte lo stesso comando). */
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  type: z.string().min(1).max(60),
  payload: z.unknown(),
});

const joinBodySchema = z.strictObject({
  classId: z.enum(CLASS_IDS),
  sector: z.enum(SECTOR_IDS).optional(),
  role: z.string().min(1).max(40).optional(),
});

/**
 * Applicazione HTTP. Regole di sicurezza (piano §5): sessione in cookie HttpOnly + SameSite=Strict,
 * token CSRF in header per ogni richiesta che modifica, controllo dell'origine, limiti di
 * frequenza, header di sicurezza, corpo piccolo e solo JSON, nessun dettaglio interno negli errori.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env, store, game } = deps;
  const now = deps.now ?? Date.now;
  const cookieName = env.COOKIE_SECURE ? '__Host-bg_session' : 'bg_session';

  const app = Fastify({
    logger:
      env.LOG_LEVEL === 'silent'
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.headers["x-csrf-token"]',
            ],
          },
    bodyLimit: 16 * 1024,
    trustProxy: env.TRUST_PROXY,
  });

  // Solo JSON: un form o un text/plain da un altro sito non arriva nemmeno ai gestori.
  app.removeContentTypeParser('text/plain');

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
      },
    },
    hsts: env.COOKIE_SECURE ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('cache-control', 'no-store');
    const token = request.cookies[cookieName];
    if (token !== undefined && token.length > 0 && token.length < 100) {
      const session = await store.findSession(hashToken(token), now());
      const user = session === null ? null : await store.findUserById(session.userId);
      if (session !== null && user !== null) request.auth = { user, session };
    }
    if (SAFE_METHODS.has(request.method)) return;
    if (!originAllowed(request, env)) {
      return reply.code(403).send({ error: 'bad_origin' });
    }
    // Il token CSRF serve su ogni richiesta che modifica, tranne l'ingresso (che non ha sessione).
    const open = request.url === '/api/auth/login' || request.url === '/api/auth/register';
    if (!open) {
      const header = request.headers['x-csrf-token'];
      if (
        request.auth === null ||
        typeof header !== 'string' ||
        !safeEqual(header, request.auth.session.csrfToken)
      ) {
        return reply.code(403).send({ error: 'csrf' });
      }
    }
  });

  app.setErrorHandler((error: { statusCode?: number; code?: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    const code =
      status === 429
        ? 'rate_limited'
        : status === 413
          ? 'too_large'
          : status === 415
            ? 'unsupported_media_type'
            : status < 500
              ? 'bad_request'
              : 'internal_error';
    return reply.code(status).send({ error: code });
  });

  // Hash fittizio: chi prova nomi inesistenti aspetta quanto chi sbaglia la password.
  const dummyHash = await hashPassword(randomToken());

  async function startSession(reply: FastifyReply, user: UserRecord) {
    const token = randomToken();
    const session: SessionRecord = {
      tokenHash: hashToken(token),
      userId: user.id,
      csrfToken: randomToken(),
      expiresAt: now() + SESSION_TTL_MS,
    };
    await store.createSession(session);
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return { user: publicUser(user, game), csrfToken: session.csrfToken };
  }

  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/api/health', async () => ({ ok: true }));

  app.post('/api/auth/register', authLimit, async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_credentials_format' });
    const { username, password } = parsed.data;
    if (password.toLowerCase().includes(username.toLowerCase())) {
      return reply.code(400).send({ error: 'weak_password' });
    }
    const user: UserRecord = {
      id: randomId('u'),
      username,
      passwordHash: await hashPassword(password),
      playerId: randomId('p'),
      createdAt: now(),
    };
    if (!(await store.createUser(user))) {
      return reply.code(409).send({ error: 'username_taken' });
    }
    return reply.code(201).send(await startSession(reply, user));
  });

  app.post('/api/auth/login', authLimit, async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(401).send({ error: 'invalid_credentials' });
    const user = await store.findUserByName(parsed.data.username);
    const valid = await verifyPassword(user?.passwordHash ?? dummyHash, parsed.data.password);
    if (user === null || !valid) return reply.code(401).send({ error: 'invalid_credentials' });
    // Sessione nuova a ogni accesso (niente fixation); quella vecchia, se c'era, si chiude.
    if (request.auth !== null) await store.deleteSession(request.auth.session.tokenHash);
    return startSession(reply, user);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.auth !== null) await store.deleteSession(request.auth.session.tokenHash);
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });

  // Senza sessione risponde 200 con user null: la web app lo chiama a ogni apertura.
  app.get('/api/auth/me', async (request) => {
    const auth = request.auth;
    if (auth === null) return { user: null, csrfToken: null };
    return { user: publicUser(auth.user, game), csrfToken: auth.session.csrfToken };
  });

  app.post('/api/game/join', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (auth === null) return reply;
    const parsed = joinBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_join' });
    const result = await game.join(auth.user.playerId, parsed.data);
    if (!result.ok)
      return reply.code(409).send({ error: 'join_rejected', message: result.message });
    return reply.code(201).send({ ok: true });
  });

  app.get('/api/game/view', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (auth === null) return reply;
    const view = await game.view(auth.user.playerId);
    if (view === null) return reply.code(404).send({ error: 'not_joined' });
    return view;
  });

  app.post(
    '/api/game/commands',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (auth === null) return reply;
      const parsed = commandBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_command' });
      if (!game.hasJoined(auth.user.playerId)) {
        return reply.code(409).send({ error: 'not_joined' });
      }
      const { id, type, payload } = parsed.data;
      const result = await game.submit(auth.user.playerId, id, type, payload);
      switch (result.status) {
        case 'queued':
          return reply.code(202).send({ status: 'queued', id });
        case 'duplicate':
          return reply.code(200).send({ status: 'duplicate', id });
        case 'limit':
          return reply.code(429).send({ error: 'too_many_pending' });
        case 'invalid':
          return reply.code(400).send({ error: 'invalid_command', message: result.message });
      }
    },
  );

  if (env.ADMIN_TOKEN !== undefined) {
    const adminToken = env.ADMIN_TOKEN;
    // Fuori dal controllo CSRF perché usa un token in header, non i cookie.
    app.post(
      '/admin/tick',
      { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const header = request.headers.authorization ?? '';
        if (!safeEqual(header, `Bearer ${adminToken}`)) {
          return reply.code(401).send({ error: 'unauthorized' });
        }
        const summary = await game.tick();
        return { summary };
      },
    );
  }

  const webDist = env.WEB_DIST === undefined ? null : resolve(env.WEB_DIST);
  if (webDist !== null && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not_found' }));
  }

  return app;
}

function requireAuth(request: FastifyRequest, reply: FastifyReply): Authenticated | null {
  if (request.auth === null) {
    void reply.code(401).send({ error: 'unauthenticated' });
    return null;
  }
  return request.auth;
}

function publicUser(user: UserRecord, game: GameService) {
  return {
    username: user.username,
    playerId: user.playerId,
    joined: game.hasJoined(user.playerId),
  };
}

/**
 * Le richieste che modificano devono venire dalla nostra origine. Se il browser non manda Origin
 * (raro, richieste stesso sito) si ricade sui controlli di SameSite e del token CSRF.
 */
function originAllowed(request: FastifyRequest, env: ServerEnv): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  if (env.PUBLIC_ORIGIN !== undefined) return origin === new URL(env.PUBLIC_ORIGIN).origin;
  const host = request.headers.host;
  return host !== undefined && (origin === `http://${host}` || origin === `https://${host}`);
}
