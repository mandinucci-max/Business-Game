import { type FormEvent, type ReactNode, useState } from 'react';
import { useGame } from './game';
import { useI18n } from './i18n';

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="panel">
      {title !== undefined && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | undefined;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

export function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const ratio = Math.max(0, Math.min(1, value / max));
  return (
    <div
      className="meter"
      role="meter"
      aria-valuenow={value}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className="meter-head">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export type FieldSpec =
  | { name: string; label: string; kind: 'number'; initial: number; step?: number; min?: number }
  | {
      name: string;
      label: string;
      kind: 'select';
      initial: string;
      options: readonly { value: string; label: string }[];
    }
  | { name: string; label: string; kind: 'checkbox'; initial: boolean };

type Values = Record<string, number | string | boolean>;

/**
 * Piccolo modulo che costruisce il payload di un comando. Il server rivalida tutto: qui serve solo
 * a evitare errori di battitura.
 */
export function CommandForm({
  fields,
  submitLabel,
  build,
  type,
  secondary,
}: {
  fields: readonly FieldSpec[];
  submitLabel: string;
  type: string;
  build: (values: Values) => unknown;
  secondary?: boolean;
}) {
  const { send, busy } = useGame();
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.initial])),
  );
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(type, build(values));
  };
  return (
    <form className="command-form" onSubmit={onSubmit}>
      {fields.map((field) => (
        <label key={field.name} className={field.kind === 'checkbox' ? 'check' : 'field'}>
          {field.kind === 'checkbox' ? (
            <>
              <input
                type="checkbox"
                checked={values[field.name] === true}
                onChange={(e) => setValues({ ...values, [field.name]: e.target.checked })}
              />
              <span>{field.label}</span>
            </>
          ) : (
            <>
              <span>{field.label}</span>
              {field.kind === 'number' ? (
                <input
                  type="number"
                  inputMode="decimal"
                  step={field.step ?? 'any'}
                  min={field.min ?? 0}
                  value={String(values[field.name])}
                  onChange={(e) => setValues({ ...values, [field.name]: Number(e.target.value) })}
                />
              ) : (
                <select
                  value={String(values[field.name])}
                  onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                >
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </label>
      ))}
      <button type="submit" disabled={busy} className={secondary === true ? 'secondary' : ''}>
        {submitLabel}
      </button>
    </form>
  );
}

/** Pulsante per un comando senza parametri da compilare. */
export function CommandButton({
  type,
  payload,
  label,
  secondary,
}: {
  type: string;
  payload: unknown;
  label: string;
  secondary?: boolean;
}) {
  const { send, busy } = useGame();
  return (
    <button
      type="button"
      disabled={busy}
      className={secondary === true ? 'secondary' : ''}
      onClick={() => void send(type, payload)}
    >
      {label}
    </button>
  );
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="details">
      <summary>{summary}</summary>
      <div className="details-body">{children}</div>
    </details>
  );
}

export function useOptions() {
  const { t } = useI18n();
  return (prefix: string, ids: readonly string[]) =>
    ids.map((id) => ({ value: id, label: t(`${prefix}.${id}`) }));
}
