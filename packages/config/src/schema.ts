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
  economics: z.strictObject({
    /** Prezzo di riferimento di un'unità; l'operatore cittadino vende a questo prezzo + ricarico. */
    basePrice: positive,
    /** Quota del costo del lavoro sul prezzo base, per un lavoratore gestito dal computer. */
    laborShare: share,
    npcWageMonthly: positive,
    baseRentMonthly: z.number().min(0),
    /** Domanda minima della popolazione e dell'industria gestite dal computer (unità a settimana). */
    npcDemandFloorWeekly: z.number().min(0),
    /** Quanto la domanda scende per ogni punto di tasso sopra il neutrale. */
    interestRateSensitivity: z.number().min(0),
    /** A chi vende: persone, aziende o entrambi (le persone comprano solo dai mercati non "business"). */
    customers: z.enum(['consumer', 'business', 'mixed']),
  }),
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

const ratingRecord = <T extends z.ZodType>(value: T) => z.record(z.enum(CREDIT_RATINGS), value);

const durationSchema = z
  .strictObject({ min: z.int().min(1), max: z.int().min(1) })
  .refine((r) => r.min <= r.max, { message: 'min deve essere <= max' });

const eventSchema = z.strictObject({
  id: z.string().min(1),
  /** Eventi dello stesso gruppo non possono essere attivi insieme (es. recessione ed espansione). */
  group: z.string().min(1).optional(),
  durationMonths: durationSchema,
  effects: z
    .array(
      z.strictObject({
        sector: z.union([z.enum(SECTOR_IDS), z.literal('all')]),
        demand: positive.optional(),
        operatorPrice: positive.optional(),
      }),
    )
    .min(1),
});

