import { z } from 'zod';

/** Configurazione del server letta dall'ambiente e validata all'avvio: niente default insicuri. */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    /** Senza DATABASE_URL lo stato vive in memoria: ammesso solo fuori produzione. */
    DATABASE_URL: z.string().url().optional(),
    CITY_ID: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .default('citta-1'),
    CITY_SEED: z.string().min(1).max(100).default('stagione-1'),
    /** Intervallo tra due tick reali (predefinito: 6 ore → 1 mese di gioco al giorno). */
    TICK_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .default(6 * 60 * 60 * 1000),
    /** Token per le operazioni dei tester (tick manuale): almeno 32 caratteri, o disattivato. */
    ADMIN_TOKEN: z.string().min(32).optional(),
    /** Origine pubblica della web app (es. https://gioco.example): usata per il controllo CSRF. */
    PUBLIC_ORIGIN: z.string().url().optional(),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    WEB_DIST: z.string().optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

export type ServerEnv = z.infer<typeof envSchema>;

export function loadEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): ServerEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configurazione non valida: ${issues}`);
  }
  const env = result.data;
  if (env.NODE_ENV === 'production') {
    if (env.DATABASE_URL === undefined) throw new Error('In produzione serve DATABASE_URL');
    if (env.PUBLIC_ORIGIN === undefined) throw new Error('In produzione serve PUBLIC_ORIGIN');
    if (!env.COOKIE_SECURE) throw new Error('In produzione i cookie devono essere Secure');
  }
  return env;
}
