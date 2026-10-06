import type { CityState, Command } from '@business-game/engine';

export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly playerId: string;
  readonly createdAt: number;
}

export interface SessionRecord {
  /** Si conserva solo l'hash del token: un furto del database non dà sessioni valide. */
  readonly tokenHash: string;
  readonly userId: string;
  readonly csrfToken: string;
  readonly expiresAt: number;
}

export type CommandStatus = 'pending' | 'applied' | 'rejected';

export interface CommandRecord {
  readonly command: Command;
  readonly status: CommandStatus;
  readonly message: string | null;
  readonly processedTick: number | null;
}

export interface CommandOutcome {
  readonly commandId: string;
  readonly status: 'applied' | 'rejected';
  readonly message: string | null;
}

/** Persistenza del server. Due implementazioni: in memoria (test, sviluppo) e PostgreSQL. */
export interface Store {
  createUser(user: UserRecord): Promise<boolean>;
  findUserByName(username: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  usernames(playerIds: readonly string[]): Promise<Map<string, string>>;

  createSession(session: SessionRecord): Promise<void>;
  findSession(tokenHash: string, now: number): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredSessions(now: number): Promise<void>;

  loadWorld(cityId: string): Promise<CityState | null>;
  /** Primo salvataggio della città (all'avvio di una stagione). */
  saveWorld(cityId: string, state: CityState): Promise<void>;
  /** Accoda un comando; false se l'id esiste già (idempotenza tra i tick). */
  enqueueCommand(cityId: string, command: Command): Promise<boolean>;
  pendingCommands(cityId: string): Promise<Command[]>;
  countPending(cityId: string, playerId: string): Promise<number>;
  recentCommands(cityId: string, playerId: string, limit: number): Promise<CommandRecord[]>;
  /** Salva il nuovo stato e gli esiti dei comandi in un'unica transazione. */
  commitTick(cityId: string, state: CityState, outcomes: readonly CommandOutcome[]): Promise<void>;

  close(): Promise<void>;
}

export function usernameKey(username: string): string {
  return username.normalize('NFKC').toLowerCase();
}

/** Archivio in memoria: stessa semantica di PostgreSQL, usato nei test e in sviluppo. */
export class MemoryStore implements Store {
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByName = new Map<string, string>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly worlds = new Map<string, string>();
  private readonly commands = new Map<string, Map<string, CommandRecord>>();

  async createUser(user: UserRecord): Promise<boolean> {
    const key = usernameKey(user.username);
    if (this.usersByName.has(key)) return false;
    this.users.set(user.id, user);
    this.usersByName.set(key, user.id);
    return true;
  }

  async findUserByName(username: string): Promise<UserRecord | null> {
    const id = this.usersByName.get(usernameKey(username));
    return id === undefined ? null : (this.users.get(id) ?? null);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async usernames(playerIds: readonly string[]): Promise<Map<string, string>> {
    const wanted = new Set(playerIds);
    const result = new Map<string, string>();
    for (const user of this.users.values()) {
      if (wanted.has(user.playerId)) result.set(user.playerId, user.username);
    }
    return result;
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.tokenHash, session);
  }

  async findSession(tokenHash: string, now: number): Promise<SessionRecord | null> {
    const session = this.sessions.get(tokenHash);
    return session !== undefined && session.expiresAt > now ? session : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteExpiredSessions(now: number): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(hash);
    }
  }

  async loadWorld(cityId: string): Promise<CityState | null> {
    const json = this.worlds.get(cityId);
    return json === undefined ? null : (JSON.parse(json) as CityState);
  }

  async saveWorld(cityId: string, state: CityState): Promise<void> {
    this.worlds.set(cityId, JSON.stringify(state));
  }

  private cityCommands(cityId: string): Map<string, CommandRecord> {
    let map = this.commands.get(cityId);
    if (map === undefined) {
      map = new Map();
      this.commands.set(cityId, map);
    }
    return map;
  }

  async enqueueCommand(cityId: string, command: Command): Promise<boolean> {
    const map = this.cityCommands(cityId);
    if (map.has(command.id)) return false;
    map.set(command.id, {
      command: structuredClone(command),
      status: 'pending',
      message: null,
      processedTick: null,
    });
    return true;
  }

  async pendingCommands(cityId: string): Promise<Command[]> {
    return [...this.cityCommands(cityId).values()]
      .filter((r) => r.status === 'pending')
      .map((r) => structuredClone(r.command));
  }

  async countPending(cityId: string, playerId: string): Promise<number> {
    let count = 0;
    for (const r of this.cityCommands(cityId).values()) {
      if (r.status === 'pending' && r.command.playerId === playerId) count += 1;
    }
    return count;
  }

  async recentCommands(cityId: string, playerId: string, limit: number): Promise<CommandRecord[]> {
    return [...this.cityCommands(cityId).values()]
      .filter((r) => r.command.playerId === playerId)
      .slice(-limit)
      .reverse();
  }

  async commitTick(
    cityId: string,
    state: CityState,
    outcomes: readonly CommandOutcome[],
  ): Promise<void> {
    const map = this.cityCommands(cityId);
    this.worlds.set(cityId, JSON.stringify(state));
    for (const outcome of outcomes) {
      const record = map.get(outcome.commandId);
      if (record === undefined) continue;
      map.set(outcome.commandId, {
        ...record,
        status: outcome.status,
        message: outcome.message,
        processedTick: state.tick - 1,
      });
    }
  }

  async close(): Promise<void> {}
}
