import React from 'react';
import { useTranslation } from 'react-i18next';

import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import type { IntegerAmount } from '@actual-app/core/shared/util';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useSecondaryCurrency } from '#hooks/useSecondaryCurrency';

type SecondaryAmountProps = {
  value: IntegerAmount | string | null | undefined;
  style?: CSSProperties;
};

/**
 * A total converted into the optional second currency, e.g. "≈ $1,234.56".
 * Renders nothing while the setting is off or no rate is available.
 */
export function SecondaryAmount({ value, style }: SecondaryAmountProps) {
  const { t } = useTranslation();
  const secondaryCurrency = useSecondaryCurrency();

  if (!secondaryCurrency || typeof value !== 'number') {
    return null;
  }

  return (
    <FinancialText
      title={t('Converted at the ECB reference rate of {{date}}', {
        date: secondaryCurrency.date,
      })}
      style={{
        fontSize: 11,
        fontWeight: 400,
        color: theme.pageTextSubdued,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <PrivacyFilter>{secondaryCurrency.format(value)}</PrivacyFilter>
    </FinancialText>
  );
}
