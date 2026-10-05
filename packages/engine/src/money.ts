/**
 * Importi monetari. Nel registro i Crediti sono sempre interi: 1 Cr = 100 unità.
 * Niente virgola mobile nei saldi: evita errori di arrotondamento sfruttabili come exploit.
 */
export type Amount = number & { readonly __brand: 'Amount' };

export const UNITS_PER_CREDIT = 100;

export class AmountError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'AmountError';
  }
}

/** Crea un importo da unità intere; rifiuta decimali, NaN, infiniti e numeri oltre l'intero sicuro. */
export function amount(units: number): Amount {
  if (!Number.isSafeInteger(units)) {
    throw new AmountError(`Importo non valido: ${units} (servono unità intere sicure)`);
  }
  // Normalizza -0 a 0.
  return (units === 0 ? 0 : units) as Amount;
}

export const ZERO = amount(0);

/** Converte Crediti (es. dalla configurazione) in unità, arrotondando al centesimo. */
export function credits(value: number): Amount {
  if (!Number.isFinite(value)) {
    throw new AmountError(`Valore in Crediti non valido: ${value}`);
  }
  return amount(roundHalfAwayFromZero(value * UNITS_PER_CREDIT));
}

export function toCredits(value: Amount): number {
  return value / UNITS_PER_CREDIT;
}

export function add(a: Amount, b: Amount): Amount {
  return amount(a + b);
}

export function subtract(a: Amount, b: Amount): Amount {
  return amount(a - b);
}

export function negate(a: Amount): Amount {
  return amount(-a);
}

/** Moltiplica per un fattore (tassi, percentuali) con la regola di arrotondamento unica del gioco. */
export function multiply(a: Amount, factor: number): Amount {
  if (!Number.isFinite(factor)) {
    throw new AmountError(`Fattore non valido: ${factor}`);
  }
  return amount(roundHalfAwayFromZero(a * factor));
}

/** Regola di arrotondamento unica: metà lontano da zero, simmetrica per importi positivi e negativi. */
export function roundHalfAwayFromZero(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}
