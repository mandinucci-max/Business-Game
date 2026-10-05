import {
  type BalanceConfig,
  CLASS_IDS,
  type ClassId,
  type LegalForm,
  SECTOR_IDS,
  type SectorId,
} from '@business-game/config';
import {
  type CityState,
  type Command,
  type CommandHandlers,
  CommandRejectedError,
  DEFAULT_COMMAND_HANDLERS,
  checkLedgerInvariants,
  circulatingSupply,
  createCityState,
  createRng,
  credits,
  economicValue,
  foundCompany,
  runTick,
  toCredits,
} from '@business-game/engine';
import { type BotProfile, type Strategy, decide, makeStrategy } from './bots';

export type Population = Readonly<Record<ClassId, number>>;

export interface ScenarioOptions {
  readonly seed: string;
  readonly population: Population;
  /** Mesi da simulare (predefinito: l'intera stagione). */
  readonly months?: number;
  /**
   * Aggiunge aziende di prova nei settori non accessibili alle ditte (SRL, SPA), per esercitare
   * tutta la filiera prima che esistano le regole di crescita della Fase 2.
   */
  readonly fullSupplyChain?: boolean;
}

export interface MonthSnapshot {
  readonly month: number;
  readonly inflation: number;
  readonly unemployment: number;
  readonly policyRate: number;
  readonly cpi: number;
  readonly costIndex: number;
  readonly demandStabilizer: number;
  readonly moneySupply: number;
  readonly activeCompanies: Readonly<Record<SectorId, number>>;
  /** Quota della domanda servita dalle aziende dei giocatori. */
  readonly playerShare: Readonly<Record<SectorId, number>>;
  readonly activeEvents: readonly string[];
}

export interface PlayerOutcome {
  readonly playerId: string;
  readonly classId: ClassId;
  readonly strategy: Strategy['name'];
  readonly economicValue: number;
  readonly bankruptcies: number;
}

export interface SeasonResult {
  readonly seed: string;
  readonly months: readonly MonthSnapshot[];
  readonly outcomes: readonly PlayerOutcome[];
  readonly companiesFounded: number;
  readonly companiesBankrupt: number;
  readonly rejectedCommands: number;
  readonly rejectionSamples: readonly string[];
  readonly invariantViolations: readonly string[];
}

const STARTER_SECTORS: readonly SectorId[] = SECTOR_IDS.filter(
  (s) => s === 'logistics' || s === 'technology' || s === 'retail' || s === 'food_service',
);

/** Settori della filiera completa e capitale delle aziende di prova (solo simulazione). */
const CHAIN_COMPANIES: readonly { sector: SectorId; legalForm: LegalForm; capital: number }[] = [
  { sector: 'raw_materials', legalForm: 'srl', capital: 60_000 },
  { sector: 'manufacturing', legalForm: 'srl', capital: 80_000 },
  { sector: 'construction', legalForm: 'srl', capital: 80_000 },
  { sector: 'energy', legalForm: 'spa', capital: 200_000 },
  { sector: 'finance', legalForm: 'spa_with_license', capital: 200_000 },
];

/** Comando riservato alla simulazione: fonda un'azienda saltando le regole di sblocco. */
const SIM_HANDLERS: CommandHandlers = {
  ...DEFAULT_COMMAND_HANDLERS,
  'sim.foundCompany': (ctx, command) => {
    const payload = command.payload as { sector: SectorId; legalForm: LegalForm; capital: number };
    const owner = ctx.state.players[command.playerId];
    if (owner === undefined) throw new CommandRejectedError('Giocatore inesistente');
    const company = foundCompany(ctx, {
      ownerId: owner.id,
      sector: payload.sector,
      legalForm: payload.legalForm,
      equipment: payload.capital / 2,
      creditRating: 'BBB',
      rng: ctx.rng(`sim:${owner.id}`),
    });
    ctx.post({
      kind: 'faucet',
      reason: 'sim:capital',
      postings: [
        { account: 'system:mint', amount: credits(-payload.capital / 2) },
        { account: company.account, amount: credits(payload.capital / 2) },
      ],
    });
  },
};

/** Prefisso dei bot che gestiscono le aziende di prova della filiera: esclusi dai risultati. */
const CHAIN_PREFIX = 'chain-';

