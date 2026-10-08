import type { LocalPrefs } from '@actual-app/core/types/prefs';
import { useLocalStorage } from 'usehooks-ts';

import { useMetadataPref } from '#hooks/useMetadataPref';
import { useSelector } from '#redux';

type WishlistPrefName = 'wishlistItems' | 'wishlistScenario';
type WishlistPrefScope = {
  profileId: string | null | undefined;
  budgetId: string | null | undefined;
  prefName: WishlistPrefName;
};

function scopeHash(value: string) {
  // Keep profile and budget identifiers out of localStorage keys.
  let hash = 14695981039346656037n;
  for (const character of value) {
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(character.charCodeAt(0))) * 1099511628211n,
    );
  }
  return hash.toString(36);
}

export function wishlistLocalStorageKey({
  profileId,
  budgetId,
  prefName,
}: WishlistPrefScope) {
  return `wishlist:${scopeHash(`${profileId ?? 'local'}\u0000${budgetId ?? 'no-budget'}`)}:${prefName}`;
}

/** Device-local wishlist data scoped to both the signed-in profile and budget. */
export function useWishlistLocalPref<K extends WishlistPrefName>(prefName: K) {
  const [budgetId] = useMetadataPref('id');
  const profileId = useSelector(state => state.users.data?.userId);
  const key = wishlistLocalStorageKey({ profileId, budgetId, prefName });

  const [value, setValue] = useLocalStorage<LocalPrefs[K]>(key, undefined, {
    deserializer: JSON.parse,
    serializer: JSON.stringify,
  });
  return [value, setValue, key] as const;
}
