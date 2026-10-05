import { type BalanceConfig, CLASS_IDS, type ClassId, SECTOR_IDS } from '@business-game/config';
import type { SeasonResult } from './simulate';

export type CheckStatus = 'ok' | 'fuori' | 'n/d';

export interface HealthCheck {
  readonly name: string;
  readonly value: string;
  readonly target: string;
  readonly status: CheckStatus;
  readonly note?: string;
}

export interface BalanceReport {
  readonly seasons: number;
  readonly checks: readonly HealthCheck[];
  readonly classTopTenShare: Readonly<Record<ClassId, number>>;
  readonly classMedianValue: Readonly<Record<ClassId, number>>;
  readonly strategyMedianValue: Readonly<Record<string, number>>;
  readonly averageInflation: number;
  readonly averageUnemployment: number;
  readonly rejectedCommands: number;
  readonly rejectionSamples: readonly string[];
}

/** Confronta i risultati delle stagioni simulate con gli obiettivi di salute (GDD, Appendice A.3). */
export function buildReport(
  results: readonly SeasonResult[],
  config: BalanceConfig,
): BalanceReport {
  const targets = config.healthTargets;
  const topTen = Object.fromEntries(CLASS_IDS.map((c) => [c, 0])) as Record<ClassId, number>;
  const values = Object.fromEntries(CLASS_IDS.map((c) => [c, [] as number[]])) as Record<
    ClassId,
    number[]
  >;
  const byStrategy = new Map<string, number[]>();
  const inflation: number[] = [];
  const unemployment: number[] = [];
  const ginis: number[] = [];
  const failureRates: number[] = [];
  const liveSectors: number[] = [];
  const violations: string[] = [];
  const upgrades: number[] = [];
  let totalPlayers = 0;

  for (const result of results) {
    const ranked = [...result.outcomes].sort((a, b) => b.economicValue - a.economicValue);
    for (const outcome of ranked.slice(0, 10)) topTen[outcome.classId] += 1;
    for (const outcome of result.outcomes) {
      totalPlayers += 1;
      if (outcome.firstUpgradeMonth !== null) upgrades.push(outcome.firstUpgradeMonth);
      values[outcome.classId].push(outcome.economicValue);
      const list = byStrategy.get(outcome.strategy) ?? [];
      list.push(outcome.economicValue);
      byStrategy.set(outcome.strategy, list);
    }
    // L'inflazione annua si misura dal secondo anno, quando c'è un anno intero di storia.
    const afterFirstYear = result.months.filter((m) => m.month > 12);
    if (afterFirstYear.length > 0) inflation.push(mean(afterFirstYear.map((m) => m.inflation)));
    unemployment.push(mean(result.months.map((m) => m.unemployment)));
    ginis.push(gini(result.outcomes.map((o) => o.economicValue)));
    failureRates.push(result.companiesBankrupt / Math.max(1, result.companiesFounded));
    const month24 = result.months.find((m) => m.month === 24);
    if (month24) {
      liveSectors.push(SECTOR_IDS.filter((s) => month24.activeCompanies[s] > 0).length);
    }
    violations.push(...result.invariantViolations);
  }

  const seasons = results.length;
  const classTopTenShare = Object.fromEntries(
    CLASS_IDS.map((c) => [c, topTen[c] / Math.max(1, seasons * 10)]),
  ) as Record<ClassId, number>;

  const checks: HealthCheck[] = [
    {
      name: 'Invarianti monetarie',
      value: violations.length === 0 ? 'nessuna violazione' : `${violations.length} violazioni`,
      target: 'nessuna violazione',
      status: violations.length === 0 ? 'ok' : 'fuori',
    },
    rangeCheck(
      'Inflazione annua media (dal 2° anno)',
      mean(inflation),
      targets.annualInflation,
      true,
    ),
    rangeCheck('Disoccupazione media', mean(unemployment), targets.unemployment, true),
    ...CLASS_IDS.map((c) =>
      rangeCheck(`Quota top 10: ${c}`, classTopTenShare[c], targets.topTenShareByOriginClass, true),
    ),
    rangeCheck(
      'Fallimenti di aziende per stagione',
      mean(failureRates),
      targets.companyFailureRatePerSeason,
      true,
      {
        note: 'dipende dalla concorrenza tra giocatori: si valuta dalla Fase 2',
        informative: true,
      },
    ),
    {
      name: 'Settori con aziende di giocatori al mese 24',
      value: liveSectors.length > 0 ? mean(liveSectors).toFixed(1) : 'n/d',
      target: `≥ ${targets.minSectorsWithPlayerCompanyByMonth24}`,
      status:
        liveSectors.length === 0
          ? 'n/d'
          : mean(liveSectors) >= targets.minSectorsWithPlayerCompanyByMonth24
            ? 'ok'
            : 'fuori',
    },
    rangeCheck('Disuguaglianza del VE (Gini)', mean(ginis), targets.netWorthGini, false, {
      note: 'si valuta dalla Fase 2',
      informative: true,
    }),
    rangeCheck(
      'Mesi al primo salto di livello (mediana)',
      median(upgrades),
      targets.monthsToFirstUpgrade,
      false,
    ),
    {
      name: 'Giocatori con almeno un salto di livello',
      value: `${((upgrades.length / Math.max(1, totalPlayers)) * 100).toFixed(0)}%`,
      target: 'informativo',
      status: 'n/d',
    },
  ];

  const allRejections = results.reduce((sum, r) => sum + r.rejectedCommands, 0);
  return {
    seasons,
    checks,
    classTopTenShare,
    classMedianValue: Object.fromEntries(CLASS_IDS.map((c) => [c, median(values[c])])) as Record<
      ClassId,
      number
    >,
    strategyMedianValue: Object.fromEntries(
      [...byStrategy].map(([name, list]) => [name, median(list)]),
    ),
    averageInflation: mean(inflation),
    averageUnemployment: mean(unemployment),
    rejectedCommands: allRejections,
    rejectionSamples: results.flatMap((r) => r.rejectionSamples).slice(0, 10),
  };
}

