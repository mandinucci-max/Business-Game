import { loadBalanceConfig } from '@business-game/config';
import { describe, expect, it } from 'vitest';
import {
  amount,
  autopilotCommands,
  buildPlayerView,
  type CityState,
  type Command,
  createCityState,
  runTick,
} from '../src/index';

const config = loadBalanceConfig();
const ticksPerMonth = config.global.time.ticksPerMonth;

function cmd(id: string, playerId: string, type: string, payload: unknown): Command {
  return { id, playerId, type, payload };
}

const joins: Command[] = [
  cmd('j1', 'emp', 'player.join', { classId: 'employee', role: 'operations' }),
  cmd('j2', 'ent', 'player.join', { classId: 'entrepreneur', sector: 'food_service' }),
  cmd('j3', 'rival', 'player.join', { classId: 'entrepreneur', sector: 'retail' }),
  cmd('j4', 'inv', 'player.join', { classId: 'investor' }),
];

function advance(state: CityState, ticks: number, extra: (s: CityState) => Command[] = () => []) {
  let current = state;
  for (let i = 0; i < ticks; i++) {
    current = runTick(current, extra(current), config, { recordTransactions: false }).state;
  }
  return current;
}

function started(): CityState {
  const state = createCityState({ cityId: 'test', seed: 'viste', config });
  return runTick(state, joins, config).state;
}

describe('vista del giocatore', () => {
  it('restituisce null per un giocatore sconosciuto', () => {
    expect(buildPlayerView(started(), config, 'nessuno')).toBeNull();
  });

  it('mostra solo le aziende proprie e non i dati riservati degli altri', () => {
    const state = advance(started(), ticksPerMonth);
    const view = buildPlayerView(state, config, 'ent');
    expect(view).not.toBeNull();
    if (view === null) return;
    expect(view.companies.length).toBeGreaterThan(0);
    for (const company of view.companies) expect(state.companies[company.id]?.ownerId).toBe('ent');

    const rival = Object.values(state.companies).find((c) => c.ownerId === 'rival');
    expect(rival).toBeDefined();
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(`"${rival?.id ?? 'x'}"`);
    expect(serialized).not.toContain(rival?.account ?? 'x');
    // Nessun conto di altri giocatori nella vista.
    for (const other of Object.values(state.players)) {
      if (other.id !== 'ent') expect(serialized).not.toContain(other.account);
    }
  });

  it('la classifica espone solo l’identificativo e il VE', () => {
    const state = advance(started(), ticksPerMonth);
    const view = buildPlayerView(state, config, 'emp');
    expect(view?.ranking.total).toBe(4);
    expect(view?.ranking.me?.playerId).toBe('emp');
    for (const row of view?.ranking.top ?? []) {
      expect(Object.keys(row).sort()).toEqual(['classId', 'playerId', 'position', 'value']);
    }
  });

  it('dopo un mese c’è il rapporto mensile e al massimo 5 carte', () => {
    const state = advance(started(), ticksPerMonth);
    const view = buildPlayerView(state, config, 'ent');
    expect(view?.report).not.toBeNull();
    expect(view?.report?.items.length).toBeGreaterThan(0);
    expect(view?.report?.items.length).toBeLessThanOrEqual(8);
    expect(view?.cards.length).toBeLessThanOrEqual(5);
    expect(view?.market?.markets.food_service).toBeDefined();
  });
});

describe('pilota automatico', () => {
  it('non genera nulla se è spento', () => {
    const state = advance(started(), ticksPerMonth);
    expect(autopilotCommands(state, config, [])).toEqual([]);
  });

  it('si attiva con il comando e lascia la precedenza alle scelte del giocatore', () => {
    let state = runTick(
      started(),
      [
        cmd('a1', 'ent', 'player.setAutopilot', {
          pricing: true,
          replaceQuits: true,
          investSurplus: true,
        }),
      ],
      config,
    ).state;
    expect(state.players.ent?.autopilot.pricing).toBe(true);

    state = advance(state, ticksPerMonth * 2 - (state.tick % ticksPerMonth));
    const company = Object.values(state.companies).find((c) => c.ownerId === 'ent');
    if (company === undefined) throw new Error('azienda mancante');
    // Forza un prezzo molto alto: il pilota deve abbassarlo verso il tetto dell'operatore.
    company.price = amount(company.price * 3);
    const generated = autopilotCommands(state, config, []);
    expect(generated.some((c) => c.type === 'company.setPrice' && c.playerId === 'ent')).toBe(true);
    const own = cmd('mine', 'ent', 'company.setPrice', { companyId: company.id, price: 10 });
    const withOwn = autopilotCommands(state, config, [own]);
    expect(withOwn.some((c) => c.type === 'company.setPrice')).toBe(false);

    // I comandi generati passano la validazione del motore.
    const result = runTick(state, generated, config);
    expect(result.report.rejectedCommands).toEqual([]);
  });

  it('rifiuta configurazioni non valide', () => {
    const result = runTick(
      started(),
      [cmd('a1', 'ent', 'player.setAutopilot', { pricing: 'yes' })],
      config,
    );
    expect(result.report.rejectedCommands.length).toBe(1);
  });
});
