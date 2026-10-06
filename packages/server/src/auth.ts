import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

/** Argon2id con i parametri raccomandati da OWASP (19 MiB, 2 iterazioni). */
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[A-Za-z0-9_.-]+$/);

export const passwordSchema = z.string().min(10).max(128);

export const credentialsSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
});

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Token casuale a 256 bit, in formato adatto a cookie e header. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function randomId(prefix: string): string {
  return `${prefix}${randomBytes(10).toString('hex')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
