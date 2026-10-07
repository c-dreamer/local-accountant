import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import {
  DEFAULT_CURRENCY_CODE,
  getCurrency,
} from '@actual-app/core/shared/currencies';

import { useSecondaryCurrency } from '#hooks/useSecondaryCurrency';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { EXCHANGE_RATE_CURRENCIES } from '#util/exchangeRates';

import { Column, Setting } from './UI';

export function SecondaryCurrencySettings() {
  const { t } = useTranslation();
  const [primaryPref] = useSyncedPref('defaultCurrencyCode');
  const [secondaryPref, setSecondaryPref] = useSyncedPref(
    'secondaryCurrencyCode',
  );
  const secondaryCurrency = useSecondaryCurrency();

  const primaryCode = primaryPref || DEFAULT_CURRENCY_CODE;
  const secondaryCode = secondaryPref || '';
  const isPrimarySupported = EXCHANGE_RATE_CURRENCIES.includes(primaryCode);

  const options: Array<[string, string]> = [
    ['', t('Off')],
    ...EXCHANGE_RATE_CURRENCIES.filter(code => code !== primaryCode).map(
      (code): [string, string] => [
        code,
        `${code} – ${getCurrency(code).name || code}`,
      ],
    ),
  ];

  return (
    <Setting
      primaryAction={
        <Column title={t('Also show amounts in')}>
          <Select
            value={secondaryCode}
            onChange={code => setSecondaryPref(code)}
            options={options}
            disabled={!isPrimarySupported}
          />
          {secondaryCode !== '' &&
            (secondaryCurrency ? (
              <Text style={{ color: theme.pageTextSubdued }}>
                <Trans>
                  1 {{ primaryCode }} ≈{' '}
                  {{ rate: secondaryCurrency.rate.toPrecision(4) }}{' '}
                  {{ secondaryCode }} (ECB reference rate of{' '}
                  {{ date: secondaryCurrency.date }})
                </Trans>
              </Text>
            ) : (
              <Text style={{ color: theme.pageTextSubdued }}>
                <Trans>
                  No exchange rate yet. Converted amounts appear once a rate has
                  been downloaded.
                </Trans>
              </Text>
            ))}
        </Column>
      }
    >
      <Text>
        <Trans>
          <strong>Second currency</strong> shows account totals, the amount to
          budget, and amounts you hover over converted into another currency.
          Turning it on downloads the European Central Bank's daily reference
          rate from frankfurter.dev; nothing about your budget is sent.
          Converted amounts are approximate and are never stored in your budget.
        </Trans>
      </Text>
      {!isPrimarySupported && (
        <Text style={{ color: theme.warningText }}>
          <Trans>No exchange rates are published for {{ primaryCode }}.</Trans>
        </Text>
      )}
    </Setting>
  );
}
