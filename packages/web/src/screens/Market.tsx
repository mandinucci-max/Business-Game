import { useGame } from '../game';
import { useI18n } from '../i18n';
import { SECTOR_IDS } from '../ids';
import { CommandButton, CommandForm, Details, Section, Stat } from '../ui';

export function MarketScreen() {
  const { view } = useGame();
  const { t, n, pct } = useI18n();
  const { market, player } = view;
  const myCompanies = view.companies.filter((c) => c.status === 'active');
  const isInvestor = player.activeClasses.includes('investor');

  return (
    <div className="stack">
      <Section title={t('market.macro')}>
        {market === null ? (
          <p className="muted">{t('market.noReport')}</p>
        ) : (
          <>
            <div className="stats">
              <Stat label={t('market.inflation')} value={pct(market.inflation)} />
              <Stat label={t('market.unemployment')} value={pct(market.unemployment)} />
              <Stat label={t('market.policyRate')} value={pct(market.policyRate)} />
            </div>
            <p className="muted">
              {t('market.events')}:{' '}
              {market.activeEvents.length === 0
                ? t('market.noEvents')
                : market.activeEvents.map((e) => t(`event.${e}`)).join(', ')}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('market.sectors')}</th>
                    <th>{t('market.avgPrice')}</th>
                    <th>{t('market.demand')}</th>
                    <th>{t('market.playerShare')}</th>
                    <th>{t('market.companies')}</th>
                  </tr>
                </thead>
                <tbody>
                  {SECTOR_IDS.map((sector) => {
                    const row = market.markets[sector];
                    return (
                      <tr key={sector}>
                        <td>{t(`sector.${sector}`)}</td>
                        <td>{n(row.averagePrice)}</td>
                        <td>{n(row.demand, 0)}</td>
                        <td>{pct(row.playerShare)}</td>
                        <td>{row.companies}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <Section title={t('market.fund')}>
        <p>{t('market.fundBalance', { amount: Math.round(player.fund) })}</p>
        <CommandForm
          type="fund.invest"
          submitLabel={t('market.invest')}
          fields={[{ name: 'amount', label: t('company.amount'), kind: 'number', initial: 1000 }]}
          build={(v) => ({ amount: Number(v.amount) })}
        />
        <CommandForm
          type="fund.redeem"
          submitLabel={t('market.redeem')}
          secondary
          fields={[{ name: 'amount', label: t('company.amount'), kind: 'number', initial: 1000 }]}
          build={(v) => ({ amount: Number(v.amount) })}
        />
      </Section>

      <Section title={t('market.realEstate')}>
        {(['residential', 'commercial'] as const).map((kind) => {
          const info = view.realEstate[kind];
          return (
            <Details key={kind} summary={t(`market.${kind}`)}>
              <p>
                {t('market.propertyInfo', {
                  price: Math.round(info.price),
                  rent: Math.round(info.rent),
                  occupancy: Math.round(info.occupancy * 100),
                  owned: player.properties[kind],
                })}
              </p>
              <CommandForm
                type="property.buy"
                submitLabel={t('market.buy')}
                fields={[
                  { name: 'units', label: t('market.units'), kind: 'number', initial: 1, step: 1 },
                ]}
                build={(v) => ({ kind, units: Math.round(Number(v.units)) })}
              />
              {player.properties[kind] > 0 && (
                <CommandForm
                  type="property.sell"
                  submitLabel={t('market.sell')}
                  secondary
                  fields={[
                    {
                      name: 'units',
                      label: t('market.units'),
                      kind: 'number',
                      initial: 1,
                      step: 1,
                    },
                  ]}
                  build={(v) => ({ kind, units: Math.round(Number(v.units)) })}
                />
              )}
            </Details>
          );
        })}
      </Section>

      <Section title={t('market.loans')}>
        <h3>{t('market.myLoans')}</h3>
        {view.loans.length === 0 ? (
          <p className="muted">{t('market.noLoans')}</p>
        ) : (
          <ul className="list">
            {view.loans.map((loan) => (
              <li key={loan.id}>
                <span>
                  {t('market.loanInfo', {
                    role: t(`market.${loan.role}`),
                    principal: Math.round(loan.principal),
                    rate: Math.round(loan.annualRate * 1000) / 10,
                    months: loan.remainingMonths,
                  })}
                </span>
                {loan.role === 'borrower' && (
                  <CommandForm
                    type="loan.repay"
                    submitLabel={t('market.repay')}
                    secondary
                    fields={[
                      {
                        name: 'amount',
                        label: t('company.amount'),
                        kind: 'number',
                        initial: Math.round(loan.principal),
                      },
                    ]}
                    build={(v) => ({ loanId: loan.id, amount: Number(v.amount) })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        <Details summary={t('market.bankLoan')}>
          {player.bankLoanRate !== null && (
            <p className="muted">
              {t('market.bankRate', {
                rate: Math.round(player.bankLoanRate * 1000) / 10,
                rating: player.creditRating,
              })}
            </p>
          )}
          <CommandForm
            type="loan.request"
            submitLabel={t('market.request')}
            fields={[
              { name: 'amount', label: t('company.amount'), kind: 'number', initial: 5000 },
              { name: 'months', label: t('market.months'), kind: 'number', initial: 24, step: 1 },
              {
                name: 'companyId',
                label: t('nav.company'),
                kind: 'select',
                initial: '',
                options: [
                  { value: '', label: '—' },
                  ...myCompanies.map((c) => ({
                    value: c.id,
                    label: `${t(`sector.${c.sector}`)} #${c.id}`,
                  })),
                ],
              },
            ]}
            build={(v) => ({
              amount: Number(v.amount),
              months: Math.round(Number(v.months)),
              ...(v.companyId === '' ? {} : { companyId: v.companyId }),
            })}
          />
        </Details>

        {isInvestor && (
          <Details summary={t('market.portfolioLoan')}>
            <CommandForm
              type="loan.portfolio"
              submitLabel={t('market.request')}
              fields={[
                { name: 'amount', label: t('company.amount'), kind: 'number', initial: 10000 },
                {
                  name: 'months',
                  label: t('market.months'),
                  kind: 'number',
                  initial: 36,
                  step: 1,
                },
              ]}
              build={(v) => ({ amount: Number(v.amount), months: Math.round(Number(v.months)) })}
            />
          </Details>
        )}
      </Section>

      <Section title={t('market.loanOffers')}>
        {view.offers.loans.length === 0 ? (
          <p className="muted">{t('market.noOffers')}</p>
        ) : (
          <ul className="list">
            {view.offers.loans.map((offer) => (
              <li key={offer.id}>
                <span>
                  {t('market.offerInfo', {
                    lender: offer.mine ? t('ranking.you') : (view.names[offer.lenderId] ?? '—'),
                    available: Math.round(offer.available),
                    rate: Math.round(offer.annualRate * 1000) / 10,
                    months: offer.months,
                  })}
                </span>
                {offer.mine ? (
                  <CommandButton
                    type="loan.cancelOffer"
                    payload={{ offerId: offer.id }}
                    label={t('market.cancel')}
                    secondary
                  />
                ) : (
                  <CommandForm
                    type="loan.acceptOffer"
                    submitLabel={t('market.accept')}
                    fields={[
                      {
                        name: 'amount',
                        label: t('company.amount'),
                        kind: 'number',
                        initial: Math.round(offer.available),
                      },
                    ]}
                    build={(v) => ({ offerId: offer.id, amount: Number(v.amount) })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {isInvestor && (
          <Details summary={t('market.newOffer')}>
            <CommandForm
              type="loan.offer"
              submitLabel={t('market.newOffer')}
              fields={[
                { name: 'amount', label: t('company.amount'), kind: 'number', initial: 10000 },
                {
                  name: 'annualRate',
                  label: t('market.annualRate'),
                  kind: 'number',
                  initial: 0.07,
                  step: 0.005,
                },
                {
                  name: 'months',
                  label: t('market.months'),
                  kind: 'number',
                  initial: 24,
                  step: 1,
                },
              ]}
              build={(v) => ({
                amount: Number(v.amount),
                annualRate: Number(v.annualRate),
                months: Math.round(Number(v.months)),
              })}
            />
          </Details>
        )}
      </Section>

      <Section title={t('market.equityOffers')}>
        {view.offers.equity.length === 0 ? (
          <p className="muted">{t('market.noOffers')}</p>
        ) : (
          <ul className="list">
            {view.offers.equity.map((offer) => (
              <li key={offer.companyId}>
                <span>
                  {t('market.equityInfo', {
                    sector: offer.sector,
                    share: Math.round(offer.share * 1000) / 10,
                    price: Math.round(offer.price),
                    profit: Math.round(offer.averageMonthlyProfit),
                  })}
                </span>
                {!offer.mine && (
                  <CommandButton
                    type="equity.buy"
                    payload={{ companyId: offer.companyId, share: offer.share }}
                    label={t('market.buy')}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
