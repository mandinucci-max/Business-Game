import { describe, expect, it } from 'vitest';
import { dateOfTick, seasonLengthInTicks } from '../src/index';

const calendar = { ticksPerMonth: 4, monthsPerSeason: 60 };

describe('calendario di gioco', () => {
  it('una stagione dura 5 anni esatti', () => {
    expect(seasonLengthInTicks(calendar)).toBe(240);
  });

  it('il primo tick è la prima settimana del primo mese', () => {
    expect(dateOfTick(0, calendar)).toEqual({
      tick: 0,
      monthIndex: 0,
      year: 1,
      month: 1,
      week: 1,
      isMonthEnd: false,
      isSeasonEnd: false,
    });
  });

  it("l'ultimo tick del mese include la chiusura mensile", () => {
    expect(dateOfTick(3, calendar).isMonthEnd).toBe(true);
    expect(dateOfTick(4, calendar)).toMatchObject({ monthIndex: 1, month: 2, week: 1 });
  });

  it('cambia anno dopo 12 mesi', () => {
    expect(dateOfTick(48, calendar)).toMatchObject({ year: 2, month: 1 });
  });

  it("l'ultimo tick chiude la stagione", () => {
    expect(dateOfTick(239, calendar)).toMatchObject({
      year: 5,
      month: 12,
      isMonthEnd: true,
      isSeasonEnd: true,
    });
  });

  it('rifiuta tick fuori dalla stagione', () => {
    expect(() => dateOfTick(-1, calendar)).toThrow(RangeError);
    expect(() => dateOfTick(240, calendar)).toThrow(RangeError);
    expect(() => dateOfTick(1.5, calendar)).toThrow(RangeError);
  });
});
