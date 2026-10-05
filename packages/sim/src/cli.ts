import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadBalanceConfig } from '@business-game/config';
import { buildReport, formatReport } from './report';
import { type SeasonResult, runSeason } from './simulate';

/**
 * Simulatore di bilanciamento: gioca N stagioni con i bot e confronta i risultati con gli
 * obiettivi di salute.
 *
 *   npm run sim -- --seasons 20 --players 200 --out report.md
 *
 * Per dividere il lavoro su più processi:
 *   npm run sim -- --seasons 250 --start 0 --json a.json   (e così via per gli altri blocchi)
 *   npm run sim -- --merge a.json,b.json,c.json,d.json --out report.md
 */
const { values } = parseArgs({
  options: {
    seasons: { type: 'string', default: '10' },
    start: { type: 'string', default: '0' },
    players: { type: 'string', default: '200' },
    months: { type: 'string' },
    seed: { type: 'string', default: 'bilanciamento' },
    'full-chain': { type: 'boolean', default: true },
    out: { type: 'string' },
    json: { type: 'string' },
    merge: { type: 'string' },
  },
});

const config = loadBalanceConfig();
const started = performance.now();
let results: SeasonResult[];

if (values.merge !== undefined) {
  results = values.merge
    .split(',')
    .flatMap((file) => JSON.parse(readFileSync(file, 'utf8')) as SeasonResult[]);
} else {
  const seasons = Number(values.seasons);
  const start = Number(values.start);
  const players = Number(values.players);
  if (
    !Number.isInteger(seasons) ||
    seasons < 1 ||
    !Number.isInteger(start) ||
    start < 0 ||
    !Number.isInteger(players) ||
    players < 4
  ) {
    throw new Error('--seasons, --start e --players devono essere interi validi (players >= 4)');
  }
  const quarter = Math.floor(players / 4);
  const population = {
    employee: players - 3 * quarter,
    freelancer: quarter,
    entrepreneur: quarter,
    investor: quarter,
  };
  results = [];
  for (let i = start; i < start + seasons; i++) {
    results.push(
      runSeason(
        {
          seed: `${values.seed}-${i}`,
          population,
          fullSupplyChain: values['full-chain'],
          ...(values.months === undefined ? {} : { months: Number(values.months) }),
        },
        config,
      ),
    );
    process.stderr.write(`stagione ${i - start + 1}/${seasons} completata\n`);
  }
  if (values.json !== undefined) writeFileSync(values.json, JSON.stringify(results));
}

const report = buildReport(results, config);
const text = formatReport(report);
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`${text}\n\nTempo: ${seconds} s`);
if (values.out !== undefined) writeFileSync(values.out, `${text}\n`);
process.exitCode = report.checks.some((c) => c.status === 'fuori') ? 1 : 0;
