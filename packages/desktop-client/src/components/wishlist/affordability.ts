import type {
  WishlistItem,
  WishlistScenario,
} from '@actual-app/core/types/prefs';

export type AffordabilityEstimate =
  | { status: 'date'; date: string; plannedSavingsMinor: number }
  | {
      status: 'unknown';
      reason:
        | 'incomplete-inputs'
        | 'currency-mismatch'
        | 'outside-horizon'
        | 'blocked-by-higher-priority';
    };

const FORECAST_DAYS = 20 * 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMonth(date: Date, anchorDay: number) {
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(anchorDay, lastDay));
  return next;
}

function validEvents(events: WishlistScenario['expectedIncome']) {
  return (
    Array.isArray(events) &&
    events.every(
      event =>
        event !== null &&
        typeof event.id === 'string' &&
        typeof event.date === 'string' &&
        parseDate(event.date) !== null &&
        Number.isSafeInteger(event.amountMinor) &&
        event.amountMinor >= 0 &&
        (event.description === undefined ||
          typeof event.description === 'string'),
    )
  );
}

type ValidWishlistScenario = WishlistScenario & {
  spendableCashMinor: number;
  safetyBufferMinor: number;
  monthlyContributionMinor: number;
  expectedIncomeConfirmed: true;
  committedBillsConfirmed: true;
};

function validScenario(
  scenario: WishlistScenario | undefined,
): scenario is ValidWishlistScenario {
  return Boolean(
    scenario &&
    /^[A-Z]{3}$/.test(scenario.currencyCode) &&
    scenario.spendableCashMinor !== null &&
    scenario.safetyBufferMinor !== null &&
    scenario.monthlyContributionMinor !== null &&
    Number.isSafeInteger(scenario.spendableCashMinor) &&
    Number.isSafeInteger(scenario.safetyBufferMinor) &&
    Number.isSafeInteger(scenario.monthlyContributionMinor) &&
    scenario.spendableCashMinor >= 0 &&
    scenario.safetyBufferMinor >= 0 &&
    scenario.monthlyContributionMinor >= 0 &&
    scenario.expectedIncomeConfirmed === true &&
    scenario.committedBillsConfirmed === true &&
    validEvents(scenario.expectedIncome) &&
    validEvents(scenario.committedBills) &&
    (scenario.monthlyContributionMinor === 0 ||
      parseDate(scenario.monthlyContributionStartDate) !== null),
  );
}

/**
 * Estimate wishlist purchases in the user's explicit priority order. Current
 * spendable cash above the buffer enters one shared reserve. Each purchase
 * consumes that reserve before the next item is considered, so two items never
 * claim the same cash or contribution. On a shared date, committed bills are
 * processed before income, contributions, and purchases for a conservative
 * estimate.
 */
