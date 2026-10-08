import type {
  WishlistItem,
  WishlistScenario,
} from '@actual-app/core/types/prefs';
import { describe, expect, it } from 'vitest';

import {
  estimateWishlistAffordability,
  estimateWishlistAffordabilityByPriority,
  isWishlistPriceStale,
} from './affordability';

const item: WishlistItem = {
  id: 'item-1',
  name: 'Synthetic item',
  sourceUrl: 'https://example.test/item',
  priceMinor: 10_000,
  currencyCode: 'ZAR',
  priceCheckedDate: '2026-10-08',
  createdAt: '2026-10-08T00:00:00.000Z',
};

const scenario: WishlistScenario = {
  currencyCode: 'ZAR',
  spendableCashMinor: 5_000,
  safetyBufferMinor: 2_000,
  expectedIncome: [],
  expectedIncomeConfirmed: true,
  committedBills: [],
  committedBillsConfirmed: true,
  monthlyContributionMinor: 2_000,
  monthlyContributionStartDate: '2026-11-01',
};

describe('estimateWishlistAffordability', () => {
  it('requires explicit cashflow inputs, including confirmation of empty lists', () => {
    expect(
      estimateWishlistAffordability({
        item,
        scenario: undefined,
        today: '2026-10-08',
      }),
    ).toEqual({ status: 'unknown', reason: 'incomplete-inputs' });

    expect(
      estimateWishlistAffordability({
        item,
        scenario: { ...scenario, expectedIncomeConfirmed: false },
        today: '2026-10-08',
      }),
    ).toEqual({ status: 'unknown', reason: 'incomplete-inputs' });
  });

  it('uses current cash above the safety buffer', () => {
    expect(
      estimateWishlistAffordability({
        item: { ...item, priceMinor: 3_000 },
        scenario,
        today: '2026-10-08',
      }),
    ).toEqual({
      status: 'date',
      date: '2026-10-08',
      plannedSavingsMinor: 3_000,
    });
  });

  it('caps monthly contributions at cash available after dated bills', () => {
    const dates = ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'];
    const result = estimateWishlistAffordability({
      item,
      scenario: {
        ...scenario,
        expectedIncome: dates.map((date, index) => ({
          id: 'pay-' + index,
          date,
          amountMinor: 10_000,
        })),
        committedBills: dates.map((date, index) => ({
          id: 'bill-' + index,
          date,
          amountMinor: 8_000,
        })),
      },
      today: '2026-10-08',
    });

    expect(result).toEqual({
      status: 'date',
      date: '2027-02-01',
      plannedSavingsMinor: 11_000,
    });
  });

  it('does not double-count a contribution as new income', () => {
    const result = estimateWishlistAffordability({
      item,
      scenario: {
        ...scenario,
        spendableCashMinor: 2_000,
        expectedIncome: [],
        committedBills: [],
        monthlyContributionMinor: 2_000,
      },
      today: '2026-10-08',
    });

    expect(result).toEqual({ status: 'unknown', reason: 'outside-horizon' });
  });

  it('applies same-day committed bills before purchases', () => {
    const result = estimateWishlistAffordability({
      item: { ...item, priceMinor: 5_000 },
      scenario: {
        ...scenario,
        spendableCashMinor: 8_000,
        expectedIncome: [
          { id: 'pay-1', date: '2026-10-08', amountMinor: 1_000 },
        ],
        committedBills: [
          { id: 'bill-1', date: '2026-10-08', amountMinor: 2_500 },
        ],
        monthlyContributionMinor: 0,
      },
      today: '2026-10-08',
    });

    expect(result).toEqual({ status: 'unknown', reason: 'outside-horizon' });
  });

  it('protects the safety buffer before contributing', () => {
    const result = estimateWishlistAffordability({
      item,
      scenario: {
        ...scenario,
        expectedIncome: [
          { id: 'pay-1', date: '2026-11-01', amountMinor: 10_000 },
        ],
        committedBills: [
          { id: 'bill-1', date: '2026-11-01', amountMinor: 9_500 },
        ],
      },
      today: '2026-10-08',
    });

    expect(result).toEqual({ status: 'unknown', reason: 'outside-horizon' });
  });

  it('returns unknown for negative or malformed inputs', () => {
    expect(
      estimateWishlistAffordability({
        item,
        scenario: { ...scenario, spendableCashMinor: -1 },
        today: '2026-10-08',
      }),
    ).toEqual({ status: 'unknown', reason: 'incomplete-inputs' });

    expect(
      estimateWishlistAffordability({
        item,
        scenario: {
          ...scenario,
          expectedIncome: [{ id: 'bad', date: '2026-10-09', amountMinor: -1 }],
        },
        today: '2026-10-08',
      }),
    ).toEqual({ status: 'unknown', reason: 'incomplete-inputs' });
  });

  it('does not compare prices across currencies without conversion', () => {
    expect(
      estimateWishlistAffordability({
        item: { ...item, currencyCode: 'USD' },
        scenario,
        today: '2026-10-08',
      }),
    ).toEqual({ status: 'unknown', reason: 'currency-mismatch' });
  });

  it('spends one shared reserve in wishlist priority order', () => {
    const dates = ['2026-11-01', '2026-12-01', '2027-01-01'];
    const result = estimateWishlistAffordabilityByPriority({
      items: [
        { ...item, id: 'first', priceMinor: 6_000 },
        { ...item, id: 'second', priceMinor: 6_000 },
      ],
      scenario: {
        ...scenario,
        spendableCashMinor: 8_000,
        expectedIncome: dates.map((date, index) => ({
          id: 'pay-' + index,
          date,
          amountMinor: 4_000,
        })),
        committedBills: dates.map((date, index) => ({
          id: 'bill-' + index,
          date,
          amountMinor: 2_000,
        })),
      },
      today: '2026-10-08',
    });

    expect(result.get('first')).toEqual({
      status: 'date',
      date: '2026-10-08',
      plannedSavingsMinor: 6_000,
    });
    expect(result.get('second')).toEqual({
      status: 'date',
      date: '2027-01-01',
      plannedSavingsMinor: 6_000,
    });
  });

  it('blocks lower priorities when a higher-priority price is unknown', () => {
    const result = estimateWishlistAffordabilityByPriority({
      items: [
        { ...item, id: 'first', currencyCode: 'USD' },
        { ...item, id: 'second' },
      ],
      scenario,
      today: '2026-10-08',
    });

    expect(result.get('first')).toEqual({
      status: 'unknown',
      reason: 'currency-mismatch',
    });
    expect(result.get('second')).toEqual({
      status: 'unknown',
      reason: 'blocked-by-higher-priority',
    });
  });

  it('keeps monthly dates stable across month ends and timezone boundaries', () => {
    const monthEnd = estimateWishlistAffordability({
      item: { ...item, priceMinor: 3_000 },
      scenario: {
        ...scenario,
        spendableCashMinor: 1_000,
        safetyBufferMinor: 1_000,
        expectedIncome: [
          { id: 'jan', date: '2027-01-31', amountMinor: 1_000 },
          { id: 'feb', date: '2027-02-28', amountMinor: 1_000 },
          { id: 'mar', date: '2027-03-31', amountMinor: 1_000 },
        ],
        monthlyContributionMinor: 1_000,
        monthlyContributionStartDate: '2027-01-31',
      },
      today: '2027-01-01',
    });
    expect(monthEnd).toEqual({
      status: 'date',
      date: '2027-03-31',
      plannedSavingsMinor: 3_000,
    });

    const dstBoundary = estimateWishlistAffordability({
      item: { ...item, priceMinor: 1_000 },
      scenario: {
        ...scenario,
        spendableCashMinor: 1_000,
        safetyBufferMinor: 1_000,
        expectedIncome: [{ id: 'pay', date: '2026-03-08', amountMinor: 1_000 }],
        monthlyContributionMinor: 1_000,
        monthlyContributionStartDate: '2026-03-08',
      },
      today: '2026-03-08',
    });
    expect(dstBoundary.status === 'date' && dstBoundary.date).toBe(
      '2026-03-08',
    );
  });

  it('does not produce an affordability date without funding inside the horizon', () => {
    expect(
      estimateWishlistAffordability({
        item,
        scenario: {
          ...scenario,
          spendableCashMinor: 2_000,
          monthlyContributionMinor: 0,
        },
        today: '2026-10-08',
      }),
    ).toEqual({ status: 'unknown', reason: 'outside-horizon' });
  });
});

describe('isWishlistPriceStale', () => {
  it('flags old or invalid manual prices but accepts a recent date', () => {
    expect(isWishlistPriceStale('2026-10-08', '2026-11-07')).toBe(false);
    expect(isWishlistPriceStale('2026-10-08', '2026-11-08')).toBe(true);
    expect(isWishlistPriceStale('bad-date', '2026-11-08')).toBe(true);
  });
});
