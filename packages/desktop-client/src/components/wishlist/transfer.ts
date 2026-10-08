import type { WishlistItem } from '@actual-app/core/types/prefs';

export const WISHLIST_EXPORT_VERSION = 1;

function copyItem(item: WishlistItem): WishlistItem {
  return {
    id: item.id,
    name: item.name,
    sourceUrl: item.sourceUrl,
    priceMinor: item.priceMinor,
    currencyCode: item.currencyCode,
    priceCheckedDate: item.priceCheckedDate,
    createdAt: item.createdAt,
  };
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value + 'T00:00:00.000Z');
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validItem(value: unknown): value is WishlistItem {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    item.id.length === 0 ||
    typeof item.name !== 'string' ||
    item.name.trim().length === 0 ||
    typeof item.sourceUrl !== 'string' ||
    !Number.isSafeInteger(item.priceMinor) ||
    (item.priceMinor as number) <= 0 ||
    typeof item.currencyCode !== 'string' ||
    !/^[A-Z]{3}$/.test(item.currencyCode) ||
    !validDate(item.priceCheckedDate) ||
    typeof item.createdAt !== 'string' ||
    Number.isNaN(Date.parse(item.createdAt))
  ) {
    return false;
  }
  if (item.sourceUrl) {
    try {
      const url = new URL(item.sourceUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Serialize only wishlist items. Forecast cashflow inputs are deliberately excluded. */
export function serializeWishlistItems(items: WishlistItem[]): string {
  return JSON.stringify(
    { version: WISHLIST_EXPORT_VERSION, items: items.map(copyItem) },
    null,
    2,
  );
}

/** Parse and validate a wishlist export without importing any forecast data. */
export function parseWishlistItems(payload: string): WishlistItem[] {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).version !== WISHLIST_EXPORT_VERSION ||
    !Array.isArray((value as Record<string, unknown>).items) ||
    !(value as { items: unknown[] }).items.every(validItem)
  ) {
    throw new Error('The selected file is not a valid wishlist export.');
  }
  const items = (value as { items: WishlistItem[] }).items;
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new Error('The wishlist export contains duplicate item IDs.');
    }
    ids.add(item.id);
  }
  return items.map(copyItem);
}

/** Append imported entries at the lowest priority and assign fresh local IDs. */
export function appendImportedWishlistItems(
  current: WishlistItem[],
  imported: WishlistItem[],
  createId: () => string,
): WishlistItem[] {
  const usedIds = new Set(current.map(item => item.id));
  const appended = imported.map(item => {
    let id = createId();
    let attempts = 0;
    while (usedIds.has(id)) {
      if (++attempts > 100) {
        throw new Error('Could not create unique IDs for imported items.');
      }
      id = createId();
    }
    usedIds.add(id);
    return { ...item, id };
  });
  return [...current, ...appended];
}
