import { useLocalStorage } from 'usehooks-ts';

import type { LocalPrefs } from '@actual-app/core/types/prefs';

import { useMetadataPref } from '#hooks/useMetadataPref';
import { useSelector } from '#redux';

type WishlistPrefName = 'wishlistItems' | 'wishlistScenario';

function profileScope(profileId: string | null | undefined) {
  // Keep the authenticated identifier out of localStorage keys.
  const value = profileId ?? 'local';
  let hash = 2166136261;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Device-local wishlist data scoped to both the signed-in profile and budget. */
export function useWishlistLocalPref<K extends WishlistPrefName>(
  prefName: K,
) {
  const [budgetId] = useMetadataPref('id');
  const profileId = useSelector(state => state.users.data?.userId);
  const key = [
    'wishlist',
    profileScope(profileId),
    budgetId ?? 'no-budget',
    prefName,
  ].join(':');

  return useLocalStorage<LocalPrefs[K]>(key, undefined, {
    deserializer: JSON.parse,
    serializer: JSON.stringify,
  });
}
