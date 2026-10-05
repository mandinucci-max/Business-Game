import { type BalanceConfig, type ClassId, SKILL_IDS, type SkillId } from '@business-game/config';
import { SINK_ACCOUNT, balanceOf } from '../ledger';
import { credits } from '../money';
import type { CityState, Company, Player, TraitId } from '../state';
import type { TickContext } from '../tick';
import { settle } from './settle';
import { activeCompanies } from './sector';
import { companyValue, netWorth } from './valuation';

/** Esperienza necessaria per raggiungere un livello: fattore × livello² (GDD §5.1). */
export function xpForLevel(config: BalanceConfig, level: number): number {
  return config.progression.skills.xpPerLevelFactor * level * level;
}

export function skillLevel(config: BalanceConfig, player: Player, skill: SkillId): number {
  const xp = player.skills[skill];
  const level = Math.floor(Math.sqrt(xp / config.progression.skills.xpPerLevelFactor));
  return Math.min(config.progression.skills.maxLevel, level);
}

/** Esperienza minima per partire a un certo livello. */
export function emptySkills(): Record<SkillId, number> {
  return Object.fromEntries(SKILL_IDS.map((s) => [s, 0])) as Record<SkillId, number>;
}

/** Competenze tipiche di una classe: ricevono il talento d'origine (GDD §4.1). */
export function classSkills(config: BalanceConfig, player: Player, classId: ClassId): SkillId[] {
  const roleSkill = roleSkillOf(config, player);
  switch (classId) {
    case 'employee':
      return roleSkill === null ? ['management'] : [roleSkill, 'management'];
    case 'freelancer':
      return roleSkill === null ? [] : [roleSkill];
    case 'entrepreneur':
      return ['management', 'commercial'];
    case 'investor':
      return ['finance'];
  }
}

export function roleSkillOf(config: BalanceConfig, player: Player): SkillId | null {
  if (player.role === null) return null;
  const roles = config.progression.roles;
  const table = player.classId === 'freelancer' ? roles.freelancer : roles.employee;
  return table[player.role] ?? roles.employee[player.role] ?? roles.freelancer[player.role] ?? null;
}

export function addXp(config: BalanceConfig, player: Player, skill: SkillId, xp: number): void {
  if (xp <= 0) return;
  let multiplier = 1;
  if (classSkills(config, player, player.classId).includes(skill)) {
    multiplier += config.classes.originTalentXpBonus;
  }
  multiplier += traitEffect(config, player, 'lesson_learned');
  multiplier *= productivity(config, player);
  player.skills[skill] += xp * multiplier;
}

/** Effetto di un tratto in base al grado (0 se il giocatore non lo possiede). */
export function traitEffect(config: BalanceConfig, player: Player, trait: TraitId): number {
  const grade = player.traits[trait] ?? 0;
  return grade > 0 ? (config.progression.traits.gradeEffects[grade - 1] ?? 0) : 0;
}

/** Produttività personale: cala con poco benessere e crolla con il burnout (GDD §3.1). */
export function productivity(config: BalanceConfig, player: Player): number {
  const w = config.progression.wellbeing;
  if (player.burnout || player.wellbeing < w.burnoutThreshold)
    return 1 - w.burnoutProductivityPenalty;
  if (player.wellbeing < w.lowThreshold) return 1 - w.lowProductivityPenalty;
  return 1;
}

/** Ore già impegnate nel mese: lavoro, gestione delle aziende, clienti, studio (GDD §3). */
export function committedHours(state: CityState, config: BalanceConfig, player: Player): number {
  const hours = config.progression.hours;
  const companies = player.companyIds.filter((id) => state.companies[id]?.status === 'active');
  return (
    (player.npcJob?.hours ?? 0) +
    companies.length * hours.managementPerCompany +
    (player.freelance?.hours ?? 0) +
    player.study.hours
  );
}

