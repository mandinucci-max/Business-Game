import { describe, expect, it } from 'vitest';
import { loadEnv, nextAlignedTick } from '../src/index';

const SIX_HOURS = 6 * 60 * 60 * 1000;

describe('orologio dei tick', () => {
  it('il prossimo tick esterno cade sugli orari 00, 06, 12, 18 UTC', () => {
    const now = Date.UTC(2026, 9, 7, 7, 30);
    expect(new Date(nextAlignedTick(now, SIX_HOURS)).toISOString()).toBe(
      '2026-10-07T12:00:00.000Z',
    );
    const exact = Date.UTC(2026, 9, 7, 18, 0);
    expect(nextAlignedTick(exact, SIX_HOURS)).toBe(Date.UTC(2026, 9, 8, 0, 0));
  });

  it('in produzione il cron esterno richiede il token di amministrazione', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@db.example/bg',
      PUBLIC_ORIGIN: 'https://gioco.example',
      TICK_SCHEDULER: 'external',
    };
    expect(() => loadEnv(base)).toThrow(/ADMIN_TOKEN/);
    expect(loadEnv({ ...base, ADMIN_TOKEN: 'x'.repeat(40) }).TICK_SCHEDULER).toBe('external');
  });
});
