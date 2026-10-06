import { type Locale, useI18n } from '../i18n';

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="lang">
      <span className="sr-only">{t('lang.label')}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        <option value="it">Italiano</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