/** Ore massime disponibili nel mese; dopo un burnout si dimezzano. */
export function hourLimit(config: BalanceConfig, player: Player): number {
  const max = config.global.time.maxHoursPerMonth;
  return player.burnout ? max / 2 : max;
}

export function hasClass(player: Player, classId: ClassId): boolean {
  return player.activeClasses.includes(classId);
}

export function careerLevelId(config: BalanceConfig, player: Player): string | null {
  if (player.npcJob === null) return null;
  return config.progression.careers.employee[player.npcJob.careerLevel]?.id ?? null;
}

/** Stipendio mensile del lavoro gestito dal computer: base × carriera × tempo pieno/parziale. */
export function npcJobWage(state: CityState, config: BalanceConfig, player: Player): number {
  const job = player.npcJob;
  if (job === null) return 0;
  const base = config.classes.classes.employee.monthlyIncome.min;
  const career = config.progression.careers.employee[job.careerLevel]?.wageMultiplier ?? 1;
  const time = job.hours / config.progression.hours.npcJobFullTime;
  return base * career * time * state.macro.costIndex;
}

/** Tariffa oraria del libero professionista: cresce con la competenza, la reputazione e i tratti. */
export function freelanceRate(state: CityState, config: BalanceConfig, player: Player): number {
  const career = config.progression.careers.freelancer;
  const skill = roleSkillOf(config, player);
  const level = skill === null ? 0 : skillLevel(config, player, skill);
  const established =
    (player.freelance?.monthsActive ?? 0) >= career.establishedClientMonths &&
    player.reputation >= career.establishedReputation;
  return (
    career.baseHourlyRate *
    (1 + career.rateGrowthPerLevel * Math.max(0, level - 4)) *
    (established ? 1 + career.establishedRateBonus : 1) *
    (0.8 + 0.4 * (player.reputation / 100)) *
    (1 + traitEffect(config, player, 'loyal_clients')) *
    state.macro.costIndex
  );
}

/** Livello dell'investitore (GDD §5.2): il più alto di cui soddisfa i requisiti. */
export function investorLevel(state: CityState, config: BalanceConfig, player: Player): number {
  const levels = config.progression.careers.investor;
  const worth = netWorth(state, config, player.id) / 100;
  let level = 0;
  levels.forEach((l, i) => {
    if (skillLevel(config, player, 'finance') >= l.finance && worth >= l.netWorth) level = i;
  });
  return level;
}

/**
 * Chiusura mensile della progressione: studio, esperienza dalla pratica, benessere, reputazione,
 * carriere, prodotti dei professionisti e tratti.
 */
