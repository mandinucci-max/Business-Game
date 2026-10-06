import type { CityState, Command } from '@business-game/engine';
import pg from 'pg';
import {
  type CommandOutcome,
  type CommandRecord,
  type CommandStatus,
  type SessionRecord,
  type Store,
  type UserRecord,
  usernameKey,
} from './store';

/**
 * Schema minimo. Lo stato della città si salva come testo JSON (non jsonb): jsonb riordina le
 * chiavi e l'ordine di inserimento di giocatori e aziende fa parte del determinismo del motore.
 */
const MIGRATIONS = [
  `create table if not exists users (
     id text primary key,
     username text not null,
     username_key text not null unique,
     password_hash text not null,
     player_id text not null unique,
     created_at timestamptz not null
   )`,
  `create table if not exists sessions (
     token_hash text primary key,
     user_id text not null references users(id) on delete cascade,
     csrf_token text not null,
     expires_at timestamptz not null
   )`,
  `create index if not exists sessions_expires_at on sessions (expires_at)`,
  `create table if not exists worlds (
     city_id text primary key,
     tick integer not null,
     state text not null,
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists commands (
     city_id text not null,
     id text not null,
     seq bigserial,
     player_id text not null,
     type text not null,
     payload text not null,
     status text not null default 'pending',
     message text,
     processed_tick integer,
     created_at timestamptz not null default now(),
     primary key (city_id, id)
   )`,
  `create index if not exists commands_pending on commands (city_id, status, seq)`,
  `create index if not exists commands_player on commands (city_id, player_id, seq)`,
];

/** Lock consultivo: una sola istanza del server può far avanzare una città. */
const LOCK_NAMESPACE = 72_431;

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  player_id: string;
  created_at: Date;
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    playerId: row.player_id,
    createdAt: row.created_at.getTime(),
  };
}

function hashCity(cityId: string): number {
  let h = 0;
  for (const ch of cityId) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  return h;
}

export class PostgresStore implements Store {
  private lockClient: pg.PoolClient | null = null;

  private readonly pool: pg.Pool;

  private constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  static async connect(connectionString: string): Promise<PostgresStore> {
    const pool = new pg.Pool({ connectionString, max: 10 });
    const store = new PostgresStore(pool);
    for (const sql of MIGRATIONS) await pool.query(sql);
    return store;
  }

