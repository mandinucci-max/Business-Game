import { useGame } from '../game';
import { useI18n } from '../i18n';
import { Section } from '../ui';

export function RankingScreen() {
  const { view } = useGame();
  const { t, n } = useI18n();
  const { top, me, total } = view.ranking;
  const rows = me !== null && !top.some((r) => r.playerId === me.playerId) ? [...top, me] : top;

  return (
    <Section title={t('ranking.title')}>
      <p className="muted">{t('ranking.total', { total })}</p>
      {rows.length === 0 ? (
        <p className="muted">{t('ranking.empty')}</p>
      ) : (
        <ol className="ranking">
          {rows.map((row) => {
            const mine = row.playerId === view.player.id;
            return (
              <li key={row.playerId} className={mine ? 'mine' : ''}>
                <span className="position">{row.position}</span>
                <span className="name">
                  {mine
                    ? `${view.names[row.playerId] ?? ''} (${t('ranking.you')})`
                    : (view.names[row.playerId] ?? '—')}
                  <small className="muted"> {t(`class.${row.classId}`)}</small>
                </span>
                <span className="value">{n(row.value, 0)} Cr</span>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
