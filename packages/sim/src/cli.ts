import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadBalanceConfig } from '@business-game/config';
import { buildReport, formatReport } from './report';
import { runSeason } from './simulate';

/**
 * Simulatore di bilanciamento: gioca N stagioni con i bot e confronta i risultati con gli
 * obiettivi di salute. Uso: npm run sim -- --seasons 20 --players 200 --out report.md
 */
const { values } = parseArgs({
  options: {
    seasons: { type: 'string', default: '10' },
    players: { type: 'string', default: '200' },
    months: { type: 'string' },
    seed: { type: 'string', default: 'bilanciamento' },
    'full-chain': { type: 'boolean', default: true },
    out: { type: 'string' },
  },
});

const config = loadBalanceConfig();
const seasons = Number(values.seasons);
const players = Number(values.players);
if (!Number.isInteger(seasons) || seasons < 1 || !Number.isInteger(players) || players < 4) {
  throw new Error('--seasons e --players devono essere interi positivi (players >= 4)');
}
const quarter = Math.floor(players / 4);
const population = {
  employee: players - 3 * quarter,
  freelancer: quarter,
  entrepreneur: quarter,
  investor: quarter,
};

const started = performance.now();
const results = [];
for (let i = 0; i < seasons; i++) {
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
  process.stderr.write(`stagione ${i + 1}/${seasons} completata\n`);
}

const report = formatReport(buildReport(results, config));
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`${report}\n\nTempo: ${seconds} s`);
if (values.out !== undefined) writeFileSync(values.out, `${report}\n`);

const failed = buildReport(results, config).checks.some((c) => c.status === 'fuori');
process.exitCode = failed ? 1 : 0;
