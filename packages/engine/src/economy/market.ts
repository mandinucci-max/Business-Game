/**
 * Modello di mercato (GDD §8): attrattività, flussi di clienti, churn, soddisfazione.
 * Funzioni pure e deterministiche, senza casualità: lo stesso input dà sempre lo stesso output.
 *
 * I "clienti" sono misurati in unità di domanda settimanale: un'azienda con 100 clienti
 * ha 100 unità a settimana di domanda che si rivolge a lei.
 */

export interface AttractivenessExponents {
  readonly quality: number;
  readonly brand: number;
  readonly service: number;
  readonly reputation: number;
  readonly location: number;
}

export interface Competitor {
  readonly id: string;
  readonly price: number;
  readonly quality: number;
  readonly brand: number;
  readonly service: number;
  readonly reputation: number;
  readonly location: number;
  /** Clienti attuali (unità di domanda settimanale). */
  readonly customers: number;
  /** Soddisfazione del tick precedente (1 = media). */
  readonly satisfaction: number;
}

/** L'operatore cittadino: l'opzione esterna sempre disponibile (GDD §6.1). */
export interface OutsideOption {
  readonly price: number;
  readonly quality: number;
  readonly brand: number;
}

export interface MarketParams {
  readonly basePrice: number;
  readonly priceElasticity: number;
  readonly exponents: AttractivenessExponents;
  /** Churn base mensile del settore. */
  readonly monthlyBaseChurn: number;
  /** γ: quanto la soddisfazione rispetto alla media sposta il churn. */
  readonly churnSatisfactionSensitivity: number;
  /** δ: pressione dei concorrenti più attraenti. */
  readonly competitorPressure: number;
  readonly maxWeeklyChurn: number;
  /** Quota della domanda non assegnata che ogni settimana cerca un nuovo fornitore. */
  readonly weeklySearchRate: number;
  /** ρ: forza del passaparola dei clienti soddisfatti. */
  readonly referralStrength: number;
  readonly minimumVisibility: number;
  readonly outside: OutsideOption;
}

export interface MarketFlows {
  /** Clienti di ogni azienda dopo il tick. */
  readonly customers: Readonly<Record<string, number>>;
  readonly acquired: Readonly<Record<string, number>>;
  readonly churned: Readonly<Record<string, number>>;
  /** Domanda rimasta all'operatore cittadino. */
  readonly outsideCustomers: number;
  readonly attractiveness: Readonly<Record<string, number>>;
  readonly outsideAttractiveness: number;
}

export function attractiveness(
  offer: {
    price: number;
    quality: number;
    brand: number;
    service: number;
    reputation: number;
    location: number;
  },
  params: Pick<MarketParams, 'basePrice' | 'priceElasticity' | 'exponents'>,
): number {
  if (!(offer.price > 0)) {
    throw new RangeError(`Prezzo non valido: ${offer.price}`);
  }
  const e = params.exponents;
  return (
    positive(offer.quality) ** e.quality *
    positive(offer.brand) ** e.brand *
    positive(offer.service) ** e.service *
    positive(offer.reputation) ** e.reputation *
    positive(offer.location) ** e.location *
    (params.basePrice / offer.price) ** params.priceElasticity
  );
}

export function outsideAttractiveness(params: MarketParams): number {
  return attractiveness({ ...params.outside, service: 1, reputation: 1, location: 1 }, params);
}

/**
 * Soddisfazione: rapporto qualità/prezzo rispetto al prezzo base, ridotta se l'azienda
 * non riesce a servire tutti i suoi clienti (GDD §8.2, punto 7).
 */
export function satisfaction(
  quality: number,
  price: number,
  basePrice: number,
  fillRate: number,
): number {
  const fill = Math.min(1, Math.max(0, fillRate));
  return Math.sqrt((positive(quality) * basePrice) / price) * Math.sqrt(fill);
}

export function weeklyRate(monthlyRate: number, weeksPerMonth: number): number {
  return 1 - (1 - monthlyRate) ** (1 / weeksPerMonth);
}

/**
 * Un tick di flussi di clienti (GDD §8.2):
 * 1. se la domanda si è ridotta, i clienti calano in proporzione;
 * 2. churn in base a soddisfazione e pressione dei concorrenti migliori;
 * 3. la domanda non assegnata (operatore + clienti persi) in parte cerca un nuovo fornitore
 *    e si distribuisce per attrattività × visibilità, operatore compreso.
 */
