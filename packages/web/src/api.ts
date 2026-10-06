import type { PlayerView } from '@business-game/engine';

export interface CommandStatus {
  readonly id: string;
  readonly type: string;
  readonly status: 'pending' | 'applied' | 'rejected';
  readonly message: string | null;
}

/** Vista restituita dal server: quella del motore più nomi pubblici e stato dei comandi. */
export interface GameView extends PlayerView {
  readonly names: Readonly<Record<string, string>>;
  readonly commands: readonly CommandStatus[];
  readonly seasonOver: boolean;
  readonly nextTickAt: number | null;
}

export interface SessionUser {
  readonly username: string;
  readonly playerId: string;
  readonly joined: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string | null;

  constructor(status: number, code: string, detail: string | null) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** Il token CSRF resta solo in memoria: mai in localStorage, dove uno script potrebbe leggerlo. */
let csrfToken: string | null = null;

async function request<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
    if (csrfToken !== null) headers['x-csrf-token'] = csrfToken;
  }
  const response = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof data.error === 'string' ? data.error : 'network',
      typeof data.message === 'string' ? data.message : null,
    );
  }
  return data as T;
}

interface AuthResponse {
  user: SessionUser;
  csrfToken: string;
}

export const api = {
  async me(): Promise<SessionUser | null> {
    const result = await request<{ user: SessionUser | null; csrfToken: string | null }>(
      'GET',
      '/api/auth/me',
    );
    csrfToken = result.csrfToken;
    return result.user;
  },
  async login(username: string, password: string): Promise<SessionUser> {
    const result = await request<AuthResponse>('POST', '/api/auth/login', { username, password });
    csrfToken = result.csrfToken;
    return result.user;
  },
  async register(username: string, password: string): Promise<SessionUser> {
    const result = await request<AuthResponse>('POST', '/api/auth/register', {
      username,
      password,
    });
    csrfToken = result.csrfToken;
    return result.user;
  },
  async logout(): Promise<void> {
    await request('POST', '/api/auth/logout');
    csrfToken = null;
  },
  join(payload: { classId: string; sector?: string; role?: string }): Promise<unknown> {
    return request('POST', '/api/game/join', payload);
  },
  view(): Promise<GameView> {
    return request<GameView>('GET', '/api/game/view');
  },
  command(type: string, payload: unknown): Promise<{ status: string; id: string }> {
    return request('POST', '/api/game/commands', { id: newCommandId(), type, payload });
  },
};

function newCommandId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}
