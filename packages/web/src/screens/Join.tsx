import { useState } from 'react';
import { api, ApiError } from '../api';
import { describeError, useI18n } from '../i18n';
import { CLASS_IDS, EMPLOYEE_ROLES, FREELANCER_ROLES, SECTOR_IDS } from '../ids';

type ClassId = (typeof CLASS_IDS)[number];

export function JoinScreen({ onJoined }: { onJoined: () => void }) {
  const { t } = useI18n();
  const [classId, setClassId] = useState<ClassId>('employee');
  const [sector, setSector] = useState<string>('food_service');
  const [role, setRole] = useState<string>('operations');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roles =
    classId === 'employee' ? EMPLOYEE_ROLES : classId === 'freelancer' ? FREELANCER_ROLES : [];

  const choose = (next: ClassId) => {
    setClassId(next);
    if (next === 'employee') setRole('operations');
    if (next === 'freelancer') setRole('tax');
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.join({
        classId,
        ...(classId === 'entrepreneur' ? { sector } : {}),
        ...(roles.length > 0 ? { role } : {}),
      });
      onJoined();
    } catch (e) {
      setError(e instanceof ApiError ? describeError(t, e.code, e.detail) : t('error.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1>{t('join.title')}</h1>
      <p className="muted">{t('join.subtitle')}</p>
      <div className="class-grid" role="radiogroup">
        {CLASS_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={classId === id}
            className={`class-card ${classId === id ? 'selected' : ''}`}
            onClick={() => choose(id)}
          >
            <strong>{t(`class.${id}`)}</strong>
            <span>{t(`classDesc.${id}`)}</span>
          </button>
        ))}
      </div>
      <div className="panel stack">
        {classId === 'entrepreneur' && (
          <label className="field">
            <span>{t('join.sector')}</span>
            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              {SECTOR_IDS.map((s) => (
                <option key={s} value={s}>
                  {t(`sector.${s}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {roles.length > 0 && (
          <label className="field">
            <span>{t('join.role')}</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" disabled={busy} onClick={() => void join()}>
          {t('join.start')}
        </button>
      </div>
    </main>
  );
}
