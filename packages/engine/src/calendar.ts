/** Calendario di gioco: 1 giorno reale = 1 mese, diviso in tick settimanali (GDD §2). */
export interface CalendarConfig {
  readonly ticksPerMonth: number;
  readonly monthsPerSeason: number;
}

export interface GameDate {
  /** Indice del tick dall'inizio della stagione (0-based). */
  readonly tick: number;
  /** Indice del mese dall'inizio della stagione (0-based). */
  readonly monthIndex: number;
  /** Anno di gioco (1-based). */
  readonly year: number;
  /** Mese dell'anno (1–12). */
  readonly month: number;
  /** Settimana del mese (1-based). */
  readonly week: number;
  /** L'ultimo tick del mese include la chiusura mensile. */
  readonly isMonthEnd: boolean;
  readonly isSeasonEnd: boolean;
}

export function seasonLengthInTicks(calendar: CalendarConfig): number {
  return calendar.ticksPerMonth * calendar.monthsPerSeason;
}

export function dateOfTick(tick: number, calendar: CalendarConfig): GameDate {
  if (!Number.isSafeInteger(tick) || tick < 0 || tick >= seasonLengthInTicks(calendar)) {
    throw new RangeError(`Tick fuori dalla stagione: ${tick}`);
  }
  const monthIndex = Math.floor(tick / calendar.ticksPerMonth);
  const week = (tick % calendar.ticksPerMonth) + 1;
  const isMonthEnd = week === calendar.ticksPerMonth;
  return {
    tick,
    monthIndex,
    year: Math.floor(monthIndex / 12) + 1,
    month: (monthIndex % 12) + 1,
    week,
    isMonthEnd,
    isSeasonEnd: isMonthEnd && monthIndex === calendar.monthsPerSeason - 1,
  };
}
