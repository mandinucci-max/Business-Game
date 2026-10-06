import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError, type GameView } from './api';
import { describeError, useI18n } from './i18n';

interface Game {
  readonly view: GameView;
  readonly refresh: () => Promise<void>;
  /** Invia un'intenzione al server; restituisce true se è stata accodata. */
  readonly send: (type: string, payload: unknown) => Promise<boolean>;
  readonly busy: boolean;
}

const GameContext = createContext<Game | null>(null);

const REFRESH_MS = 30_000;

export function GameProvider({
  initial,
  children,
  onToast,
}: {
  initial: GameView;
  children: ReactNode;
  onToast: (message: string, tone: 'good' | 'bad') => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setView(await api.view());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) window.location.reload();
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const send = useCallback(
    async (type: string, payload: unknown) => {
      setBusy(true);
      try {
        await api.command(type, payload);
        onToast(t('home.queued'), 'good');
        await refresh();
        return true;
      } catch (error) {
        onToast(
          error instanceof ApiError
            ? describeError(t, error.code, error.detail)
            : t('error.network'),
          'bad',
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onToast, refresh, t],
  );

  const value = useMemo(() => ({ view, refresh, send, busy }), [view, refresh, send, busy]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): Game {
  const context = useContext(GameContext);
  if (context === null) throw new Error('GameProvider mancante');
  return context;
}
