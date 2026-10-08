import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  WishlistCashEvent,
  WishlistItem,
  WishlistScenario,
} from '@actual-app/core/types/prefs';

import { Link } from '#components/common/Link';
import { Page } from '#components/Page';

import {
  estimateWishlistAffordabilityByPriority,
  isWishlistPriceStale,
} from './affordability';
import type { AffordabilityEstimate } from './affordability';
import {
  appendImportedWishlistItems,
  parseWishlistItems,
  serializeWishlistItems,
} from './transfer';
import { useWishlistLocalPref } from './useWishlistLocalPref';

type ItemDraft = {
  name: string;
  sourceUrl: string;
  price: string;
  currencyCode: string;
  priceCheckedDate: string;
};

type ScenarioDraft = {
  currencyCode: string;
  spendableCash: string;
  safetyBuffer: string;
  monthlyContribution: string;
  contributionStartDate: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyItemDraft = (): ItemDraft => ({
  name: '',
  sourceUrl: '',
  price: '',
  currencyCode: '',
  priceCheckedDate: today(),
});
const moneyInput = (minor: number | null | undefined) =>
  minor == null ? '' : (minor / 100).toFixed(2);
const parseMoney = (value: string): number | null => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : null;
};
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ??
  Date.now().toString(36) + Math.random().toString(36).slice(2);

function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(minor / 100);
  } catch {
    return currency + ' ' + (minor / 100).toFixed(2);
  }
}

function formatDate(date: string) {
  const parsed = new Date(date + 'T00:00:00.000Z');
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { timeZone: 'UTC' });
}

function getScenarioDraft(
  scenario: WishlistScenario | undefined,
): ScenarioDraft {
  return {
    currencyCode: scenario?.currencyCode ?? '',
    spendableCash: moneyInput(scenario?.spendableCashMinor),
    safetyBuffer: moneyInput(scenario?.safetyBufferMinor),
    monthlyContribution: moneyInput(scenario?.monthlyContributionMinor),
    contributionStartDate: scenario?.monthlyContributionStartDate ?? '',
  };
}

function EventEditor({
  title,
  events,
  currencyCode,
  onAdd,
  onRemove,
}: {
  title: string;
  events: WishlistCashEvent[];
  currencyCode: string;
  onAdd: (event: WishlistCashEvent) => void;
  onRemove: (id: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountMinor = parseMoney(amount);
    if (!date || amountMinor === null || amountMinor <= 0) {
      setError('Enter a date and a positive amount.');
      return;
    }
    onAdd({
      id: makeId(),
      date,
      amountMinor,
      description: description.trim() || undefined,
    });
    setDescription('');
    setDate('');
    setAmount('');
    setError('');
  };

  return (
    <fieldset
      style={{
        border: '1px solid ' + theme.tableBorder,
        borderRadius: 6,
        padding: 12,
        margin: 0,
      }}
    >
      <legend style={{ padding: '0 6px', fontWeight: 600 }}>{title}</legend>
      {events.length === 0 ? (
        <Text style={{ color: theme.pageTextLight }}>
          <Trans>
            No dated entries. The estimate assumes none are planned.
          </Trans>
        </Text>
      ) : (
        <View style={{ gap: 6, marginBottom: 10 }}>
          {events
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(event => (
              <View
                key={event.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <Text style={{ flex: 1 }}>
                  {event.description
                    ? event.description + ' · ' + formatDate(event.date)
                    : formatDate(event.date)}
                </Text>
                <Text>{formatMoney(event.amountMinor, currencyCode)}</Text>
                <Button
                  variant="bare"
                  aria-label={'Remove ' + title.toLowerCase() + ' entry'}
                  onPress={() => onRemove(event.id)}
                >
                  <Trans>Remove</Trans>
                </Button>
              </View>
            ))}
        </View>
      )}
      <form
        onSubmit={submit}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
          alignItems: 'end',
        }}
      >
        <label>
          <Text>
            <Trans>Description</Trans>
          </Text>
          <Input
            aria-label={title + ' description'}
            value={description}
            onChange={event => setDescription(event.currentTarget.value)}
            placeholder={title}
          />
        </label>
        <label>
          <Text>
            <Trans>Date</Trans>
          </Text>
          <Input
            aria-label={title + ' date'}
            type="date"
            value={date}
            onChange={event => setDate(event.currentTarget.value)}
          />
        </label>
        <label>
          <Text>
            <Trans>Amount</Trans> ({currencyCode || 'currency'})
          </Text>
          <Input
            aria-label={title + ' amount'}
            inputMode="decimal"
            value={amount}
            onChange={event => setAmount(event.currentTarget.value)}
          />
        </label>
        <Button type="submit">
          <Trans>Add entry</Trans>
        </Button>
      </form>
      {error && <Text role="alert">{error}</Text>}
    </fieldset>
  );
}