export function stepCustomerFlows(
  competitors: readonly Competitor[],
  demand: number,
  params: MarketParams,
  weeksPerMonth: number,
): MarketFlows {
  const totalDemand = Math.max(0, demand);
  const held = competitors.reduce((sum, c) => sum + Math.max(0, c.customers), 0);
  const contraction = held > totalDemand ? totalDemand / held : 1;

  const outsideA = outsideAttractiveness(params);
  const attract: Record<string, number> = {};
  let maxA = outsideA;
  for (const c of competitors) {
    const a = attractiveness(c, params);
    attract[c.id] = a;
    maxA = Math.max(maxA, a);
  }

  const outsideHeld = Math.max(0, totalDemand - held * contraction);
  const outsideSat = satisfaction(
    params.outside.quality,
    params.outside.price,
    params.basePrice,
    1,
  );
  let satWeighted = outsideSat * outsideHeld;
  let satWeight = outsideHeld;
  for (const c of competitors) {
    const customers = Math.max(0, c.customers) * contraction;
    satWeighted += c.satisfaction * customers;
    satWeight += customers;
  }
  const averageSat = satWeight > 0 ? satWeighted / satWeight : outsideSat;

  const baseChurn = weeklyRate(params.monthlyBaseChurn, weeksPerMonth);
  const customers: Record<string, number> = {};
  const churned: Record<string, number> = {};
  let remaining = 0;
  for (const c of competitors) {
    const current = Math.max(0, c.customers) * contraction;
    const a = attract[c.id] as number;
    const pressure = 1 + (params.competitorPressure * Math.max(0, maxA - a)) / maxA;
    const churn = Math.min(
      params.maxWeeklyChurn,
      baseChurn *
        Math.exp(-params.churnSatisfactionSensitivity * (c.satisfaction - averageSat)) *
        pressure,
    );
    const lost = current * churn;
    customers[c.id] = current - lost;
    churned[c.id] = lost;
    remaining += current - lost;
  }

  const unassigned = Math.max(0, totalDemand - remaining);
  const searching = unassigned * params.weeklySearchRate;
  const outsideWeight = outsideA * params.outside.brand;
  let totalWeight = outsideWeight;
  const weights: Record<string, number> = {};
  for (const c of competitors) {
    const share = totalDemand > 0 ? (customers[c.id] as number) / totalDemand : 0;
    const visibility =
      Math.max(params.minimumVisibility, c.brand) +
      params.referralStrength * share * Math.max(0, c.satisfaction - 1);
    const weight = (attract[c.id] as number) * visibility;
    weights[c.id] = weight;
    totalWeight += weight;
  }

  const acquired: Record<string, number> = {};
  let assigned = 0;
  for (const c of competitors) {
    const gained = totalWeight > 0 ? (searching * (weights[c.id] as number)) / totalWeight : 0;
    acquired[c.id] = gained;
    customers[c.id] = (customers[c.id] as number) + gained;
    assigned += customers[c.id] as number;
  }

  return {
    customers,
    acquired,
    churned,
    outsideCustomers: Math.max(0, totalDemand - assigned),
    attractiveness: attract,
    outsideAttractiveness: outsideA,
  };
}

/**
 * Brand (GDD §8.3): cresce in modo logaritmico con il marketing e decade ogni settimana.
 * Spendere ogni settimana `reference` porta il brand, a regime, a 1 (come l'operatore).
 */
export function nextBrand(
  brand: number,
  weeklySpend: number,
  reference: number,
  monthlyDecay: number,
  weeksPerMonth: number,
): number {
  const decay = weeklyRate(monthlyDecay, weeksPerMonth);
  const gain = decay / Math.LN2;
  return brand * (1 - decay) + gain * Math.log1p(Math.max(0, weeklySpend) / reference);
}

/** Stock di ricerca e sviluppo: si accumula con la spesa e decade. */
export function nextRndStock(
  stock: number,
  weeklySpend: number,
  monthlyDecay: number,
  weeksPerMonth: number,
): number {
  return stock * (1 - weeklyRate(monthlyDecay, weeksPerMonth)) + Math.max(0, weeklySpend);
}

/** Qualità: base × qualità degli input × rendimento decrescente della ricerca accumulata. */
export function quality(params: {
  baseQuality: number;
  inputQuality: number;
  inputQualityExponent: number;
  rndStock: number;
  rndReference: number;
  rndWeight: number;
}): number {
  return (
    params.baseQuality *
    positive(params.inputQuality) ** params.inputQualityExponent *
    (1 + params.rndWeight * Math.log1p(Math.max(0, params.rndStock) / params.rndReference))
  );
}

/** Servizio: da 1 a 1 + maxBonus in base alla spesa per unità di cliente. */
export function service(
  weeklySpend: number,
  customers: number,
  referencePerCustomer: number,
  maxBonus: number,
): number {
  const perCustomer = Math.max(0, weeklySpend) / Math.max(1, customers);
  return 1 + maxBonus * (1 - Math.exp(-perCustomer / referencePerCustomer));
}

/** Morale dei lavoratori in base al salario rispetto a quello di mercato. */
export function morale(
  wage: number,
  marketWage: number,
  exponent: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, (Math.max(0, wage) / marketWage) ** exponent));
}

/** Costi di coordinamento: crescono più che proporzionalmente con la dimensione (GDD §8.3). */
export function overhead(
  workers: number,
  base: number,
  referenceWorkers: number,
  exponent: number,
  max: number,
): number {
  return Math.min(max, base * (Math.max(0, workers) / referenceWorkers) ** exponent);
}

function positive(value: number): number {
  return Math.max(1e-6, value);
}
