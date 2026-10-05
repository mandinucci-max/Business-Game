import { describe, expect, it } from 'vitest';
import {
  CLASS_IDS,
  ConfigError,
  SECTOR_IDS,
  loadBalanceConfig,
  parseBalanceConfig,
} from '../src/index';

function rawConfig(): Record<string, unknown> {
  return structuredClone(loadBalanceConfig()) as unknown as Record<string, unknown>;
}

describe('configurazione di bilanciamento', () => {
  it('la configurazione del repository è valida', () => {
    const config = loadBalanceConfig();
    expect(Object.keys(config.sectors).sort()).toEqual([...SECTOR_IDS].sort());
    expect(Object.keys(config.classes.classes).sort()).toEqual([...CLASS_IDS].sort());
  });

  it('tutte le classi partono con lo stesso patrimonio netto', () => {
    const { classes } = loadBalanceConfig();
    for (const classId of CLASS_IDS) {
      const start = classes.classes[classId];
      const debts = start.debts.reduce((sum, debt) => sum + debt.principal, 0);
      expect(start.cash + start.otherAssets - debts).toBe(classes.startingNetWorth);
    }
  });

  it('è congelata', () => {
    const config = loadBalanceConfig();
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.sectors.energy.inputShares)).toBe(true);
  });

  it('rifiuta valori fuori intervallo', () => {
    const raw = rawConfig();
    (raw.sectors as { retail: { priceElasticity: number } }).retail.priceElasticity = -1;
    expect(() => parseBalanceConfig(raw)).toThrow(ConfigError);
  });

  it('rifiuta chiavi sconosciute', () => {
    const raw = rawConfig();
    (raw.global as Record<string, unknown>).unexpected = true;
    expect(() => parseBalanceConfig(raw)).toThrow(ConfigError);
  });

  it('rifiuta un settore che usa sé stesso come input', () => {
    const raw = rawConfig();
    const sectors = raw.sectors as { energy: { inputShares: Record<string, number> } };
    sectors.energy.inputShares.energy = 0.1;
    expect(() => parseBalanceConfig(raw)).toThrow(/sé stesso/);
  });

  it('rifiuta input che coprono tutto il costo di produzione', () => {
    const raw = rawConfig();
    const sectors = raw.sectors as { retail: { inputShares: Record<string, number> } };
    sectors.retail.inputShares.manufacturing = 0.9;
    expect(() => parseBalanceConfig(raw)).toThrow(/somma degli input/);
  });

  it('rifiuta una classe con patrimonio iniziale diverso', () => {
    const raw = rawConfig();
    const classes = raw.classes as { classes: { investor: { cash: number } } };
    classes.classes.investor.cash += 1;
    expect(() => parseBalanceConfig(raw)).toThrow(/patrimonio netto iniziale/);
  });
});
