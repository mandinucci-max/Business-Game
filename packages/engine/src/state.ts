import { type LedgerState, createLedger } from './ledger';

export const STATE_SCHEMA_VERSION = 1;

/** Stato completo di una città: dati puri e serializzabili. */
export interface CityState {
  schemaVersion: number;
  cityId: string;
  /** Seed della città: insieme al numero del tick determina ogni evento casuale. */
  seed: string;
  /** Numero di tick già elaborati nella stagione. */
  tick: number;
  ledger: LedgerState;
}

export function createCityState(params: { cityId: string; seed: string }): CityState {
  if (params.cityId.length === 0 || params.seed.length === 0) {
    throw new Error('cityId e seed sono obbligatori');
  }
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    cityId: params.cityId,
    seed: params.seed,
    tick: 0,
    ledger: createLedger(),
  };
}
