import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Competitor,
  type MarketParams,
  attractiveness,
  nextBrand,
  overhead,
  satisfaction,
  stepCustomerFlows,
} from '../src/economy/market';

const params: MarketParams = {
  basePrice: 15,
  priceElasticity: 1,
  exponents: { quality: 0.9, brand: 0.4, service: 0.3, reputation: 0.3, location: 0.9 },
  monthlyBaseChurn: 0.07,
  churnSatisfactionSensitivity: 2,
  competitorPressure: 0.5,
  maxWeeklyChurn: 0.5,
  weeklySearchRate: 0.25,
  referralStrength: 2,
  minimumVisibility: 0.05,
  outside: { price: 19.5, quality: 0.8, brand: 1 },
};

function company(id: string, overrides: Partial<Competitor> = {}): Competitor {
  return {
    id,
    price: 17,
    quality: 1,
    brand: 0.5,
    service: 1,
    reputation: 1,
    location: 1,
    customers: 0,
    satisfaction: 1,
    ...overrides,
  };
}

/** Simula N settimane in cui ogni azienda serve tutti i suoi clienti. */
function simulate(competitors: Competitor[], weeks: number, demand = 10_000) {
  let current = competitors;
  for (let week = 0; week < weeks; week++) {
    const flows = stepCustomerFlows(current, demand, params, 4);
    current = current.map((c) => ({
      ...c,
      customers: flows.customers[c.id] as number,
      satisfaction: satisfaction(c.quality, c.price, params.basePrice, 1),
    }));
  }
  return Object.fromEntries(current.map((c) => [c.id, c.customers]));
}

describe('attrattività', () => {
  it('cresce con qualità e brand, cala con il prezzo', () => {
    const base = company('a');
    const a = attractiveness(base, params);
    expect(attractiveness({ ...base, quality: 1.2 }, params)).toBeGreaterThan(a);
    expect(attractiveness({ ...base, brand: 1 }, params)).toBeGreaterThan(a);
    expect(attractiveness({ ...base, price: 20 }, params)).toBeLessThan(a);
  });

  it('rifiuta prezzi non positivi', () => {
    expect(() => attractiveness(company('a', { price: 0 }), params)).toThrow(RangeError);
  });
});

describe('flussi di clienti', () => {
  it('chi ha il miglior insieme di fattori prospera di più (causalità)', () => {
    const result = simulate(
      [
        company('migliore', { price: 16, quality: 1.2 }),
        company('media'),
        company('peggiore', { price: 18.5, quality: 0.85 }),
      ],
      52,
    );
    expect(result.migliore).toBeGreaterThan(result.media as number);
    expect(result.media).toBeGreaterThan(result.peggiore as number);
  });

  it("aziende migliori dell'operatore gli sottraggono domanda nel tempo", () => {
    const early = stepCustomerFlows([company('a', { price: 15, quality: 1.2 })], 10_000, params, 4);
    const late = simulate([company('a', { price: 15, quality: 1.2 })], 52);
    expect(late.a).toBeGreaterThan(early.customers.a as number);
    expect(late.a).toBeGreaterThan(5_000);
  });

  it('non servire i clienti abbassa la soddisfazione e alza il churn', () => {
    const served = company('servita', {
      customers: 1000,
      satisfaction: satisfaction(1, 17, 15, 1),
    });
    const unserved = company('non_servita', {
      customers: 1000,
      satisfaction: satisfaction(1, 17, 15, 0.4),
    });
    const flows = stepCustomerFlows([served, unserved], 10_000, params, 4);
    expect(flows.churned.non_servita).toBeGreaterThan(flows.churned.servita as number);
  });

  it('se la domanda cala, i clienti si riducono in proporzione', () => {
    const flows = stepCustomerFlows(
      [company('a', { customers: 6000 }), company('b', { customers: 4000 })],
      5000,
      { ...params, weeklySearchRate: 0 },
      4,
    );
    const total = (flows.customers.a as number) + (flows.customers.b as number);
    expect(total).toBeLessThanOrEqual(5000);
  });

  it('conserva la domanda e non produce valori negativi', () => {
    const competitor = fc.record({
      price: fc.double({ min: 5, max: 40, noNaN: true }),
      quality: fc.double({ min: 0.3, max: 3, noNaN: true }),
      brand: fc.double({ min: 0, max: 3, noNaN: true }),
      customers: fc.double({ min: 0, max: 20_000, noNaN: true }),
      satisfaction: fc.double({ min: 0, max: 2, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.array(competitor, { maxLength: 8 }),
        fc.double({ min: 0, max: 50_000, noNaN: true }),
        (offers, demand) => {
          const competitors = offers.map((o, i) => company(`c${i}`, o));
          const flows = stepCustomerFlows(competitors, demand, params, 4);
          let total = flows.outsideCustomers;
          for (const c of competitors) {
            const value = flows.customers[c.id] as number;
            expect(value).toBeGreaterThanOrEqual(0);
            total += value;
          }
          expect(total).toBeCloseTo(demand, 6);
        },
      ),
    );
  });
});

describe('stock e costi', () => {
  it('il brand converge a 1 spendendo il riferimento ogni settimana', () => {
    let brand = 0.2;
    for (let week = 0; week < 2000; week++) {
      brand = nextBrand(brand, 1000, 1000, 0.05, 4);
    }
    expect(brand).toBeCloseTo(1, 2);
  });

  it('senza marketing il brand decade', () => {
    expect(nextBrand(1, 0, 1000, 0.05, 4)).toBeLessThan(1);
  });

  it("l'overhead cresce più che proporzionalmente ed è limitato", () => {
    const small = overhead(10, 0.05, 20, 1.3, 0.5);
    const large = overhead(20, 0.05, 20, 1.3, 0.5);
    expect(large / small).toBeGreaterThan(2);
    expect(overhead(10_000, 0.05, 20, 1.3, 0.5)).toBe(0.5);
  });
});