export function estimateWishlistAffordabilityByPriority({
  items,
  scenario,
  today = dateKey(new Date()),
}: {
  items: WishlistItem[];
  scenario: WishlistScenario | undefined;
  today?: string;
}): Map<string, AffordabilityEstimate> {
  const estimates = new Map<string, AffordabilityEstimate>();
  if (items.length === 0) return estimates;

  const todayDate = parseDate(today);
  if (!todayDate || !validScenario(scenario)) {
    return new Map(
      items.map(item => [
        item.id,
        { status: 'unknown', reason: 'incomplete-inputs' },
      ]),
    );
  }

  const validItems = items.map((item, index) => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !/^[A-Z]{3}$/.test(item.currencyCode) ||
      !Number.isSafeInteger(item.priceMinor) ||
      item.priceMinor <= 0
    ) {
      return { status: 'invalid' as const, index };
    }
    if (item.currencyCode !== scenario.currencyCode) {
      return { status: 'currency-mismatch' as const, index };
    }
    return { status: 'valid' as const, index, item };
  });

  const invalidIndex = validItems.findIndex(item => item.status !== 'valid');
  if (invalidIndex >= 0) {
    const reason =
      validItems[invalidIndex].status === 'currency-mismatch'
        ? 'currency-mismatch'
        : 'incomplete-inputs';
    for (let index = invalidIndex; index < items.length; index++) {
      estimates.set(items[index].id, {
        status: 'unknown',
        reason: index === invalidIndex ? reason : 'blocked-by-higher-priority',
      });
    }
    validItems.length = invalidIndex;
  }

  const cashEvents = new Map<string, { income: number; bills: number }>();
  const addEvent = (date: string, key: 'income' | 'bills', amount: number) => {
    const event = cashEvents.get(date) ?? { income: 0, bills: 0 };
    event[key] += amount;
    cashEvents.set(date, event);
  };

  for (const event of scenario.expectedIncome) {
    if (event.date >= today) addEvent(event.date, 'income', event.amountMinor);
  }
  for (const event of scenario.committedBills) {
    if (event.date >= today) addEvent(event.date, 'bills', event.amountMinor);
  }

  if (
    [...cashEvents.values()].some(
      event =>
        !Number.isSafeInteger(event.income) ||
        !Number.isSafeInteger(event.bills),
    )
  ) {
    for (const item of items) {
      estimates.set(item.id, {
        status: 'unknown',
        reason: 'incomplete-inputs',
      });
    }
    return estimates;
  }

  let savings = Math.max(
    0,
    scenario.spendableCashMinor - scenario.safetyBufferMinor,
  );
  let cash = scenario.spendableCashMinor - savings;
  let nextIndex = 0;
  const contributionStart =
    scenario.monthlyContributionMinor > 0
      ? parseDate(scenario.monthlyContributionStartDate)
      : null;
  const contributionAnchorDay = contributionStart?.getUTCDate() ?? 1;
  let nextContribution = contributionStart;

  for (let offset = 0; offset < FORECAST_DAYS; offset++) {
    const date = new Date(todayDate);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = dateKey(date);
    const event = cashEvents.get(key);

    if (event) {
      cash += event.income - event.bills;
      if (cash < scenario.safetyBufferMinor) {
        const bufferTopUp = Math.min(
          savings,
          scenario.safetyBufferMinor - cash,
        );
        savings -= bufferTopUp;
        cash += bufferTopUp;
      }
    }

    while (nextContribution && dateKey(nextContribution) < key) {
      nextContribution = addMonth(nextContribution, contributionAnchorDay);
    }
    if (nextContribution && dateKey(nextContribution) === key) {
      const contribution = Math.min(
        scenario.monthlyContributionMinor,
        Math.max(0, cash - scenario.safetyBufferMinor),
      );
      cash -= contribution;
      savings += contribution;
      nextContribution = addMonth(nextContribution, contributionAnchorDay);
    }

    while (nextIndex < validItems.length) {
      const entry = validItems[nextIndex];
      if (entry.status !== 'valid' || savings < entry.item.priceMinor) break;
      estimates.set(entry.item.id, {
        status: 'date',
        date: key,
        plannedSavingsMinor: savings,
      });
      savings -= entry.item.priceMinor;
      nextIndex++;
    }

    if (nextIndex === validItems.length) return estimates;
  }

  if (nextIndex < validItems.length) {
    for (let index = nextIndex; index < validItems.length; index++) {
      const entry = validItems[index];
      if (entry.status === 'valid') {
        estimates.set(entry.item.id, {
          status: 'unknown',
          reason:
            index === nextIndex
              ? 'outside-horizon'
              : 'blocked-by-higher-priority',
        });
      }
    }
  }
  return estimates;
}

export function estimateWishlistAffordability({
  item,
  scenario,
  today,
}: {
  item: WishlistItem;
  scenario: WishlistScenario | undefined;
  today?: string;
}): AffordabilityEstimate {
  return (
    estimateWishlistAffordabilityByPriority({
      items: [item],
      scenario,
      today,
    }).get(item.id) ?? { status: 'unknown', reason: 'incomplete-inputs' }
  );
}

export function isWishlistPriceStale(
  priceCheckedDate: string,
  today = dateKey(new Date()),
  maxAgeDays = 30,
) {
  const checked = parseDate(priceCheckedDate);
  const current = parseDate(today);
  if (!checked || !current || checked > current) return true;
  return (current.getTime() - checked.getTime()) / DAY_MS > maxAgeDays;
}
