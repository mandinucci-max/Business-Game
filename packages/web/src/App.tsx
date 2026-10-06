import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type GameView, type SessionUser } from './api';
import { GameProvider, useGame } from './game';
import { useI18n } from './i18n';
import { AgendaScreen } from './screens/Agenda';
import { AuthScreen } from './screens/Auth';
import { CompanyScreen } from './screens/Company';
import { HomeScreen } from './screens/Home';
import { JoinScreen } from './screens/Join';
import { LanguageSwitch } from './screens/LanguageSwitch';
import { MarketScreen } from './screens/Market';
import { RankingScreen } from './screens/Ranking';

type Tab = 'home' | 'agenda' | 'company' | 'market' | 'ranking';
const TABS: readonly Tab[] = ['home', 'agenda', 'company', 'market', 'ranking'];
const ICONS: Record<Tab, string> = {
  home: '◎',
  agenda: '◷',
  company: '▦',
  market: '⇅',
  ranking: '★',
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'signedOut' }
  | { kind: 'joining'; user: SessionUser }
  | { kind: 'playing'; user: SessionUser; view: GameView };

export function App() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [tab, setTab] = useState<Tab>('home');
  const [toast, setToast] = useState<{ message: string; tone: 'good' | 'bad' } | null>(null);

  const enter = useCallback(async (user: SessionUser | null) => {
    if (user === null) {
      setPhase({ kind: 'signedOut' });
      return;
    }
    if (!user.joined) {
      setPhase({ kind: 'joining', user });
      return;
    }
    try {
      setPhase({ kind: 'playing', user, view: await api.view() });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'not_joined') {
        setPhase({ kind: 'joining', user });
      } else {
        setPhase({ kind: 'error' });
      }
    }
  }, []);

  useEffect(() => {
    api
      .me()
      .then(enter)
      .catch(() => setPhase({ kind: 'error' }));
  }, [enter]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const onToast = useCallback(
    (message: string, tone: 'good' | 'bad') => setToast({ message, tone }),
    [],
  );

  const logout = async () => {
    await api.logout().catch(() => undefined);
    setPhase({ kind: 'signedOut' });
  };

  switch (phase.kind) {
    case 'loading':
      return <main className="center-screen" aria-busy="true" />;
    case 'error':
      return (
        <main className="center-screen">
          <p className="error">{t('error.network')}</p>
        </main>
      );
    case 'signedOut':
      return <AuthScreen onSignedIn={(user) => void enter(user)} />;
    case 'joining':
      return <JoinScreen onJoined={() => void enter({ ...phase.user, joined: true })} />;
    case 'playing':
      return (
        <GameProvider initial={phase.view} onToast={onToast}>
          <div className="shell">
            <header className="topbar">
              <div className="brand small">
                <img src="/icon.svg" alt="" width="28" height="28" />
                <strong>{phase.user.username}</strong>
              </div>
              <div className="topbar-actions">
                <LanguageSwitch />
                <button type="button" className="link" onClick={() => void logout()}>
                  {t('auth.logout')}
                </button>
              </div>
            </header>
            <Tabs tab={tab} onChange={setTab} />
            <main className="page">
              {tab === 'home' && <HomeScreen />}
              {tab === 'agenda' && <AgendaScreen />}
              {tab === 'company' && <CompanyScreen />}
              {tab === 'market' && <MarketScreen />}
              {tab === 'ranking' && <RankingScreen />}
            </main>
            {toast !== null && (
              <div className={`toast ${toast.tone}`} role="status">
                {toast.message}
              </div>
            )}
          </div>
        </GameProvider>
      );
  }
}

/** Schede di navigazione: cambiare scheda aggiorna anche la vista dal server. */
function Tabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useI18n();
  const { refresh } = useGame();
  return (
    <nav className="tabs" aria-label="main">
      {TABS.map((id) => (
        <button
          key={id}
          type="button"
          className={tab === id ? 'active' : ''}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => {
            onChange(id);
            void refresh();
          }}
        >
          <span aria-hidden="true">{ICONS[id]}</span>
          <span>{t(`nav.${id}`)}</span>
        </button>
      ))}
    </nav>
  );
}
