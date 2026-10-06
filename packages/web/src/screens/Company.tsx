import type { CompanyView } from '@business-game/engine';
import { useGame } from '../game';
import { useI18n } from '../i18n';
import { FOUNDABLE_FORMS, SECTOR_IDS } from '../ids';
import { CommandButton, CommandForm, Details, Section, Stat, useOptions } from '../ui';

export function CompanyScreen() {
  const { view } = useGame();
  const { t, n } = useI18n();
  const options = useOptions();
  const active = view.companies.filter((c) => c.status === 'active');
  const canFound = view.player.activeClasses.includes('entrepreneur');

  return (
    <div className="stack">
      {active.length === 0 && (
        <Section>
          <p className="muted">{t('company.none')}</p>
        </Section>
      )}
      {active.map((company) => (
        <CompanyPanel key={company.id} company={company} />
      ))}

      {view.holdings.length > 0 && (
        <Section title={t('company.holdings')}>
          <ul className="list">
            {view.holdings.map((h) => (
              <li key={h.companyId}>
                <strong>
                  {t(`sector.${h.sector}`)} #{h.companyId}
                </strong>
                <span className="muted">
                  {t('company.holdingInfo', {
                    share: Math.round(h.share * 1000) / 10,
                    value: Math.round(h.estimatedValue),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {canFound && (
        <Section title={t('company.found')}>
          <CommandForm
            type="company.found"
            submitLabel={t('company.found')}
            fields={[
              {
                name: 'sector',
                label: t('join.sector'),
                kind: 'select',
                initial: 'retail',
                options: options('sector', SECTOR_IDS),
              },
              {
                name: 'legalForm',
                label: t('company.legalForm'),
                kind: 'select',
                initial: 'sole_proprietorship',
                options: options('legal', FOUNDABLE_FORMS),
              },
              { name: 'capital', label: t('company.capital'), kind: 'number', initial: 20000 },
            ]}
            build={(v) => ({
              sector: v.sector,
              legalForm: v.legalForm,
              capital: Number(v.capital),
            })}
          />
          <p className="muted">
            {t('market.fundBalance', { amount: Math.round(view.player.fund) })} · {t('home.cash')}:{' '}
            {n(view.player.cash, 0)} Cr
          </p>
        </Section>
      )}
    </div>
  );
}

function CompanyPanel({ company }: { company: CompanyView }) {
  const { t, n, pct } = useI18n();
  const id = company.id;
  const profitTone = company.lastMonth.profit >= 0 ? 'good' : 'bad';
  return (
    <Section title={`${t(`sector.${company.sector}`)} #${id} · ${t(`legal.${company.legalForm}`)}`}>
      <div className="stats">
        <Stat label={t('company.customers')} value={n(company.customers, 0)} />
        <Stat label={t('company.capacity')} value={n(company.capacity, 0)} />
        <Stat label={t('company.price')} value={n(company.price)} />
        <Stat label={t('company.cash')} value={`${n(company.cash, 0)} Cr`} />
        <Stat
          label={t('company.profit')}
          value={`${n(company.lastMonth.profit, 0)} Cr`}
          tone={profitTone}
        />
        <Stat label={t('company.value')} value={`${n(company.value, 0)} Cr`} />
        <Stat label={t('company.satisfaction')} value={pct(company.satisfaction)} />
        <Stat label={t('company.quality')} value={n(company.quality)} />
        <Stat label={t('company.brand')} value={n(company.brand)} />
        <Stat label={t('company.morale')} value={n(company.morale)} />
        <Stat label={t('company.workers')} value={String(company.workers)} />
        <Stat label={t('company.rating')} value={company.creditRating} />
      </div>
      <p className="muted">
        {t('company.lastMonth')}: {t('company.revenue')} {n(company.lastMonth.revenue, 0)} ·{' '}
        {t('company.costs')} {n(company.lastMonth.costs, 0)} · {t('company.share')}{' '}
        {pct(company.myShare)}
      </p>

      <Details
        summary={`${t('company.price')} · ${t('company.operatorPrice', { price: company.operatorPrice })}`}
      >
        <CommandForm
          type="company.setPrice"
          submitLabel={t('company.apply')}
          fields={[
            { name: 'price', label: t('company.price'), kind: 'number', initial: company.price },
          ]}
          build={(v) => ({ companyId: id, price: Number(v.price) })}
        />
      </Details>

      <Details
        summary={`${t('company.workers')} · ${t('company.marketWage', { wage: company.marketWage })}`}
      >
        <CommandForm
          type="company.setWorkforce"
          submitLabel={t('company.apply')}
          fields={[
            {
              name: 'workers',
              label: t('company.workers'),
              kind: 'number',
              initial: company.targetWorkers,
              step: 1,
            },
            { name: 'wage', label: t('company.wage'), kind: 'number', initial: company.wage },
          ]}
          build={(v) => ({
            companyId: id,
            workers: Math.round(Number(v.workers)),
            wage: Number(v.wage),
          })}
        />
      </Details>

      <Details summary={t('company.budget')}>
        <CommandForm
          type="company.setBudget"
          submitLabel={t('company.apply')}
          fields={(['marketing', 'rnd', 'training', 'service'] as const).map((k) => ({
            name: k,
            label: t(`budget.${k}`),
            kind: 'number' as const,
            initial: company.budget[k],
          }))}
          build={(v) => ({
            companyId: id,
            marketing: Number(v.marketing),
            rnd: Number(v.rnd),
            training: Number(v.training),
            service: Number(v.service),
          })}
        />
      </Details>

      <Details
        summary={`${t('company.equipment')} · ${t('company.equipmentInfo', {
          equipment: Math.round(company.equipment),
          required: Math.round(company.requiredEquipment),
        })}`}
      >
        <CommandForm
          type="company.buyEquipment"
          submitLabel={t('company.buyEquipment')}
          fields={[
            {
              name: 'amount',
              label: t('company.amount'),
              kind: 'number',
              initial: Math.max(100, Math.round(company.requiredEquipment - company.equipment)),
            },
          ]}
          build={(v) => ({ companyId: id, amount: Number(v.amount) })}
        />
      </Details>

      <Details summary={`${t('company.deposit')} / ${t('company.withdraw')}`}>
        <CommandForm
          type="company.transferCash"
          submitLabel={t('company.apply')}
          fields={[
            {
              name: 'direction',
              label: t('company.deposit'),
              kind: 'select',
              initial: 'deposit',
              options: [
                { value: 'deposit', label: t('company.deposit') },
                { value: 'withdraw', label: t('company.withdraw') },
              ],
            },
            { name: 'amount', label: t('company.amount'), kind: 'number', initial: 1000 },
          ]}
          build={(v) => ({ companyId: id, direction: v.direction, amount: Number(v.amount) })}
        />
        {company.legalForm !== 'sole_proprietorship' && (
          <CommandForm
            type="company.payDividend"
            submitLabel={t('company.dividend')}
            secondary
            fields={[{ name: 'amount', label: t('company.amount'), kind: 'number', initial: 1000 }]}
            build={(v) => ({ companyId: id, amount: Number(v.amount) })}
          />
        )}
      </Details>

      {company.legalForm === 'sole_proprietorship' && (
        <Details summary={t('company.incorporate')}>
          <CommandForm
            type="company.incorporate"
            submitLabel={t('company.incorporate')}
            fields={[
              {
                name: 'legalForm',
                label: t('company.legalForm'),
                kind: 'select',
                initial: 'srl',
                options: [
                  { value: 'srl', label: t('legal.srl') },
                  { value: 'spa', label: t('legal.spa') },
                ],
              },
            ]}
            build={(v) => ({ companyId: id, legalForm: v.legalForm })}
          />
        </Details>
      )}

      {company.legalForm !== 'sole_proprietorship' && (
        <Details summary={t('company.equityOffer')}>
          {company.equityOffer !== null ? (
            <>
              <p>
                {t('company.equityCurrent', {
                  share: Math.round(company.equityOffer.share * 1000) / 10,
                  price: Math.round(company.equityOffer.price),
                })}
              </p>
              <CommandButton
                type="equity.cancel"
                payload={{ companyId: id }}
                label={t('company.cancelOffer')}
                secondary
              />
            </>
          ) : (
            <CommandForm
              type="equity.offer"
              submitLabel={t('company.apply')}
              fields={[
                {
                  name: 'share',
                  label: t('company.equityShare'),
                  kind: 'number',
                  initial: 0.1,
                  step: 0.01,
                },
                {
                  name: 'price',
                  label: t('company.equityPrice'),
                  kind: 'number',
                  initial: Math.round(company.value * 0.1),
                },
              ]}
              build={(v) => ({ companyId: id, share: Number(v.share), price: Number(v.price) })}
            />
          )}
        </Details>
      )}
    </Section>
  );
}
