import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/index';

function sample(seed: string, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.nextUint32());
}

describe('generatore casuale con seed', () => {
  it('stesso seed, stessa sequenza', () => {
    expect(sample('città-1/0/mercati', 100)).toEqual(sample('città-1/0/mercati', 100));
  });

  it('seed diversi, sequenze diverse', () => {
    expect(sample('città-1/0/mercati', 100)).not.toEqual(sample('città-1/1/mercati', 100));
  });

  it('next() resta in [0, 1)', () => {
    const rng = createRng('intervallo');
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() resta negli estremi inclusi', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (seed, min, width) => {
          const value = createRng(seed).int(min, min + width);
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(min + width);
          expect(Number.isInteger(value)).toBe(true);
        },
      ),
    );
  });

  it('int() è distribuito in modo uniforme', () => {
    const rng = createRng('uniformità');
    const buckets = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) {
      const bucket = rng.int(0, 9);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(Math.abs(count - draws / 10) / (draws / 10)).toBeLessThan(0.05);
    }
  });

  it('chance() rispetta gli estremi', () => {
    const rng = createRng('probabilità');
    for (let i = 0; i < 1000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('rifiuta argomenti non validi', () => {
    const rng = createRng('errori');
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.int(0, 2 ** 33)).toThrow(RangeError);
    expect(() => rng.chance(1.1)).toThrow(RangeError);
    expect(() => rng.chance(Number.NaN)).toThrow(RangeError);
  });
});
