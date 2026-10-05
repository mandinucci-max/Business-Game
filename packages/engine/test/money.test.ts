import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AmountError,
  add,
  amount,
  credits,
  multiply,
  negate,
  roundHalfAwayFromZero,
  toCredits,
} from '../src/index';

describe('importi', () => {
  it('accetta solo interi sicuri', () => {
    expect(amount(150)).toBe(150);
    expect(() => amount(1.5)).toThrow(AmountError);
    expect(() => amount(Number.NaN)).toThrow(AmountError);
    expect(() => amount(Number.POSITIVE_INFINITY)).toThrow(AmountError);
    expect(() => amount(Number.MAX_SAFE_INTEGER + 1)).toThrow(AmountError);
  });

  it('normalizza -0', () => {
    expect(Object.is(amount(-0), 0)).toBe(true);
    expect(Object.is(negate(amount(0)), 0)).toBe(true);
  });

  it('converte Crediti in unità e viceversa', () => {
    expect(credits(2200)).toBe(220_000);
    expect(credits(12.34)).toBe(1234);
    expect(toCredits(amount(1234))).toBe(12.34);
  });

  it('rifiuta somme che escono dagli interi sicuri', () => {
    expect(() => add(amount(Number.MAX_SAFE_INTEGER), amount(1))).toThrow(AmountError);
  });

  it('arrotonda a metà lontano da zero, in modo simmetrico', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(multiply(amount(5), 0.5)).toBe(3);
    expect(multiply(amount(-5), 0.5)).toBe(-3);
    expect(() => multiply(amount(5), Number.NaN)).toThrow(AmountError);
  });

  it('multiply è simmetrico rispetto al segno', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        (units, factor) => {
          expect(multiply(amount(-units), factor)).toBe(negate(multiply(amount(units), factor)));
        },
      ),
    );
  });
});