function EstimateText({ estimate }: { estimate: AffordabilityEstimate }) {
  if (estimate.status === 'date') {
    return (
      <Text>
        <Trans>Estimated affordable</Trans>: {formatDate(estimate.date)}
      </Text>
    );
  }
  if (estimate.reason === 'currency-mismatch') {
    return (
      <Text style={{ color: theme.pageTextLight }}>
        <Trans>
          Use the same currency for this item and the forecast inputs.
        </Trans>
      </Text>
    );
  }
  if (estimate.reason === 'outside-horizon') {
    return (
      <Text style={{ color: theme.pageTextLight }}>
        <Trans>No date is estimated within the 20-year forecast window.</Trans>
      </Text>
    );
  }
  if (estimate.reason === 'blocked-by-higher-priority') {
    return (
      <Text style={{ color: theme.pageTextLight }}>
        <Trans>
          This item is lower priority. Estimate earlier items first to avoid
          assigning the same savings twice.
        </Trans>
      </Text>
    );
  }
  return (
    <Text style={{ color: theme.pageTextLight }}>
      <Trans>Complete the forecast inputs to see an estimated date.</Trans>
    </Text>
  );
}

export function WishlistPage() {
  const [, , scopeKey] = useWishlistLocalPref('wishlistItems');
  return <WishlistPageForScope key={scopeKey} />;
}

