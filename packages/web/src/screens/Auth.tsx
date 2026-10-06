import { type FormEvent, useState } from 'react';
import { api, ApiError, type SessionUser } from '../api';
import { useI18n } from '../i18n';
import { LanguageSwitch } from './LanguageSwitch';

export function AuthScreen({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === 'login'
          ? await api.login(username, password)
          : await api.register(username, password);
      onSignedIn(user);
    } catch (e) {
      setError(t(`error.${e instanceof ApiError ? e.code : 'network'}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="center-screen">
      <div className="auth-box panel">
        <div className="brand">
          <img src="/icon.svg" alt="" width="48" height="48" />
          <h1>{t('app.title')}</h1>
        </div>
        <p className="muted">{t('app.tagline')}</p>
        <form onSubmit={(e) => void onSubmit(e)} className="stack">
          <label className="field">
            <span>{t('auth.username')}</span>
            <input
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_.\-]+"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            {mode === 'register' && <small className="muted">{t('auth.usernameHint')}</small>}
          </label>
          <label className="field">
            <span>{t('auth.password')}</span>
            <input
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={10}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'register' && <small className="muted">{t('auth.passwordHint')}</small>}
          </label>
          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy}>
            {mode === 'login' ? t('auth.login') : t('auth.register')}
          </button>
        </form>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
        </button>
        <LanguageSwitch />
      </div>
    </main>
  );
}
