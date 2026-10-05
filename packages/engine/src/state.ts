import {
  type BalanceConfig,
  type ClassId,
  type CreditRating,
  type LegalForm,
  SECTOR_IDS,
  type SectorId,
  type SkillId,
} from '@business-game/config';
import { type AccountId, type LedgerState, createLedger, openAccount } from './ledger';
import { type Amount, ZERO } from './money';

export const STATE_SCHEMA_VERSION = 3;

export type PlayerId = string;
export type CompanyId = string;
export type LoanId = string;

/** Chi può accumulare arretrati verso il sistema (GDD §16, mancata esecuzione). */
export interface Debtor {
  account: AccountId;
  /** Somme dovute e non pagate. */
  arrears: Amount;
  /** Tick in cui sono comparsi gli arretrati; null se non ce ne sono. */
  arrearsSinceTick: number | null;
}

/** Lavoro presso un datore gestito dal computer, con la sua carriera (GDD §5.2). */
export interface NpcJob {
  hours: number;
  /** Indice del livello di carriera (0 = junior). */
  careerLevel: number;
  monthsInJob: number;
}

/** Attività da libero professionista con clienti gestiti dal computer (GDD §5.2). */
export interface FreelancePractice {
  hours: number;
  monthsActive: number;
  collaborators: number;
  /** Ore ancora da dedicare allo sviluppo del prodotto; null se non avviato. */
  productHoursLeft: number | null;
  /** Royalty mensili del prodotto, 0 finché non è pronto. */
  royaltyMonthly: number;
}

export type TraitId = 'successful_founder' | 'scaler' | 'lesson_learned' | 'loyal_clients';

export interface Player extends Debtor {
  id: PlayerId;
  /** Classe d'origine, scelta all'ingresso e permanente (GDD §4). */
  classId: ClassId;
  /** Classi attive: l'origine più quelle sbloccate (GDD §5.4). */
  activeClasses: ClassId[];
  /** Ruolo del dipendente o professione del libero professionista. */
  role: string | null;
  /** Esperienza accumulata per competenza. */
  skills: Record<SkillId, number>;
  wellbeing: number;
  reputation: number;
  /** Contratti conclusi con altri giocatori (prestiti, affitti). */
  network: number;
  /** Tratti con il loro grado (1–3). */
  traits: Partial<Record<TraitId, number>>;
  /** Studio pianificato per il mese. */
  study: { skill: SkillId | null; hours: number };
  /** Il mese successivo a un burnout le ore disponibili si dimezzano. */
  burnout: boolean;
  /** Conto delle quote del fondo indice gestito dal computer. */
  fundAccount: AccountId;
  joinedTick: number;
  /** Livello di vita da 1 a 5 (GDD §7.1). */
  lifestyleLevel: number;
  npcJob: NpcJob | null;
  freelance: FreelancePractice | null;
  /** Unità immobiliari possedute (GDD §6.2). */
  properties: { residential: number; commercial: number };
  creditRating: CreditRating;
  companyIds: CompanyId[];
  /** Redditi del mese in corso, per tasse e rating. */
  month: { earnedIncome: Amount; capitalIncome: Amount; debtService: Amount };
  lastMonthIncome: Amount;
  bankruptcies: number;
  lastBankruptcyTick: number | null;
  /** Mesi di sussidio rimasti dopo la perdita del reddito. */
  benefitMonthsLeft: number;
}

export interface CompanyBudget {
  /** Spese settimanali per area (GDD §9.2). */
  marketing: Amount;
  rnd: Amount;
  training: Amount;
  service: Amount;
}

export interface Company extends Debtor {
  id: CompanyId;
  ownerId: PlayerId;
  sector: SectorId;
  legalForm: LegalForm;
  status: 'active' | 'closed';
  foundedTick: number;
  /** Prezzo di un'unità. */
  price: Amount;
  budget: CompanyBudget;
  npcWorkers: number;
  /** Salario mensile per lavoratore. */
  wage: Amount;
  /** Qualità della posizione (1 = media). */
  location: number;
  brand: number;
  rndStock: number;
  reputation: number;
  quality: number;
  service: number;
  inputQuality: number;
  morale: number;
  /** Clienti in unità di domanda settimanale. */
  customers: number;
  satisfaction: number;
  /** Capacità produttiva settimanale. */
  capacity: number;
  /** Produzione del tick in corso e di quello precedente (gli input si pagano con un tick di ritardo). */
  output: number;
  lastOutput: number;
  equipment: Amount;
  /** Quote della società per giocatore (somma 1). La ditta individuale resta tutta del titolare. */
  shares: Record<PlayerId, number>;
  /** Quote messe in vendita dal titolare per raccogliere capitale (GDD §5.2, business angel). */
  equityOffer: { share: number; price: Amount } | null;
  creditRating: CreditRating;
  month: { revenue: Amount; costs: Amount; debtService: Amount };
  lastMonth: { revenue: Amount; costs: Amount };
  /** Utili degli ultimi 12 mesi, dal più vecchio al più recente. */
  profitHistory: Amount[];
  lossCarryForward: Amount;
}