export function monthlyProgression(ctx: TickContext): void {
  const { state, config } = ctx;
  const p = config.progression;
  for (const player of Object.values(state.players)) {
    const wasBurnout = player.burnout;

    // Studio: costa ore (già impegnate) e denaro, dà esperienza.
    if (player.study.skill !== null && player.study.hours > 0) {
      const cost = credits(player.study.hours * p.skills.studyCostPerHour * state.macro.costIndex);
      const unpaid = settle(ctx, player, [{ to: SINK_ACCOUNT, amount: cost }], 'study');
      if (unpaid === 0) {
        addXp(config, player, player.study.skill, player.study.hours * p.skills.studyXpPerHour);
      }
    }

    // Esperienza dalla pratica.
    const roleSkill = roleSkillOf(config, player);
    if (player.npcJob !== null) {
      const share = player.npcJob.hours / p.hours.npcJobFullTime;
      if (roleSkill !== null)
        addXp(config, player, roleSkill, p.skills.practice.npcJobMonthly * share);
      addXp(config, player, 'management', p.skills.practice.npcJobMonthly * 0.3 * share);
      player.npcJob.monthsInJob += 1;
      promote(ctx, player);
    }
    if (player.freelance !== null) {
      if (roleSkill !== null) {
        addXp(
          config,
          player,
          roleSkill,
          player.freelance.hours * p.skills.practice.freelancePerHour,
        );
      }
      if (player.freelance.hours > 0) player.freelance.monthsActive += 1;
      advanceProduct(config, player);
    }
    const companies = player.companyIds
      .map((id) => state.companies[id])
      .filter((c): c is Company => c?.status === 'active');
    const managing = p.skills.practice.managementPerCompanyMonthly * companies.length;
    addXp(config, player, 'management', managing);
    addXp(config, player, 'commercial', managing * 0.5);
    if (
      balanceOf(state.ledger, player.fundAccount) > 0 ||
      player.properties.residential + player.properties.commercial > 0 ||
      Object.values(state.loans).some((l) => l.lenderId === player.id)
    ) {
      addXp(config, player, 'finance', p.skills.practice.investingMonthly);
    }

    // Benessere: straordinari, riposo e qualità del paniere.
    const hours = committedHours(state, config, player);
    const overtime = Math.max(0, hours - config.global.time.hoursPerMonth);
    const free = Math.max(0, config.global.time.hoursPerMonth - hours);
    player.wellbeing +=
      -overtime * p.hours.overtimeWellbeingCostPerHour +
      Math.min(p.wellbeing.maxMonthlyRest, free * p.wellbeing.restPerFreeHour) +
      (p.wellbeing.basketBonusByLevel[player.lifestyleLevel - 1] ?? 0);
    player.wellbeing = Math.max(0, Math.min(100, player.wellbeing));
    player.burnout = !wasBurnout && player.wellbeing < p.wellbeing.burnoutThreshold;
    if (player.burnout) {
      player.study = { skill: null, hours: 0 };
      if (player.freelance !== null)
        player.freelance.hours = Math.floor(player.freelance.hours / 2);
      ctx.emit({ type: 'burnout', playerId: player.id });
    }

    // Reputazione: tende a 50 e si muove con i risultati.
    const r = p.reputation;
    player.reputation += (50 - player.reputation) * r.monthlyDriftTo50;
    if (player.arrears > 0) player.reputation += r.arrearsMonth;
    for (const company of companies) {
      if ((company.profitHistory.at(-1) ?? 0) > 0) player.reputation += r.profitableCompanyMonth;
    }
    player.reputation = Math.max(0, Math.min(100, player.reputation));

    updateTraits(state, config, player);
  }
}

function promote(ctx: TickContext, player: Player): void {
  const { config } = ctx;
  const job = player.npcJob;
  if (job === null) return;
  const next = config.progression.careers.employee[job.careerLevel + 1];
  const roleSkill = roleSkillOf(config, player);
  if (
    next !== undefined &&
    (roleSkill === null ? 0 : skillLevel(config, player, roleSkill)) >= next.roleSkill &&
    skillLevel(config, player, 'management') >= next.management &&
    player.reputation >= next.reputation &&
    job.monthsInJob >= next.months
  ) {
    job.careerLevel += 1;
    job.monthsInJob = 0;
    player.reputation = Math.min(100, player.reputation + config.progression.reputation.promotion);
    ctx.emit({ type: 'promotion', playerId: player.id, level: next.id });
  }
}

function advanceProduct(config: BalanceConfig, player: Player): void {
  const practice = player.freelance;
  const career = config.progression.careers.freelancer;
  if (practice === null) return;
  if (practice.productHoursLeft !== null) {
    // Lo sviluppo del prodotto usa un quarto delle ore fatturabili del mese.
    practice.productHoursLeft = Math.max(0, practice.productHoursLeft - practice.hours / 4);
    if (practice.productHoursLeft === 0) {
      practice.productHoursLeft = null;
      practice.royaltyMonthly = career.royaltyStartMonthly;
    }
  } else if (practice.royaltyMonthly > 0) {
    practice.royaltyMonthly = Math.min(
      career.royaltyCapMonthly,
      practice.royaltyMonthly * (1 + career.royaltyMonthlyGrowth),
    );
  }
}

