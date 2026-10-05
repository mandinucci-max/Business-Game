import classes from '../balance/classes.json' with { type: 'json' };
import global from '../balance/global.json' with { type: 'json' };
import healthTargets from '../balance/health-targets.json' with { type: 'json' };
import sectors from '../balance/sectors.json' with { type: 'json' };
import { type BalanceConfig, balanceConfigSchema } from './schema';

export * from './schema';

export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Configurazione di bilanciamento non valida:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Valida una configurazione grezza. Ciò che non è valido viene rifiutato, mai corretto.
 * Il risultato è congelato: il motore non può modificarlo per errore.
 */
export function parseBalanceConfig(raw: unknown): BalanceConfig {
  const result = balanceConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(radice)'}: ${issue.message}`),
    );
  }
  return deepFreeze(result.data);
}

/** Configurazione di bilanciamento versionata nel repository (GDD, Appendice A). */
export function loadBalanceConfig(): BalanceConfig {
  return parseBalanceConfig({ sectors, global, classes, healthTargets });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