export function formatReport(report: BalanceReport): string {
  const lines = [`# Report di bilanciamento (${report.seasons} stagioni simulate)`, ''];
  lines.push('| Indicatore | Valore | Obiettivo | Esito |', '|---|---|---|---|');
  for (const check of report.checks) {
    const status = check.status === 'ok' ? '✅' : check.status === 'fuori' ? '❌' : '—';
    const note = check.note === undefined ? '' : ` (${check.note})`;
    lines.push(`| ${check.name} | ${check.value} | ${check.target} | ${status}${note} |`);
  }
  lines.push('', '## Valore Economico mediano a fine stagione', '', '| Classe | VE mediano (Cr) |');
  lines.push('|---|---|');
  for (const [classId, value] of Object.entries(report.classMedianValue)) {
    lines.push(`| ${classId} | ${Math.round(value).toLocaleString('it-IT')} |`);
  }
  lines.push('', '| Strategia | VE mediano (Cr) |', '|---|---|');
  for (const [name, value] of Object.entries(report.strategyMedianValue)) {
    lines.push(`| ${name} | ${Math.round(value).toLocaleString('it-IT')} |`);
  }
  lines.push('', `Comandi rifiutati: ${report.rejectedCommands}`);
  for (const sample of report.rejectionSamples) lines.push(`- ${sample}`);
  return lines.join('\n');
}

function rangeCheck(
  name: string,
  value: number,
  range: { min: number; max: number },
  percent: boolean,
  options: { note?: string; informative?: boolean } = {},
): HealthCheck {
  const fmt = (v: number) => (percent ? `${(v * 100).toFixed(1)}%` : v.toFixed(2));
  const inRange = value >= range.min && value <= range.max;
  return {
    name,
    value: Number.isFinite(value) ? fmt(value) : 'n/d',
    target: `${fmt(range.min)}–${fmt(range.max)}`,
    status: !Number.isFinite(value)
      ? 'n/d'
      : inRange
        ? 'ok'
        : options.informative
          ? 'n/d'
          : 'fuori',
    ...(options.note === undefined ? {} : { note: options.note }),
  };
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? Number.NaN : values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}

/** Indice di Gini su valori non negativi (i patrimoni negativi contano come zero). */
export function gini(values: readonly number[]): number {
  const sorted = values.map((v) => Math.max(0, v)).sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);
  if (sorted.length === 0 || total === 0) return 0;
  let weighted = 0;
  sorted.forEach((v, i) => {
    weighted += (i + 1) * v;
  });
  return (2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length;
}
