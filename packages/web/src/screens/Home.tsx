import { useGame } from '../game';
import { useI18n } from '../i18n';
import { CommandButton, Section, Stat } from '../ui';

export function HomeScreen() {
  const { view } = useGame();
  const { t, n, locale } = useI18n();
  const { player, report } = view;
  const nextTick =
    view.nextTickAt === null
      ? null
      : new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-US', {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(view.nextTickAt));

  return (
    <div className="stack">
      <Section>
        <p className="date">{t('home.date', view.date)}</p>
        {view.seasonOver ? (
          <p className="banner">{t('home.seasonOver')}</p>
        ) : (
          nextTick !== null && <p className="muted">{t('home.nextTick', { time: nextTick })}</p>
        )}
        <div className="stats">
          <Stat label={t('home.cash')} value={`${n(player.cash, 0)} Cr`} />
          <Stat label={t('home.netWorth')} value={`${n(player.netWorth, 0)} Cr`} />
          <Stat label={t('home.economicValue')} value={`${n(player.economicValue, 0)} Cr`} />
          <Stat
            label={t('home.rank')}
            value={
              view.ranking.me === null
                ? '—'
                : `${String(view.ranking.me.position)} / ${String(view.ranking.total)}`
            }
          />
          <Stat
            label={t('home.cashflow')}
            value={report === null ? '—' : `${n(report.monthlyCashflow, 0)} Cr`}
            tone={report === null ? undefined : report.monthlyCashflow >= 0 ? 'good' : 'bad'}
          />
          <Stat label={t('home.passive')} value={`${n(player.passiveMonthly, 0)} Cr`} />
        </div>
      </Section>

      <Section title={t('home.cards')}>
        {view.cards.length === 0 ? (
          <p className="muted">{t('home.noCards')}</p>
        ) : (
          <ul className="cards">
            {view.cards.map((card) => (
              <li key={card.id} className={`decision ${card.severity}`}>
                <p>{t(card.key, card.params)}</p>
                {card.suggestion !== undefined && (
                  <CommandButton
                    type={card.suggestion.type}
                    payload={card.suggestion.payload}
                    label={t('home.apply')}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('home.report')}>
        {report === null ? (
          <p className="muted">{t('home.noReport')}</p>
        ) : (
          <>
            <p className="muted">
              {t('home.netWorth')}: {report.netWorthChange >= 0 ? '+' : ''}
              {n(report.netWorthChange, 0)} Cr · {t('home.rank')}:{' '}
              {t('home.rankChange', {
                change: `${report.rankChange >= 0 ? '+' : ''}${String(report.rankChange)}`,
              })}
            </p>
            <ul className="report">
              {report.items.map((item, index) => (
                <li key={`${item.key}-${String(index)}`} className={`report-item ${item.tone}`}>
                  <p>{t(item.key, item.params)}</p>
                  {item.why.length > 0 && (
                    <details>
                      <summary>{t('home.why')}</summary>
                      <ul>
                        {item.why.map((why) => (
                          <li key={why.key}>{t(why.key, why.params)}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {view.commands.length > 0 && (
        <Section title={t('home.commands')}>
          <ul className="commands">
            {view.commands.slice(0, 8).map((command) => (
              <li key={command.id}>
                <code>{command.type}</code>{' '}
                <span className={`badge ${command.status}`}>{t(`status.${command.status}`)}</span>
                {command.message !== null && <small className="muted"> {command.message}</small>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
