import type { WishlistItem } from '@actual-app/core/types/prefs';
import { describe, expect, it } from 'vitest';

import {
  appendImportedWishlistItems,
  parseWishlistItems,
  serializeWishlistItems,
} from './transfer';

const item: WishlistItem = {
  id: 'source-id',
  name: 'Synthetic headphones',
  sourceUrl: 'https://example.test/headphones',
  priceMinor: 12_345,
  currencyCode: 'ZAR',
  priceCheckedDate: '2026-10-08',
  createdAt: '2026-10-08T12:00:00.000Z',
};

describe('wishlist item transfer', () => {
  it('round-trips item entries and exports no scenario data', () => {
    const exported = serializeWishlistItems([item]);
    expect(JSON.parse(exported)).toEqual({ version: 1, items: [item] });
    expect(exported).not.toContain('spendableCash');
    expect(parseWishlistItems(exported)).toEqual([item]);
  });

  it('rejects malformed files and invalid item fields', () => {
    expect(() => parseWishlistItems('{')).toThrow('not valid JSON');
    expect(() =>
      parseWishlistItems(JSON.stringify({ version: 2, items: [item] })),
    ).toThrow('not a valid wishlist export');
    expect(() =>
      parseWishlistItems(
        JSON.stringify({
          version: 1,
          items: [{ ...item, sourceUrl: 'file:///tmp/not-a-web-source' }],
        }),
      ),
    ).toThrow('not a valid wishlist export');
  });

  it('rejects duplicate IDs inside an imported file', () => {
    expect(() =>
      parseWishlistItems(
        JSON.stringify({ version: 1, items: [item, { ...item }] }),
      ),
    ).toThrow('duplicate item IDs');
  });

  it('strips unrecognized fields instead of retaining arbitrary payload data', () => {
    const parsed = parseWishlistItems(
      JSON.stringify({
        version: 1,
        items: [{ ...item, forecastScenario: { spendableCashMinor: 99_999 } }],
      }),
    );

    expect(parsed).toEqual([item]);
    expect(serializeWishlistItems(parsed)).not.toContain('forecastScenario');
  });

  it('assigns new IDs on import and appends entries after existing priorities', () => {
    const imported = parseWishlistItems(serializeWishlistItems([item]));
    const generatedIds = ['local-id', 'imported-id'];
    const appended = appendImportedWishlistItems(
      [{ ...item, id: 'local-id' }],
      imported,
      () => generatedIds.shift() ?? 'fallback-id',
    );

    expect(appended.map(entry => entry.id)).toEqual([
      'local-id',
      'imported-id',
    ]);
  });
});
