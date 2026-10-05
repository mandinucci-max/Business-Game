import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type LedgerState,
  LedgerError,
  MINT_ACCOUNT,
  SINK_ACCOUNT,
  type TransactionInput,
  amount,
  balanceOf,
  checkLedgerInvariants,
  circulatingSupply,
  createLedger,
  openAccount,
  postTransaction,
} from '../src/index';

const mint = (to: string, units: number): TransactionInput => ({
  kind: 'faucet',
  reason: 'test:mint',
  postings: [
    { account: MINT_ACCOUNT, amount: amount(-units) },
    { account: to, amount: amount(units) },
  ],
});

const burn = (from: string, units: number): TransactionInput => ({
  kind: 'sink',
  reason: 'test:burn',
  postings: [
    { account: from, amount: amount(-units) },
    { account: SINK_ACCOUNT, amount: amount(units) },
  ],
});

const transfer = (from: string, to: string, units: number): TransactionInput => ({
  kind: 'transfer',
  reason: 'test:transfer',
  postings: [
    { account: from, amount: amount(-units) },
    { account: to, amount: amount(units) },
  ],
});

function ledgerWith(...accounts: string[]): LedgerState {
  const ledger = createLedger();
  for (const id of accounts) {
    openAccount(ledger, id);
  }
  return ledger;
}

function expectLedgerError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LedgerError);
    expect((error as LedgerError).code).toBe(code);
    return;
  }
  throw new Error(`atteso LedgerError ${code}`);
}

describe('registro a partita doppia', () => {
  it('entrate, trasferimenti e uscite aggiornano saldi e totali', () => {
    const ledger = ledgerWith('player:a', 'player:b');
    postTransaction(ledger, mint('player:a', 1000), 0);
    postTransaction(ledger, transfer('player:a', 'player:b', 300), 0);
    postTransaction(ledger, burn('player:b', 100), 0);

    expect(balanceOf(ledger, 'player:a')).toBe(700);
    expect(balanceOf(ledger, 'player:b')).toBe(200);
    expect(ledger.totalFaucet).toBe(1000);
    expect(ledger.totalSink).toBe(100);
    expect(circulatingSupply(ledger)).toBe(900);
    expect(checkLedgerInvariants(ledger)).toEqual([]);
  });

  it('assegna id progressivi alle transazioni', () => {
    const ledger = ledgerWith('player:a');
    expect(postTransaction(ledger, mint('player:a', 1), 0).id).toBe(1);
    expect(postTransaction(ledger, mint('player:a', 1), 0).id).toBe(2);
  });

  it('rifiuta transazioni non bilanciate', () => {
    const ledger = ledgerWith('player:a', 'player:b');
    expectLedgerError(
      () =>
        postTransaction(
          ledger,
          {
            kind: 'transfer',
            reason: 'x',
            postings: [
              { account: 'player:a', amount: amount(-10) },
              { account: 'player:b', amount: amount(11) },
            ],
          },
          0,
        ),
      'unbalanced',
    );
  });

  it('rifiuta i fondi insufficienti senza modificare nulla', () => {
    const ledger = ledgerWith('player:a', 'player:b');
    postTransaction(ledger, mint('player:a', 100), 0);
    const before = structuredClone(ledger);
    expectLedgerError(
      () => postTransaction(ledger, transfer('player:a', 'player:b', 101), 0),
      'insufficient_funds',
    );
    expect(ledger).toEqual(before);
  });

  it('consente lo scoperto fino al fido', () => {
    const ledger = createLedger();
    openAccount(ledger, 'company:x', amount(500));
    openAccount(ledger, 'player:a');
    postTransaction(ledger, transfer('company:x', 'player:a', 500), 0);
    expect(balanceOf(ledger, 'company:x')).toBe(-500);
    expectLedgerError(
      () => postTransaction(ledger, transfer('company:x', 'player:a', 1), 0),
      'insufficient_funds',
    );
  });

  it('impedisce di creare o distruggere denaro con un trasferimento', () => {
    const ledger = ledgerWith('player:a');
    expectLedgerError(
      () => postTransaction(ledger, { ...mint('player:a', 100), kind: 'transfer' }, 0),
      'invalid_flow',
    );
    expectLedgerError(
      () => postTransaction(ledger, { ...transfer(MINT_ACCOUNT, 'player:a', 1), kind: 'sink' }, 0),
      'invalid_flow',
    );
    // Il conto SINK non può restituire denaro.
    expectLedgerError(
      () => postTransaction(ledger, { ...burn('player:a', -5), kind: 'sink' }, 0),
      'invalid_flow',
    );
  });

  it('rifiuta conti sconosciuti, duplicati o riservati', () => {
    const ledger = ledgerWith('player:a');
    expectLedgerError(() => postTransaction(ledger, mint('player:z', 1), 0), 'unknown_account');
    expectLedgerError(() => openAccount(ledger, 'player:a'), 'account_exists');
    expectLedgerError(() => openAccount(ledger, 'system:backdoor'), 'invalid_account_id');
    expectLedgerError(() => openAccount(ledger, ''), 'invalid_account_id');
  });

  it('rifiuta scritture a zero e transazioni con una sola scrittura', () => {
    const ledger = ledgerWith('player:a', 'player:b');
    expectLedgerError(
      () => postTransaction(ledger, transfer('player:a', 'player:b', 0), 0),
      'zero_posting',
    );
    expectLedgerError(
      () =>
        postTransaction(
          ledger,
          { kind: 'transfer', reason: 'x', postings: [{ account: 'player:a', amount: amount(1) }] },
          0,
        ),
      'too_few_postings',
    );
  });

  it('le invarianti reggono con qualsiasi sequenza di operazioni, valide o no', () => {
    const accounts = ['player:a', 'player:b', 'company:c'];
    const operation = fc.oneof(
      fc.record({
        type: fc.constant('mint' as const),
        to: fc.constantFrom(...accounts),
        units: fc.integer({ min: 1, max: 1_000_000 }),
      }),
      fc.record({
        type: fc.constant('burn' as const),
        from: fc.constantFrom(...accounts),
        units: fc.integer({ min: 1, max: 1_000_000 }),
      }),
      fc.record({
        type: fc.constant('transfer' as const),
        from: fc.constantFrom(...accounts),
        to: fc.constantFrom(...accounts),
        units: fc.integer({ min: 1, max: 1_000_000 }),
      }),
    );

    fc.assert(
      fc.property(fc.array(operation, { maxLength: 200 }), (operations) => {
        const ledger = createLedger();
        openAccount(ledger, 'player:a');
        openAccount(ledger, 'player:b');
        openAccount(ledger, 'company:c', amount(250_000));

        for (const op of operations) {
          const input =
            op.type === 'mint'
              ? mint(op.to, op.units)
              : op.type === 'burn'
                ? burn(op.from, op.units)
                : transfer(op.from, op.to, op.units);
          try {
            postTransaction(ledger, input, 0);
          } catch (error) {
            expect(error).toBeInstanceOf(LedgerError);
          }
          expect(checkLedgerInvariants(ledger)).toEqual([]);
        }
        expect(circulatingSupply(ledger)).toBe(ledger.totalFaucet - ledger.totalSink);
      }),
    );
  });
});