const economySchema = z.strictObject({
  market: z.strictObject({
    weeklySearchRate: share,
    operatorQuality: positive,
    operatorBrand: positive,
    newCompanyBrand: positive,
    minimumVisibility: positive,
    referralStrength: z.number().min(0),
    maxWeeklyChurn: share,
    projectMonthlyTurnover: share,
    serviceExponent: z.number().min(0),
    reputationExponent: z.number().min(0),
    reputationWeeklySmoothing: share,
    marketingReferenceShare: positive,
    rndReferenceShare: positive,
    rndMonthlyDecay: share,
    rndQualityWeight: z.number().min(0),
    inputQualityExponent: z.number().min(0),
    baseQuality: positive,
    serviceReferenceShare: positive,
    serviceMaxBonus: z.number().min(0),
    locationSpread: share,
    overheadBase: share,
    overheadReferenceWorkers: positive,
    maxOverhead: share,
    rentPerWorkerFactor: z.number().min(0),
  }),
  labour: z.strictObject({
    startingUnemployment: share,
    moraleWageExponent: z.number().min(0),
    moraleMin: positive,
    moraleMax: positive,
    trainingMaxBonus: z.number().min(0),
    trainingReferencePerWorkerWeekly: positive,
    lowMoraleWeeklyQuitRate: share,
    /** Sussidio dopo la perdita del reddito, in quota del salario base del dipendente (GDD §10.1). */
    unemploymentBenefitShare: share,
    unemploymentBenefitMonths: z.int().min(0),
    maxWorkersByLegalForm: z.record(z.enum(LEGAL_FORMS), z.int().min(1)),
  }),
  demand: z.strictObject({
    payrollMultiplierMin: positive,
    payrollMultiplierMax: positive,
    payrollReferenceMonthly: positive,
    minimumDemandMultiplier: share,
  }),
  macro: z.strictObject({
    inflationTarget: z.number(),
    unemploymentTarget: share,
    neutralRate: z.number().min(0),
    inflationWeight: z.number().min(0),
    unemploymentWeight: z.number().min(0),
    minRate: z.number().min(0),
    maxRate: z.number().min(0),
    maxMonthlyRateStep: z.number().min(0),
    stabilizerStep: z.number().min(0),
    stabilizerMin: positive,
    stabilizerMax: positive,
    stabilizerTolerance: z.number().min(0),
    monthlyEventProbability: share,
    /** Curva di Phillips: quanto salari e prezzi accelerano se la disoccupazione è sotto l'obiettivo. */
    phillipsSlope: z.number().min(0),
    maxAnnualCostInflation: z.number(),
    minAnnualCostInflation: z.number(),
    /** Migrazione: la forza lavoro cresce se la disoccupazione è sotto l'obiettivo e cala se è sopra. */
    migrationSensitivity: z.number().min(0),
    maxMonthlyMigration: share,
  }),
  events: z.array(eventSchema),
  bank: z.strictObject({
    /** Spread sul tasso di riferimento per rating; null = nessun credito. */
    spreads: ratingRecord(z.number().min(0).nullable()),
    depositSpreadBelowPolicy: z.number().min(0),
    maxDebtServiceRatio: share,
    maxLoanTermMonths: z.int().min(1),
    /** Tick concessi per saldare gli arretrati prima dell'insolvenza. */
    arrearsGraceTicks: z.int().min(1),
  }),
  taxes: z.strictObject({
    personalBrackets: z
      .array(z.strictObject({ upTo: positive.nullable(), rate: share }))
      .min(1)
      .refine((brackets) => brackets.at(-1)?.upTo === null, {
        message: "l'ultimo scaglione deve essere aperto (upTo: null)",
      })
      .refine(
        (brackets) =>
          brackets.every((b, i) => i === 0 || (b.upTo ?? Infinity) > (brackets[i - 1]?.upTo ?? 0)),
        { message: 'gli scaglioni devono essere crescenti' },
      ),
    corporate: share,
    capital: share,
  }),
  lifestyle: z.strictObject({
    monthlyCostByLevel: z.array(positive).length(5),
    basketShares: z.partialRecord(z.enum(SECTOR_IDS), share),
    housingShare: share,
  }),
  indexFund: z.strictObject({
    equityPremium: z.number(),
    monthlyVolatility: z.number().min(0),
  }),
  npcIncome: z.strictObject({
    freelancerMonthlyVolatility: z.number().min(0),
  }),
  start: z.strictObject({
    entrepreneurStartingWorkers: z.int().min(1),
    startingPriceMarkup: positive,
  }),
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
    economy: economySchema,
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
      const inputTotal = Object.values(inputs).reduce((sum, value) => sum + value, 0);
      const total = inputTotal + config.sectors[sectorId].economics.laborShare;
      if (total >= 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['sectors', sectorId, 'inputShares'],
          message: `la somma degli input e del lavoro (${total}) deve essere < 1: serve un margine`,
        });
      }
    }

    const { lifestyle, macro } = config.economy;
    const basketTotal =
      Object.values(lifestyle.basketShares).reduce((sum, value) => sum + value, 0) +
      lifestyle.housingShare;
    if (Math.abs(basketTotal - 1) > 1e-9) {
      ctx.addIssue({
        code: 'custom',
        path: ['economy', 'lifestyle'],
        message: `le quote del paniere devono sommare a 1 (ora ${basketTotal})`,
      });
    }
    for (const sectorId of Object.keys(lifestyle.basketShares) as SectorId[]) {
      if (config.sectors[sectorId].economics.customers === 'business') {
        ctx.addIssue({
          code: 'custom',
          path: ['economy', 'lifestyle', 'basketShares', sectorId],
          message: 'le persone non possono comprare da un settore che vende solo alle aziende',
        });
      }
    }
    if (macro.minRate > macro.maxRate || macro.stabilizerMin > macro.stabilizerMax) {
      ctx.addIssue({ code: 'custom', path: ['economy', 'macro'], message: 'limiti min > max' });
    }
    const ids = config.economy.events.map((event) => event.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['economy', 'events'], message: 'id evento duplicato' });
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
export type EconomyConfig = BalanceConfig['economy'];
export type LegalForm = (typeof LEGAL_FORMS)[number];
