import { loadBalanceConfig } from '@business-game/config';
import { describe, expect, it } from 'vitest';
import { buildReport, formatReport, gini, median, runSeason } from '../src/index';

const config = loadBalanceConfig();
const population = { employee: 6, freelancer: 4, entrepreneur: 8, investor: 4 };

describe('simulatore', () => {
  it('una stagione breve rispetta le invarianti ed è riproducibile', () => {
    const options = { seed: 'test', population, months: 12, fullSupplyChain: true };
    const first = runSeason(options, config);
    const second = runSeason(options, config);
    expect(first.invariantViolations).toEqual([]);
    expect(first.months).toHaveLength(12);
    expect(first.outcomes).toHaveLength(22);
    expect(second.outcomes).toEqual(first.outcomes);
  });

  it('il report confronta i risultati con gli obiettivi di salute', () => {
    const result = runSeason({ seed: 'report', population, months: 24 }, config);
    const report = buildReport([result], config);
    expect(report.checks.find((c) => c.name === 'Invarianti monetarie')?.status).toBe('ok');
    expect(formatReport(report)).toContain('Report di bilanciamento');
  });

  it('gini e mediana', () => {
    expect(gini([1, 1, 1, 1])).toBeCloseTo(0);
    expect(gini([0, 0, 0, 10])).toBeCloseTo(0.75);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
