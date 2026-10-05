import { centralBank, monthlyPayments, monthlyTaxes, updateRatings } from './economy/monthly';
import {
  handleInsolvency,
  produce,
  runMarkets,
  updateCapacity,
  updateInputQuality,
  updateLabour,
  updateMarketConditions,
  weeklyAccounting,
} from './economy/weekly';
import { monthlyProgression } from './economy/progression';
import type { Pipeline } from './tick';

/** Ordine delle fasi del tick (piano §2.5). Le fasi senza `run` arrivano nelle fasi successive del piano. */
export const DEFAULT_PIPELINE: Pipeline = {
  weekly: [
    { name: 'macro_and_events', run: updateMarketConditions },
    { name: 'labour_market', run: updateLabour },
    { name: 'production_capacity', run: updateCapacity },
    { name: 'procurement', run: updateInputQuality },
    { name: 'production', run: produce },
    { name: 'markets', run: runMarkets },
    { name: 'weekly_accounting', run: weeklyAccounting },
    { name: 'contracts_and_insolvency', run: handleInsolvency },
  ],
  monthly: [
    { name: 'monthly_payments', run: monthlyPayments },
    { name: 'taxes_dividends_fees', run: monthlyTaxes },
    { name: 'progression', run: monthlyProgression },
    { name: 'capital_bands' },
    { name: 'central_bank', run: centralBank },
    { name: 'valuation_and_rankings', run: updateRatings },
    { name: 'hours_reset_and_reports' },
  ],
};
