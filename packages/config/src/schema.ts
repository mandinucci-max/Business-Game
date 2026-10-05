import { z } from 'zod';

/** Settori al lancio (GDD §6). */
export const SECTOR_IDS = [
  'energy',
  'raw_materials',
  'manufacturing',
  'construction',
  'logistics',
  'technology',
  'retail',
  'food_service',
  'finance',
] as const;
export type SectorId = (typeof SECTOR_IDS)[number];

/** Classi di gioco (GDD §4). */
export const CLASS_IDS = ['employee', 'freelancer', 'entrepreneur', 'investor'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** Competenze (GDD §5.1). */
export const SKILL_IDS = [
  'technical',
  'commercial',
  'legal',
  'accounting_tax',
  'finance',
  'management',
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** Rating di credito, dal migliore al peggiore (GDD §12.1). */
export const CREDIT_RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'] as const;
export type CreditRating = (typeof CREDIT_RATINGS)[number];

export const LEGAL_FORMS = ['sole_proprietorship', 'srl', 'spa', 'spa_with_license'] as const;

const share = z.number().min(0).max(1);
const positive = z.number().positive();
const credits = z.number().finite();

const range = (value: z.ZodNumber) =>
  z
    .strictObject({ min: value, max: value })
    .refine((r) => r.min <= r.max, { message: 'min deve essere <= max' });

const sectorSchema = z.strictObject({
  entryLegalForm: z.enum(LEGAL_FORMS),
  priceElasticity: positive,
  /** null = settore a progetto, senza churn mensile dei clienti (Edilizia). */
  baseMonthlyChurn: share.nullable(),
  attractivenessExponents: z.strictObject({
    quality: z.number().min(0),
    brand: z.number().min(0),
    location: z.number().min(0),
  }),
  valuationMultiple: positive,
  inputShares: z.partialRecord(z.enum(SECTOR_IDS), share),
});

const globalSchema = z.strictObject({
  time: z.strictObject({
    ticksPerMonth: z.int().min(1),
    monthsPerSeason: z.int().min(1),
    hoursPerMonth: z.int().min(1),
    maxHoursPerMonth: z.int().min(1),
  }),
  npc: z.strictObject({
    cityOperatorMarkup: z.number().min(0),
    workerProductivity: share,
    professionalCostMultiplier: z.number().min(1),
    professionalEffectiveness: share,
  }),
  market: z.strictObject({
    antitrustThreshold: share,
    churnSatisfactionSensitivity: z.number().min(0),
    competitorPressure: z.number().min(0),
    brandMonthlyDecay: share,
    overheadExponent: z.number().min(1),
    professionalServiceEffectCap: share,
  }),
  fees: z.strictObject({
    marketplace: share,
    stockExchange: share,
  }),
  stockExchange: z.strictObject({
    circuitBreakerMove: share,
  }),
  ranking: z.strictObject({
    passiveCashflowMultiplier: z.number().min(0),
    reputationFactorMin: positive,
    reputationFactorMax: positive,
  }),
  finance: z.strictObject({
    bankMaxLeverage: z.number().min(1),
    personalFundCapMultiple: z.number().min(1),
  }),
  consortium: z.strictObject({
    maxMembers: z.int().min(2),
    exitPenalty: share,
    maxInternalDiscount: share,
  }),
});

const debtSchema = z.strictObject({
  label: z.string().min(1),
  principal: positive,
  annualRate: z.number().min(0),
  termMonths: z.int().min(1),
});

const startingClassSchema = z.strictObject({
  cash: z.number().min(0),
  otherAssets: z.number().min(0),
  debts: z.array(debtSchema),
  monthlyIncome: range(credits),
  creditRating: z.enum(CREDIT_RATINGS),
  fixedSkills: z.partialRecord(z.enum(SKILL_IDS), z.int().min(1).max(10)),
  /** Livello della competenza scelta a inizio partita (ruolo o professione); null se non prevista. */
  chosenSkillLevel: z.int().min(1).max(10).nullable(),
  freeHours: z.int().min(0),
});

const classesSchema = z.strictObject({
  startingNetWorth: positive,
  originTalentXpBonus: z.number().min(0),
  classes: z.record(z.enum(CLASS_IDS), startingClassSchema),
});

const healthTargetsSchema = z.strictObject({
  topTenShareByOriginClass: range(share),
  annualInflation: range(z.number()),
  unemployment: range(share),
  minSectorsWithPlayerCompanyByMonth24: z.int().min(0).max(SECTOR_IDS.length),
  companyFailureRatePerSeason: range(share),
  monthsToFirstUpgrade: range(z.number().min(0)),
  netWorthGini: range(share),
});

export const balanceConfigSchema = z
  .strictObject({
    sectors: z.record(z.enum(SECTOR_IDS), sectorSchema),
    global: globalSchema,
    classes: classesSchema,
    healthTargets: healthTargetsSchema,
  })
  .superRefine((config, ctx) => {
    for (const sectorId of SECTOR_IDS) {
      const inputs = config.sectors[sectorId].inputShares;
      if (inputs[sectorId] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sectors', sectorId, 'inputShares', sectorId],
          message: 'un settore non può usare sé stesso come input',
        });
      }
      const total = Object.values(inputs).reduce((sum, value) => sum + value, 0);
      if (total >= 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['sectors', sectorId, 'inputShares'],
          message: `la somma degli input (${total}) deve essere < 1: serve spazio per lavoro e sede`,
        });
      }
    }

    const { time, ranking } = config.global;
    if (time.maxHoursPerMonth < time.hoursPerMonth) {
      ctx.addIssue({
        code: 'custom',
        path: ['global', 'time', 'maxHoursPerMonth'],
        message: 'maxHoursPerMonth deve essere >= hoursPerMonth',
      });
    }
    if (ranking.reputationFactorMin > ranking.reputationFactorMax) {
      ctx.addIssue({
        code: 'custom',
        path: ['global', 'ranking'],
        message: 'reputationFactorMin deve essere <= reputationFactorMax',
      });
    }

    // GDD §4.1: tutte le classi partono con lo stesso patrimonio netto.
    for (const classId of CLASS_IDS) {
      const start = config.classes.classes[classId];
      const debts = start.debts.reduce((sum, debt) => sum + debt.principal, 0);
      const netWorth = start.cash + start.otherAssets - debts;
      if (netWorth !== config.classes.startingNetWorth) {
        ctx.addIssue({
          code: 'custom',
          path: ['classes', 'classes', classId],
          message: `patrimonio netto iniziale ${netWorth} diverso da ${config.classes.startingNetWorth}`,
        });
      }
    }
  });

export type BalanceConfig = z.infer<typeof balanceConfigSchema>;
export type SectorConfig = BalanceConfig['sectors'][SectorId];
export type StartingClassConfig = BalanceConfig['classes']['classes'][ClassId];