/** Tratti misurati dal sistema (GDD §5.3): il grado sale con i risultati, al massimo 5 attivi. */
function updateTraits(state: CityState, config: BalanceConfig, player: Player): void {
  const owned = Object.values(state.companies).filter((c) => c.ownerId === player.id);
  const grade = (value: number, thresholds: readonly number[]) =>
    thresholds.filter((t) => value >= t).length;

  const bestValue = Math.max(
    0,
    ...owned.filter((c) => c.status === 'active').map((c) => companyValue(state, config, c) / 100),
  );
  const candidates: Partial<Record<TraitId, number>> = {
    successful_founder: grade(bestValue, [150_000, 400_000, 1_000_000]),
    scaler: grade(
      owned.filter((c) => c.legalForm !== 'sole_proprietorship').length +
        owned.filter((c) => c.legalForm === 'spa' || c.legalForm === 'spa_with_license').length,
      [1, 2, 3],
    ),
    lesson_learned: Math.min(1, player.bankruptcies),
    loyal_clients: grade(player.freelance?.monthsActive ?? 0, [24, 36, 48]),
  };
  for (const [trait, value] of Object.entries(candidates) as [TraitId, number][]) {
    const current = player.traits[trait] ?? 0;
    const active = Object.keys(player.traits).length;
    if (value > current && (current > 0 || active < config.progression.traits.maxActive)) {
      player.traits[trait] = value;
    }
  }
}

/** Requisiti di sblocco di una classe (GDD §5.4); restituisce il motivo del rifiuto o null. */
export function unlockBlocker(
  state: CityState,
  config: BalanceConfig,
  player: Player,
  classId: ClassId,
): string | null {
  const u = config.progression.unlock;
  const cash = balanceOf(state.ledger, player.account) / 100;
  if (hasClass(player, classId)) return 'Classe già attiva';
  switch (classId) {
    case 'employee':
      return null;
    case 'entrepreneur':
      if (skillLevel(config, player, 'management') < u.entrepreneur.management) {
        return `Serve Gestione livello ${u.entrepreneur.management}`;
      }
      return cash >= u.entrepreneur.cash ? null : `Servono ${u.entrepreneur.cash} Cr di capitale`;
    case 'freelancer': {
      const best = Math.max(...SKILL_IDS.map((s) => skillLevel(config, player, s)));
      if (best < u.freelancer.skill) return `Serve una competenza al livello ${u.freelancer.skill}`;
      if (player.reputation < u.freelancer.reputation) {
        return `Serve reputazione ${u.freelancer.reputation}`;
      }
      return cash >= u.freelancer.examCost ? null : "Fondi insufficienti per l'esame";
    }
    case 'investor': {
      const investable = cash + balanceOf(state.ledger, player.fundAccount) / 100;
      if (skillLevel(config, player, 'finance') < u.investor.finance) {
        return `Serve Finanza livello ${u.investor.finance}`;
      }
      return investable >= u.investor.investable
        ? null
        : `Servono ${u.investor.investable} Cr investibili`;
    }
  }
}

/** Bonus delle competenze del titolare sull'azienda (GDD §9.2). */
export function ownerBonuses(
  state: CityState,
  config: BalanceConfig,
  company: Company,
): { capacity: number; brand: number; overhead: number } {
  const owner = state.players[company.ownerId];
  const e = config.progression.careers.entrepreneur;
  if (owner === undefined) return { capacity: 1, brand: 1, overhead: 1 };
  return {
    capacity:
      (1 +
        e.capacityBonusPerManagementLevel *
          Math.max(0, skillLevel(config, owner, 'management') - 3)) *
      productivity(config, owner),
    brand: 1 + e.brandBonusPerCommercialLevel * skillLevel(config, owner, 'commercial'),
    overhead: 1 - traitEffect(config, owner, 'scaler'),
  };
}

export function activeOwnedCompanies(state: CityState, player: Player): Company[] {
  return activeCompanies(state).filter((c) => c.ownerId === player.id);
}
