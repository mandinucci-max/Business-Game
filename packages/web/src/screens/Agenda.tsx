import { useGame } from '../game';
import { useI18n } from '../i18n';
import { CLASS_IDS, FREELANCER_ROLES, SKILL_IDS } from '../ids';
import { CommandButton, CommandForm, Details, Meter, Section, useOptions } from '../ui';

export function AgendaScreen() {
  const { view } = useGame();
  const { t, n } = useI18n();
  const options = useOptions();
  const { player } = view;

  return (
    <div className="stack">
      <Section title={t('agenda.hours')}>
        <p>{t('agenda.hoursUsed', player.hours)}</p>
        <Meter label={t('agenda.hours')} value={player.hours.committed} max={player.hours.limit} />
        <Meter label={t('agenda.wellbeing')} value={player.wellbeing} />
        <Meter label={t('agenda.reputation')} value={player.reputation} />
        <Meter label={t('agenda.network')} value={player.network} />
        {player.burnout && <p className="error">{t('agenda.burnout')}</p>}
      </Section>

      <Section title={t('agenda.job')}>
        {player.job === null ? (
          <>
            <p className="muted">{t('agenda.noJob')}</p>
            <CommandForm
              type="job.acceptNpc"
              submitLabel={t('agenda.acceptJob')}
              fields={[
                { name: 'partTime', label: t('agenda.partTime'), kind: 'checkbox', initial: false },
              ]}
              build={(v) => ({ partTime: v.partTime === true })}
            />
          </>
        ) : (
          <>
            <p>
              {t('agenda.jobInfo', {
                level: player.job.level ?? '',
                hours: player.job.hours,
                wage: Math.round(player.job.monthlyWage),
                months: player.job.monthsInJob,
              })}
            </p>
            <CommandButton type="job.quitNpc" payload={{}} label={t('agenda.quitJob')} secondary />
          </>
        )}
      </Section>

      {player.freelance !== null && (
        <Section title={t('agenda.freelance')}>
          <p>
            {t('agenda.freelanceInfo', {
              rate: player.freelance.hourlyRate,
              hours: player.freelance.hours,
              collaborators: player.freelance.collaborators,
            })}
          </p>
          {player.freelance.productHoursLeft !== null && (
            <p className="muted">
              {t('agenda.productLeft', { hours: player.freelance.productHoursLeft })}
            </p>
          )}
          {player.freelance.royaltyMonthly > 0 && (
            <p className="muted">
              {t('agenda.royalty', { amount: Math.round(player.freelance.royaltyMonthly) })}
            </p>
          )}
          <CommandForm
            type="freelance.setHours"
            submitLabel={t('agenda.save')}
            fields={[
              {
                name: 'hours',
                label: t('agenda.freelanceHours'),
                kind: 'number',
                initial: player.freelance.hours,
                step: 10,
              },
            ]}
            build={(v) => ({ hours: Math.round(Number(v.hours)) })}
          />
          <CommandForm
            type="freelance.setCollaborators"
            submitLabel={t('agenda.save')}
            fields={[
              {
                name: 'count',
                label: t('agenda.collaborators'),
                kind: 'number',
                initial: player.freelance.collaborators,
                step: 1,
              },
            ]}
            build={(v) => ({ count: Math.round(Number(v.count)) })}
          />
          {player.freelance.productHoursLeft === null && (
            <CommandButton
              type="freelance.startProduct"
              payload={{}}
              label={t('agenda.startProduct')}
              secondary
            />
          )}
        </Section>
      )}

      <Section title={t('agenda.study')}>
        <CommandForm
          type="skill.setStudy"
          submitLabel={t('agenda.save')}
          fields={[
            {
              name: 'skill',
              label: t('agenda.studySkill'),
              kind: 'select',
              initial: player.study.skill ?? 'management',
              options: options('skill', SKILL_IDS),
            },
            {
              name: 'hours',
              label: t('agenda.studyHours'),
              kind: 'number',
              initial: player.study.hours,
              step: 10,
            },
          ]}
          build={(v) => ({ skill: v.skill, hours: Math.round(Number(v.hours)) })}
        />
      </Section>

      <Section title={t('agenda.skills')}>
        <ul className="skills">
          {SKILL_IDS.map((skill) => {
            const s = player.skills[skill];
            return (
              <li key={skill}>
                <span>{t(`skill.${skill}`)}</span>
                <span className="muted">
                  {t('agenda.level', { level: s.level })}
                  {s.nextLevelXp !== null && ` · ${n(s.xp, 0)}/${n(s.nextLevelXp, 0)} XP`}
                </span>
              </li>
            );
          })}
        </ul>
        {Object.keys(player.traits).length > 0 && (
          <p className="muted">
            {t('agenda.traits')}:{' '}
            {Object.keys(player.traits)
              .map((trait) => t(`trait.${trait}`))
              .join(', ')}
          </p>
        )}
      </Section>

      <Section title={t('agenda.unlocks')}>
        <ul className="unlocks">
          {CLASS_IDS.map((classId) => {
            const active = player.activeClasses.includes(classId);
            const requirement = player.unlocks[classId];
            return (
              <li key={classId}>
                <strong>{t(`class.${classId}`)}</strong>{' '}
                <span className="muted">
                  {active
                    ? t('unlock.active')
                    : requirement === null
                      ? t('unlock.ready')
                      : t(requirement.key, requirement.params)}
                </span>
                {!active && requirement === null && (
                  <CommandForm
                    type="class.unlock"
                    submitLabel={t('agenda.unlock')}
                    fields={
                      classId === 'freelancer'
                        ? [
                            {
                              name: 'role',
                              label: t('join.role'),
                              kind: 'select',
                              initial: 'tax',
                              options: options('role', FREELANCER_ROLES),
                            },
                          ]
                        : []
                    }
                    build={(v) => ({
                      classId,
                      ...(classId === 'freelancer' ? { role: v.role } : {}),
                    })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t('agenda.lifestyle')}>
        <CommandForm
          type="player.setLifestyle"
          submitLabel={t('agenda.save')}
          fields={[
            {
              name: 'level',
              label: t('agenda.lifestyle'),
              kind: 'select',
              initial: String(player.lifestyleLevel),
              options: [1, 2, 3, 4, 5].map((l) => ({
                value: String(l),
                label: t('agenda.lifestyleLevel', { level: String(l) }),
              })),
            },
          ]}
          build={(v) => ({ level: Number(v.level) })}
        />
      </Section>

      <Section title={t('agenda.autopilot')}>
        <p className="muted">{t('agenda.autopilotHint')}</p>
        <Details summary={t('agenda.autopilot')}>
          <CommandForm
            type="player.setAutopilot"
            submitLabel={t('agenda.save')}
            fields={(['pricing', 'replaceQuits', 'investSurplus'] as const).map((rule) => ({
              name: rule,
              label: t(`autopilot.${rule}`),
              kind: 'checkbox' as const,
              initial: player.autopilot[rule],
            }))}
            build={(v) => ({
              pricing: v.pricing === true,
              replaceQuits: v.replaceQuits === true,
              investSurplus: v.investSurplus === true,
            })}
          />
        </Details>
      </Section>
    </div>
  );
}
