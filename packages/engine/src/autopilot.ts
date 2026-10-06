import type { BalanceConfig } from '@business-game/config';
import type { Command } from './command-core';
import { balanceOf } from './ledger';
import { toCredits } from './money';
import type { CityState } from './state';
import { marketWage, operatorPrice } from './economy/sector';

/**
 * Pilota automatico (GDD §19.3): genera i comandi di routine per i giocatori che l'hanno attivato.
 * Non è mai brillante quanto un giocatore attivo, ma evita che l'assenza faccia crollare tutto.
 * Le decisioni prese dal giocatore nello stesso tick hanno sempre la precedenza.
 */
export function autopilotCommands(
  state: CityState,
  config: BalanceConfig,
  playerCommands: readonly Command[],
): Command[] {
  const commands: Command[] = [];
  const decided = new Set(
    playerCommands.map(
      (c) =>
        `${c.playerId}:${c.type}:${String((c.payload as { companyId?: unknown } | null)?.companyId ?? '')}`,
    ),
  );
  const monthStart = state.tick % config.global.time.ticksPerMonth === 0;

  for (const player of Object.values(state.players)) {
    const rules = player.autopilot;
    const add = (type: string, payload: { companyId?: string } & Record<string, unknown>) => {
      if (decided.has(`${player.id}:${type}:${payload.companyId ?? ''}`)) return;
      commands.push({
        id: `autopilot:${player.id}:${state.tick}:${commands.length}`,
        playerId: player.id,
        type,
        payload,
      });
    };

    for (const company of Object.values(state.companies)) {
      if (company.ownerId !== player.id || company.status !== 'active') continue;
      if (rules.pricing) {
        // Prezzo appena sotto l'operatore se la domanda supera la capacità, più basso se è scarsa.
        const ceiling = operatorPrice(state, config, company.sector) * 0.98;
        const ratio = company.capacity > 0 ? company.customers / company.capacity : 2;
        const current = toCredits(company.price);
        const target =
          ratio > 1.1
            ? Math.min(ceiling, current * 1.02)
            : ratio < 0.8
              ? current * 0.98
              : Math.min(current, ceiling);
        if (Math.abs(target - current) / current > 0.005) {
          add('company.setPrice', { companyId: company.id, price: Math.round(target * 100) / 100 });
        }
      }
      if (rules.replaceQuits && company.npcWorkers < company.targetWorkers) {
        add('company.setWorkforce', {
          companyId: company.id,
          workers: company.targetWorkers,
          wage: Math.max(
            toCredits(company.wage),
            Math.round(marketWage(state, config, company.sector) * 100) / 100,
          ),
        });
      }
    }

    if (rules.investSurplus && monthStart) {
      const living =
        (config.economy.lifestyle.monthlyCostByLevel[player.lifestyleLevel - 1] ?? 0) *
        state.macro.costIndex;
      const surplus = toCredits(balanceOf(state.ledger, player.account)) - living * 3;
      if (surplus > 100) add('fund.invest', { amount: Math.round(surplus * 100) / 100 });
    }
  }
  return commands;
}