export function createBots(options: ScenarioOptions): BotProfile[] {
  const rng = createRng(`${options.seed}/bots`);
  const names: Strategy['name'][] = ['prudent', 'aggressive', 'random'];
  const bots: BotProfile[] = [];
  for (const classId of CLASS_IDS) {
    for (let i = 0; i < options.population[classId]; i++) {
      bots.push({
        playerId: `${classId}-${i}`,
        classId,
        strategy: makeStrategy(names[i % names.length] as Strategy['name'], rng),
        ...(classId === 'entrepreneur'
          ? { sector: STARTER_SECTORS[i % STARTER_SECTORS.length] as SectorId }
          : {}),
      });
    }
  }
  if (options.fullSupplyChain === true) {
    for (const company of CHAIN_COMPANIES) {
      bots.push({
        playerId: `${CHAIN_PREFIX}${company.sector}`,
        classId: 'investor',
        strategy: makeStrategy('prudent', rng),
      });
    }
  }
  return bots;
}

export function runSeason(options: ScenarioOptions, config: BalanceConfig): SeasonResult {
  const ticksPerMonth = config.global.time.ticksPerMonth;
  const months = options.months ?? config.global.time.monthsPerSeason;
  const bots = createBots(options);
  const rng = createRng(`${options.seed}/decisions`);
  let state: CityState = createCityState({ cityId: 'sim', seed: options.seed, config });

  const snapshots: MonthSnapshot[] = [];
  const rejectionSamples: string[] = [];
  let rejected = 0;
  let bankrupt = 0;

  for (let tick = 0; tick < months * ticksPerMonth; tick++) {
    const commands: Command[] = bots.flatMap((bot) => decide(bot, state, config, rng));
    if (tick === 1 && options.fullSupplyChain === true) {
      commands.push(...chainCommands());
    }
    const result = runTick(state, commands, config, {
      commandHandlers: SIM_HANDLERS,
      recordTransactions: false,
    });
    state = result.state;
    rejected += result.report.rejectedCommands.length;
    for (const rejection of result.report.rejectedCommands) {
      if (rejectionSamples.length < 10) {
        rejectionSamples.push(`${rejection.commandId}: ${rejection.message}`);
      }
    }
    bankrupt += result.report.events.filter((e) => e.type === 'company_bankrupt').length;
    if (result.report.date.isMonthEnd) {
      snapshots.push(snapshot(state, result.report.date.monthIndex + 1));
    }
  }

  const outcomes = bots
    .filter((bot) => !bot.playerId.startsWith(CHAIN_PREFIX))
    .map((bot) => ({
      playerId: bot.playerId,
      classId: bot.classId,
      strategy: bot.strategy.name,
      economicValue: toCredits(economicValue(state, config, bot.playerId)),
      bankruptcies: state.players[bot.playerId]?.bankruptcies ?? 0,
    }));

  return {
    seed: options.seed,
    months: snapshots,
    outcomes,
    companiesFounded: Object.keys(state.companies).length,
    companiesBankrupt: bankrupt,
    rejectedCommands: rejected,
    rejectionSamples,
    invariantViolations: checkLedgerInvariants(state.ledger),
  };
}

function chainCommands(): Command[] {
  return CHAIN_COMPANIES.map((company, i) => ({
    id: `sim:chain:${i}`,
    playerId: `${CHAIN_PREFIX}${company.sector}`,
    type: 'sim.foundCompany',
    payload: company,
  }));
}

function snapshot(state: CityState, month: number): MonthSnapshot {
  const activeCompanies = {} as Record<SectorId, number>;
  const playerShare = {} as Record<SectorId, number>;
  for (const sector of SECTOR_IDS) {
    activeCompanies[sector] = Object.values(state.companies).filter(
      (c) => c.status === 'active' && c.sector === sector,
    ).length;
    const market = state.markets[sector];
    playerShare[sector] = market.demand > 0 ? market.playerSales / market.demand : 0;
  }
  return {
    month,
    inflation: state.macro.inflation,
    unemployment: state.macro.unemployment,
    policyRate: state.macro.policyRate,
    cpi: state.macro.cpiHistory.at(-1) ?? 1,
    costIndex: state.macro.costIndex,
    demandStabilizer: state.macro.demandStabilizer,
    moneySupply: toCredits(circulatingSupply(state.ledger)),
    activeCompanies,
    playerShare,
    activeEvents: state.macro.activeEvents.map((e) => e.id),
  };
}