function WishlistPageForScope() {
  const { t } = useTranslation();
  const [savedItems, setItems] = useWishlistLocalPref('wishlistItems');
  const items = savedItems ?? [];
  const [scenario, setScenario] = useWishlistLocalPref('wishlistScenario');
  const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemError, setItemError] = useState('');
  const [isItemFormOpen, setItemFormOpen] = useState(items.length === 0);
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioDraft>(() =>
    getScenarioDraft(scenario),
  );
  const [income, setIncome] = useState<WishlistCashEvent[]>(
    scenario?.expectedIncome ?? [],
  );
  const [bills, setBills] = useState<WishlistCashEvent[]>(
    scenario?.committedBills ?? [],
  );
  const [incomeConfirmed, setIncomeConfirmed] = useState(
    scenario?.expectedIncomeConfirmed ?? false,
  );
  const [billsConfirmed, setBillsConfirmed] = useState(
    scenario?.committedBillsConfirmed ?? false,
  );
  const [scenarioMessage, setScenarioMessage] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const estimates = estimateWishlistAffordabilityByPriority({
    items,
    scenario,
  });

  useEffect(() => {
    setScenarioDraft(getScenarioDraft(scenario));
    setIncome(scenario?.expectedIncome ?? []);
    setBills(scenario?.committedBills ?? []);
    setIncomeConfirmed(scenario?.expectedIncomeConfirmed ?? false);
    setBillsConfirmed(scenario?.committedBillsConfirmed ?? false);
  }, [scenario]);

  const saveItem = (event: FormEvent) => {
    event.preventDefault();
    const name = itemDraft.name.trim();
    const currencyCode = itemDraft.currencyCode.trim().toUpperCase();
    const priceMinor = parseMoney(itemDraft.price);
    if (
      !name ||
      !/^[A-Z]{3}$/.test(currencyCode) ||
      priceMinor === null ||
      priceMinor <= 0
    ) {
      setItemError(
        t('Enter an item name, a 3-letter currency, and a valid price.'),
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(itemDraft.priceCheckedDate)) {
      setItemError(t('Enter the date the price was checked.'));
      return;
    }
    const sourceUrl = itemDraft.sourceUrl.trim();
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('Invalid URL');
        }
      } catch {
        setItemError(t('Enter a valid http or https source URL.'));
        return;
      }
    }

    const current = items.find(item => item.id === editingId);
    const next: WishlistItem = {
      id: current?.id ?? makeId(),
      name,
      sourceUrl,
      priceMinor,
      currencyCode,
      priceCheckedDate: itemDraft.priceCheckedDate,
      createdAt: current?.createdAt ?? new Date().toISOString(),
    };
    setItems(
      current
        ? items.map(item => (item.id === current.id ? next : item))
        : [...items, next],
    );
    setItemDraft(emptyItemDraft());
    setEditingId(null);
    setItemError('');
    setItemFormOpen(false);
  };

  const editItem = (item: WishlistItem) => {
    setEditingId(item.id);
    setItemFormOpen(true);
    setItemDraft({
      name: item.name,
      sourceUrl: item.sourceUrl,
      price: moneyInput(item.priceMinor),
      currencyCode: item.currencyCode,
      priceCheckedDate: item.priceCheckedDate,
    });
    setItemError('');
  };

  const saveScenario = (event: FormEvent) => {
    event.preventDefault();
    const currencyCode = scenarioDraft.currencyCode.trim().toUpperCase();
    const spendableCashMinor = parseMoney(scenarioDraft.spendableCash);
    const safetyBufferMinor = parseMoney(scenarioDraft.safetyBuffer);
    const monthlyContributionMinor = parseMoney(
      scenarioDraft.monthlyContribution,
    );
    if (
      !/^[A-Z]{3}$/.test(currencyCode) ||
      spendableCashMinor === null ||
      safetyBufferMinor === null ||
      monthlyContributionMinor === null ||
      (monthlyContributionMinor > 0 &&
        !/^\d{4}-\d{2}-\d{2}$/.test(scenarioDraft.contributionStartDate))
    ) {
      setScenarioMessage(
        t(
          'Enter currency, spendable cash, safety buffer, and monthly contribution.',
        ),
      );
      return;
    }

    const next: WishlistScenario = {
      currencyCode,
      spendableCashMinor,
      safetyBufferMinor,
      expectedIncome: income,
      expectedIncomeConfirmed: incomeConfirmed,
      committedBills: bills,
      committedBillsConfirmed: billsConfirmed,
      monthlyContributionMinor,
      monthlyContributionStartDate:
        monthlyContributionMinor > 0 ? scenarioDraft.contributionStartDate : '',
    };
    setScenario(next);
    setScenarioMessage(t('Forecast inputs saved on this device.'));
  };

  const addItem = () => {
    setEditingId(null);
    setItemFormOpen(true);
    setItemDraft(emptyItemDraft());
    setItemError('');
  };

  const exportItems = () => {
    const file = new Blob([serializeWishlistItems(items)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ledger-wishlist-${today()}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setTransferMessage(
      t('Wishlist items exported. Forecast inputs were not included.'),
    );
  };

  const importItems = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error(t('The wishlist file is larger than the 2 MB limit.'));
      }
      const imported = parseWishlistItems(await file.text());
      const appended = appendImportedWishlistItems(items, imported, makeId);
      setItems(appended);
      setTransferMessage(
        t(
          '{{count}} wishlist items imported and appended to the priority list.',
          {
            count: imported.length,
          },
        ),
      );
    } catch (error) {
      setTransferMessage(
        error instanceof Error
          ? error.message
          : t('The wishlist file could not be imported.'),
      );
    }
  };

  const movePriority = (itemId: string, direction: -1 | 1) => {
    const index = items.findIndex(item => item.id === itemId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const next = items.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setItems(next);
  };

  return (
    <Page header={t('Wishlist')}>
      <View
        style={{
          gap: 18,
          paddingBottom: 30,
          maxWidth: 950,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <View
          style={{
            padding: 14,
            borderRadius: 8,
            backgroundColor: theme.pillBackground,
            gap: 5,
          }}
        >
          <Text style={{ fontWeight: 600 }}>
            <Trans>Local-only wishlist and estimates</Trans>
          </Text>
          <Text>
            <Trans>
              Wishlist entries stay on this device and are scoped to this budget
              and profile. Forecast inputs are never synced or included in item
              exports. Retailer prices are entered and refreshed manually.
              Estimates use only the amounts and dates you enter; no bank
              account or retailer data is fetched.
            </Trans>
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: 600 }}>
            <Trans>Affordability inputs</Trans>
          </Text>
          <Text style={{ color: theme.pageTextLight }}>
            <Trans>
              Enter cash available for spending today. Exclude retirement and
              illiquid assets, count cash once across accounts, and do not count
              both sides of a transfer. Planned contributions are transferred
              from projected cash into wishlist savings, so they are not added
              again as income.
            </Trans>
          </Text>

          <form
            onSubmit={saveScenario}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 10,
              alignItems: 'end',
            }}
          >
            <label>
              <Text>
                <Trans>Currency code</Trans>
              </Text>
              <Input
                aria-label={t('Forecast currency code')}
                maxLength={3}
                value={scenarioDraft.currencyCode}
                onChange={event =>
                  setScenarioDraft({
                    ...scenarioDraft,
                    currencyCode: event.currentTarget.value,
                  })
                }
                placeholder="ZAR"
              />
            </label>
            <label>
              <Text>
                <Trans>Spendable cash</Trans>
              </Text>
              <Input
                aria-label={t('Spendable cash')}
                inputMode="decimal"
                value={scenarioDraft.spendableCash}
                onChange={event =>
                  setScenarioDraft({
                    ...scenarioDraft,
                    spendableCash: event.currentTarget.value,
                  })
                }
                placeholder="0.00"
              />
            </label>
            <label>
              <Text>
                <Trans>Safety buffer</Trans>
              </Text>
              <Input
                aria-label={t('Safety buffer')}
                inputMode="decimal"
                value={scenarioDraft.safetyBuffer}
                onChange={event =>
                  setScenarioDraft({
                    ...scenarioDraft,
                    safetyBuffer: event.currentTarget.value,
                  })
                }
                placeholder="0.00"
              />
            </label>
            <label>
              <Text>
                <Trans>Monthly wishlist contribution</Trans>
              </Text>
              <Input
                aria-label={t('Monthly wishlist contribution')}
                inputMode="decimal"
                value={scenarioDraft.monthlyContribution}
                onChange={event =>
                  setScenarioDraft({
                    ...scenarioDraft,
                    monthlyContribution: event.currentTarget.value,
                  })
                }
                placeholder="0.00"
              />
            </label>
            <label>
              <Text>
                <Trans>First contribution date</Trans>
              </Text>
              <Input
                aria-label={t('First contribution date')}
                type="date"
                value={scenarioDraft.contributionStartDate}
                onChange={event =>
                  setScenarioDraft({
                    ...scenarioDraft,
                    contributionStartDate: event.currentTarget.value,
                  })
                }
              />
            </label>
            <Button type="submit" variant="primary">
              <Trans>Save forecast inputs</Trans>
            </Button>
          </form>
          {scenarioMessage && <Text role="status">{scenarioMessage}</Text>}

          <EventEditor
            title={t('Expected income')}
            events={income}
            currencyCode={scenarioDraft.currencyCode || 'currency'}
            onAdd={event => {
              setIncome([...income, event]);
              setIncomeConfirmed(false);
            }}
            onRemove={id => {
              setIncome(income.filter(event => event.id !== id));
              setIncomeConfirmed(false);
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={incomeConfirmed}
              onChange={event =>
                setIncomeConfirmed(event.currentTarget.checked)
              }
            />{' '}
            <Trans>
              These expected income entries are complete; an empty list means no
              income is expected.
            </Trans>
          </label>
          {!incomeConfirmed && (
            <Text role="alert" style={{ color: theme.pageTextLight }}>
              <Trans>
                Expected income is unconfirmed. Estimates stay unavailable until
                you review this list and save the forecast.
              </Trans>
            </Text>
          )}
          <EventEditor
            title={t('Committed bills')}
            events={bills}
            currencyCode={scenarioDraft.currencyCode || 'currency'}
            onAdd={event => {
              setBills([...bills, event]);
              setBillsConfirmed(false);
            }}
            onRemove={id => {
              setBills(bills.filter(event => event.id !== id));
              setBillsConfirmed(false);
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={billsConfirmed}
              onChange={event => setBillsConfirmed(event.currentTarget.checked)}
            />{' '}
            <Trans>
              These committed bill entries are complete; an empty list means no
              bills are planned.
            </Trans>
          </label>
          {!billsConfirmed && (
            <Text role="alert" style={{ color: theme.pageTextLight }}>
              <Trans>
                Committed bills are unconfirmed. Estimates stay unavailable
                until you review this list and save the forecast.
              </Trans>
            </Text>
          )}
        </View>

        <View
          style={{
            borderTop: '1px solid ' + theme.tableBorder,
            paddingTop: 16,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: 600 }}>
              <Trans>Items</Trans>
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button onPress={addItem}>
                <Trans>Add item</Trans>
              </Button>
              <Button
                variant="bare"
                onPress={exportItems}
                isDisabled={items.length === 0}
              >
                <Trans>Export items</Trans>
              </Button>
              <Button variant="bare" onPress={() => fileInput.current?.click()}>
                <Trans>Import items</Trans>
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                onChange={importItems}
                aria-label={t('Import wishlist items file')}
                style={{ display: 'none' }}
              />
            </View>
          </View>
          {transferMessage && <Text role="status">{transferMessage}</Text>}

          {items.length === 0 && (
            <Text style={{ color: theme.pageTextLight }}>
              <Trans>Your wishlist is empty. Add an item to start.</Trans>
            </Text>
          )}

          {items.map((item, index) => (
            <View
              key={item.id}
              style={{
                gap: 8,
                border: '1px solid ' + theme.tableBorder,
                borderRadius: 8,
                padding: 14,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Text style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>
                  {item.name}
                </Text>
                <Text style={{ fontWeight: 600 }}>
                  {formatMoney(item.priceMinor, item.currencyCode)}
                </Text>
              </View>
              <Text>
                <Trans>Price last checked</Trans>:{' '}
                {formatDate(item.priceCheckedDate)}
              </Text>
              {isWishlistPriceStale(item.priceCheckedDate) ? (
                <Text role="status" style={{ color: theme.pageTextLight }}>
                  <Trans>
                    This price is more than 30 days old or has an invalid date.
                    Check it again before relying on the estimate.
                  </Trans>
                </Text>
              ) : (
                <Text role="status" style={{ color: theme.pageTextLight }}>
                  <Trans>Price checked within the last 30 days.</Trans>
                </Text>
              )}
              {item.sourceUrl && (
                <Link variant="external" to={item.sourceUrl}>
                  <Trans>Open price source</Trans>
                </Link>
              )}
              <EstimateText
                estimate={
                  estimates.get(item.id) ?? {
                    status: 'unknown',
                    reason: 'incomplete-inputs',
                  }
                }
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  variant="bare"
                  aria-label={t('Move {{name}} higher priority', {
                    name: item.name,
                  })}
                  isDisabled={index === 0}
                  onPress={() => movePriority(item.id, -1)}
                >
                  <Trans>Move up</Trans>
                </Button>
                <Button
                  variant="bare"
                  aria-label={t('Move {{name}} lower priority', {
                    name: item.name,
                  })}
                  isDisabled={index === items.length - 1}
                  onPress={() => movePriority(item.id, 1)}
                >
                  <Trans>Move down</Trans>
                </Button>
                <Button variant="bare" onPress={() => editItem(item)}>
                  <Trans>Edit</Trans>
                </Button>
                {removingId === item.id ? (
                  <>
                    <Button
                      variant="bare"
                      onPress={() => {
                        setItems(items.filter(entry => entry.id !== item.id));
                        setRemovingId(null);
                      }}
                    >
                      <Trans>Confirm remove</Trans>
                    </Button>
                    <Button variant="bare" onPress={() => setRemovingId(null)}>
                      <Trans>Cancel</Trans>
                    </Button>
                  </>
                ) : (
                  <Button variant="bare" onPress={() => setRemovingId(item.id)}>
                    <Trans>Remove</Trans>
                  </Button>
                )}
              </View>
            </View>
          ))}
        </View>

        {isItemFormOpen && (
          <form
            onSubmit={saveItem}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 10,
              alignItems: 'end',
              padding: 14,
              border: '1px solid ' + theme.tableBorder,
              borderRadius: 8,
            }}
          >
            <Text
              style={{ gridColumn: '1 / -1', fontSize: 18, fontWeight: 600 }}
            >
              {editingId ? <Trans>Edit item</Trans> : <Trans>New item</Trans>}
            </Text>
            <label>
              <Text>
                <Trans>Item name</Trans>
              </Text>
              <Input
                aria-label={t('Item name')}
                value={itemDraft.name}
                onChange={event =>
                  setItemDraft({
                    ...itemDraft,
                    name: event.currentTarget.value,
                  })
                }
                required
              />
            </label>
            <label>
              <Text>
                <Trans>Price</Trans>
              </Text>
              <Input
                aria-label={t('Item price')}
                inputMode="decimal"
                value={itemDraft.price}
                onChange={event =>
                  setItemDraft({
                    ...itemDraft,
                    price: event.currentTarget.value,
                  })
                }
                required
              />
            </label>
            <label>
              <Text>
                <Trans>Currency code</Trans>
              </Text>
              <Input
                aria-label={t('Item currency code')}
                maxLength={3}
                value={itemDraft.currencyCode}
                onChange={event =>
                  setItemDraft({
                    ...itemDraft,
                    currencyCode: event.currentTarget.value,
                  })
                }
                placeholder="ZAR"
                required
              />
            </label>
            <label>
              <Text>
                <Trans>Price checked date</Trans>
              </Text>
              <Input
                aria-label={t('Price checked date')}
                type="date"
                value={itemDraft.priceCheckedDate}
                onChange={event =>
                  setItemDraft({
                    ...itemDraft,
                    priceCheckedDate: event.currentTarget.value,
                  })
                }
                required
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <Text>
                <Trans>Price source URL (optional)</Trans>
              </Text>
              <Input
                aria-label={t('Price source URL')}
                type="url"
                value={itemDraft.sourceUrl}
                onChange={event =>
                  setItemDraft({
                    ...itemDraft,
                    sourceUrl: event.currentTarget.value,
                  })
                }
              />
            </label>
            {itemError && (
              <Text role="alert" style={{ gridColumn: '1 / -1' }}>
                {itemError}
              </Text>
            )}
            <View
              style={{
                gridColumn: '1 / -1',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Button type="submit" variant="primary">
                {editingId ? (
                  <Trans>Save changes</Trans>
                ) : (
                  <Trans>Save item</Trans>
                )}
              </Button>
              <Button
                type="button"
                variant="bare"
                onPress={() => {
                  setEditingId(null);
                  setItemFormOpen(false);
                  setItemDraft(emptyItemDraft());
                  setItemError('');
                }}
              >
                <Trans>Cancel</Trans>
              </Button>
            </View>
          </form>
        )}
      </View>
    </Page>
  );
}