  /** Da chiamare all'avvio: fallisce se un'altra istanza sta già gestendo la stessa città. */
  async acquireCityLock(cityId: string): Promise<void> {
    const client = await this.pool.connect();
    const result = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock($1, $2) as locked',
      [LOCK_NAMESPACE, hashCity(cityId)],
    );
    if (result.rows[0]?.locked !== true) {
      client.release();
      throw new Error(`La città ${cityId} è già gestita da un'altra istanza del server`);
    }
    this.lockClient = client;
  }

  async createUser(user: UserRecord): Promise<boolean> {
    const result = await this.pool.query(
      `insert into users (id, username, username_key, password_hash, player_id, created_at)
       values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
      [
        user.id,
        user.username,
        usernameKey(user.username),
        user.passwordHash,
        user.playerId,
        new Date(user.createdAt),
      ],
    );
    return result.rowCount === 1;
  }

  async findUserByName(username: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>('select * from users where username_key = $1', [
      usernameKey(username),
    ]);
    const row = result.rows[0];
    return row === undefined ? null : toUser(row);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>('select * from users where id = $1', [id]);
    const row = result.rows[0];
    return row === undefined ? null : toUser(row);
  }

  async usernames(playerIds: readonly string[]): Promise<Map<string, string>> {
    if (playerIds.length === 0) return new Map();
    const result = await this.pool.query<{ player_id: string; username: string }>(
      'select player_id, username from users where player_id = any($1)',
      [playerIds],
    );
    return new Map(result.rows.map((r) => [r.player_id, r.username]));
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.pool.query(
      'insert into sessions (token_hash, user_id, csrf_token, expires_at) values ($1, $2, $3, $4)',
      [session.tokenHash, session.userId, session.csrfToken, new Date(session.expiresAt)],
    );
  }

  async findSession(tokenHash: string, now: number): Promise<SessionRecord | null> {
    const result = await this.pool.query<{
      token_hash: string;
      user_id: string;
      csrf_token: string;
      expires_at: Date;
    }>('select * from sessions where token_hash = $1 and expires_at > $2', [
      tokenHash,
      new Date(now),
    ]);
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          tokenHash: row.token_hash,
          userId: row.user_id,
          csrfToken: row.csrf_token,
          expiresAt: row.expires_at.getTime(),
        };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query('delete from sessions where token_hash = $1', [tokenHash]);
  }

  async deleteExpiredSessions(now: number): Promise<void> {
    await this.pool.query('delete from sessions where expires_at <= $1', [new Date(now)]);
  }

  async loadWorld(cityId: string): Promise<CityState | null> {
    const result = await this.pool.query<{ state: string }>(
      'select state from worlds where city_id = $1',
      [cityId],
    );
    const row = result.rows[0];
    return row === undefined ? null : (JSON.parse(row.state) as CityState);
  }

  async saveWorld(cityId: string, state: CityState): Promise<void> {
    await this.pool.query(
      `insert into worlds (city_id, tick, state) values ($1, $2, $3)
       on conflict (city_id) do update set tick = excluded.tick, state = excluded.state,
       updated_at = now()`,
      [cityId, state.tick, JSON.stringify(state)],
    );
  }

  async enqueueCommand(cityId: string, command: Command): Promise<boolean> {
    const result = await this.pool.query(
      `insert into commands (city_id, id, player_id, type, payload) values ($1, $2, $3, $4, $5)
       on conflict do nothing`,
      [cityId, command.id, command.playerId, command.type, JSON.stringify(command.payload)],
    );
    return result.rowCount === 1;
  }

  async pendingCommands(cityId: string): Promise<Command[]> {
    const result = await this.pool.query<CommandRow>(
      `select * from commands where city_id = $1 and status = 'pending' order by seq`,
      [cityId],
    );
    return result.rows.map((r) => toRecord(r).command);
  }

  async countPending(cityId: string, playerId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*) from commands where city_id = $1 and player_id = $2 and status = 'pending'`,
      [cityId, playerId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async recentCommands(cityId: string, playerId: string, limit: number): Promise<CommandRecord[]> {
    const result = await this.pool.query<CommandRow>(
      `select * from commands where city_id = $1 and player_id = $2 order by seq desc limit $3`,
      [cityId, playerId, limit],
    );
    return result.rows.map(toRecord);
  }

  async commitTick(
    cityId: string,
    state: CityState,
    outcomes: readonly CommandOutcome[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into worlds (city_id, tick, state) values ($1, $2, $3)
         on conflict (city_id) do update set tick = excluded.tick, state = excluded.state,
         updated_at = now()`,
        [cityId, state.tick, JSON.stringify(state)],
      );
      for (const outcome of outcomes) {
        await client.query(
          `update commands set status = $3, message = $4, processed_tick = $5
           where city_id = $1 and id = $2`,
          [cityId, outcome.commandId, outcome.status, outcome.message, state.tick - 1],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    this.lockClient?.release();
    this.lockClient = null;
    await this.pool.end();
  }
}

interface CommandRow {
  id: string;
  player_id: string;
  type: string;
  payload: string;
  status: string;
  message: string | null;
  processed_tick: number | null;
}

function toRecord(row: CommandRow): CommandRecord {
  return {
    command: {
      id: row.id,
      playerId: row.player_id,
      type: row.type,
      payload: JSON.parse(row.payload) as unknown,
    },
    status: row.status as CommandStatus,
    message: row.message,
    processedTick: row.processed_tick,
  };
}
