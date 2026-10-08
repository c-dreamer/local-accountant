import { describe, expect, it } from 'vitest';

import { wishlistLocalStorageKey } from './useWishlistLocalPref';

describe('wishlist local storage privacy scope', () => {
  it('isolates each profile and budget without putting identifiers in the key', () => {
    const first = wishlistLocalStorageKey({
      profileId: 'synthetic-profile-a',
      budgetId: 'synthetic-budget-a',
      prefName: 'wishlistItems',
    });
    const otherProfile = wishlistLocalStorageKey({
      profileId: 'synthetic-profile-b',
      budgetId: 'synthetic-budget-a',
      prefName: 'wishlistItems',
    });
    const otherBudget = wishlistLocalStorageKey({
      profileId: 'synthetic-profile-a',
      budgetId: 'synthetic-budget-b',
      prefName: 'wishlistItems',
    });

    expect(new Set([first, otherProfile, otherBudget]).size).toBe(3);
    expect(first).not.toContain('synthetic-profile-a');
    expect(first).not.toContain('synthetic-budget-a');
    expect(
      wishlistLocalStorageKey({
        profileId: 'synthetic-profile-a',
        budgetId: 'synthetic-budget-a',
        prefName: 'wishlistScenario',
      }),
    ).not.toBe(first);
  });
});