export interface Loan {
  id: LoanId;
  borrower: { kind: 'player' | 'company'; id: string };
  /** Giocatore che ha prestato il denaro; assente se il prestito è della banca (GDD §12.2). */
  lenderId?: PlayerId;
  /** Mesi consecutivi con rate non pagate (prestiti tra giocatori). */
  monthsInDefault?: number;
  principal: Amount;
  annualRate: number;
  remainingMonths: number;
  repayment: 'amortizing' | 'bullet';
  purpose: string;
}

export interface SectorMarket {
  /** Domanda totale dell'ultimo tick (unità). */
  demand: number;
  playerSales: number;
  operatorSales: number;
  /** Prezzo medio pagato nell'ultimo tick. */
  averagePrice: number;
  /** Qualità media di ciò che è stato venduto (giocatori + operatore). */
  averageQuality: number;
  /** Vendite dell'operatore accumulate nel mese, per l'occupazione. */
  operatorSalesThisMonth: number;
  demandMultiplier: number;
  operatorPriceMultiplier: number;
}

export interface ActiveEvent {
  id: string;
  monthsLeft: number;
}

export interface Macro {
  policyRate: number;
  /** Indice dei prezzi al consumo, un valore per ogni mese chiuso. */
  cpiHistory: number[];
  inflation: number;
  unemployment: number;
  laborForce: number;
  employment: number;
  demandStabilizer: number;
  activeEvents: ActiveEvent[];
  /** Salari pagati dalle aziende dei giocatori a lavoratori gestiti dal computer. */
  npcPayrollThisMonth: Amount;
  lastNpcPayroll: Amount;
  /** Rendimento del fondo indice nell'ultimo mese. */
  lastIndexReturn: number;
  /**
   * Indice dei costi (salari e prezzi dell'operatore), 1 a inizio stagione. Cresce con
   * l'inflazione attesa e con la tensione sul mercato del lavoro (curva di Phillips).
   */
  costIndex: number;
}

/** Stato completo di una città: dati puri e serializzabili. */
export interface CityState {
  schemaVersion: number;
  cityId: string;
  /** Seed della città: insieme al numero del tick determina ogni evento casuale. */
  seed: string;
  /** Numero di tick già elaborati nella stagione. */
  tick: number;
  ledger: LedgerState;
  players: Record<PlayerId, Player>;
  companies: Record<CompanyId, Company>;
  loans: Record<LoanId, Loan>;
  markets: Record<SectorId, SectorMarket>;
  macro: Macro;
  counters: { company: number; loan: number; offer: number };
  /** Offerte di prestito pubblicate dagli investitori (GDD §12.2). */
  loanOffers: Record<string, LoanOffer>;
}

export interface LoanOffer {
  id: string;
  lenderId: PlayerId;
  /** Capitale ancora disponibile da prestare. */
  available: Amount;
  annualRate: number;
  months: number;
}

export function createCityState(params: {
  cityId: string;
  seed: string;
  config: BalanceConfig;
}): CityState {
  if (params.cityId.length === 0 || params.seed.length === 0) {
    throw new Error('cityId e seed sono obbligatori');
  }
  const { config } = params;
  const markup = 1 + config.global.npc.cityOperatorMarkup;

  const markets = {} as Record<SectorId, SectorMarket>;
  let operatorEmployment = 0;
  for (const sector of SECTOR_IDS) {
    const economics = config.sectors[sector].economics;
    markets[sector] = {
      demand: economics.npcDemandFloorWeekly,
      playerSales: 0,
      operatorSales: economics.npcDemandFloorWeekly,
      averagePrice: economics.basePrice * markup,
      averageQuality: config.economy.market.operatorQuality,
      operatorSalesThisMonth: 0,
      demandMultiplier: 1,
      operatorPriceMultiplier: 1,
    };
    operatorEmployment += economics.npcDemandFloorWeekly / unitsPerNpcWorkerWeek(config, sector);
  }

  const laborForce = operatorEmployment / (1 - config.economy.labour.startingUnemployment);
  const ledger = createLedger();
  for (const sector of SECTOR_IDS) {
    openAccount(ledger, `market:${sector}`);
  }
  openAccount(ledger, 'rent:residential');
  openAccount(ledger, 'rent:commercial');
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    cityId: params.cityId,
    seed: params.seed,
    tick: 0,
    ledger,
    players: {},
    companies: {},
    loans: {},
    markets,
    macro: {
      policyRate: config.economy.macro.neutralRate,
      cpiHistory: [],
      inflation: 0,
      unemployment: config.economy.labour.startingUnemployment,
      laborForce,
      employment: operatorEmployment,
      demandStabilizer: 1,
      activeEvents: [],
      npcPayrollThisMonth: ZERO,
      lastNpcPayroll: ZERO,
      lastIndexReturn: 0,
      costIndex: 1,
    },
    counters: { company: 0, loan: 0, offer: 0 },
    loanOffers: {},
  };
}

/**
 * Unità prodotte a settimana da un lavoratore gestito dal computer, ricavate dalla quota
 * del lavoro sul prezzo base: a salario di mercato il lavoro costa esattamente `laborShare`.
 */
export function unitsPerNpcWorkerWeek(config: BalanceConfig, sector: SectorId): number {
  const economics = config.sectors[sector].economics;
  return (
    economics.npcWageMonthly /
    config.global.time.ticksPerMonth /
    (economics.laborShare * economics.basePrice)
  );
}

/** Rimuove un prestito estinto. */
export function removeLoan(state: CityState, id: LoanId): void {
  Reflect.deleteProperty(state.loans, id);
}
