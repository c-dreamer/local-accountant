import {
  DEFAULT_CURRENCY_CODE,
  getCurrency,
} from '@actual-app/core/shared/currencies';
import { integerToAmount } from '@actual-app/core/shared/util';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import { useQuery } from '@tanstack/react-query';

import { exchangeRateQueries } from '#util/exchangeRates';

import { useSyncedPref } from './useSyncedPref';

/**
 * The optional second currency that totals are also shown in, converted at
 * the latest ECB reference rate. Returns `null` while the setting is off or
 * before any rate has been downloaded. No request is made while it is off.
 */
export function useSecondaryCurrency() {
  const [primaryPref] = useSyncedPref('defaultCurrencyCode');
  const [secondaryPref] = useSyncedPref('secondaryCurrencyCode');
  const primaryCode = primaryPref || DEFAULT_CURRENCY_CODE;
  const secondaryCode = secondaryPref || '';
  const isEnabled = secondaryCode !== '' && secondaryCode !== primaryCode;

  const query = useQuery({
    ...exchangeRateQueries.rate(primaryCode, secondaryCode),
    enabled: isEnabled,
  });
  const exchangeRate = isEnabled ? query.data : undefined;
  if (!exchangeRate) {
    return null;
  }

  const { decimalPlaces } = getCurrency(primaryCode);
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: secondaryCode,
  });

  return {
    currencyCode: secondaryCode,
    date: exchangeRate.date,
    rate: exchangeRate.rate,
    format: (amount: IntegerAmount) =>
      `≈ ${formatter.format(integerToAmount(amount, decimalPlaces) * exchangeRate.rate)}`,
  };
}
