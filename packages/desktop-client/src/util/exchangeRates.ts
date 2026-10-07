import { queryOptions } from '@tanstack/react-query';

// Frankfurter serves the European Central Bank's daily reference rates. It
// needs no API key and allows browser (CORS) requests.
const EXCHANGE_RATE_URL = 'https://api.frankfurter.dev/v1/latest';

/** Currencies the ECB publishes reference rates for. */
export const EXCHANGE_RATE_CURRENCIES = [
  'AUD',
  'BGN',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'ZAR',
];

export type ExchangeRate = {
  base: string;
  quote: string;
  /** Units of `quote` per one unit of `base`. */
  rate: number;
  /** ECB publication date of the rate, `YYYY-MM-DD`. */
  date: string;
  /** When this device last downloaded the rate, in ms since the epoch. */
  fetchedAt: number;
};

function cacheKey(base: string, quote: string) {
  return `exchange-rate:${base}:${quote}`;
}

// The last downloaded rate is kept per device so converted amounts still show
// offline. Storage can be unavailable (private windows), so failures are ignored.
function loadCachedRate(base: string, quote: string): ExchangeRate | undefined {
  try {
    const raw = window.localStorage.getItem(cacheKey(base, quote));
    return raw ? (JSON.parse(raw) as ExchangeRate) : undefined;
  } catch {
    return undefined;
  }
}

function saveCachedRate(rate: ExchangeRate) {
  try {
    window.localStorage.setItem(
      cacheKey(rate.base, rate.quote),
      JSON.stringify(rate),
    );
  } catch {
    // Not cached; the rate is downloaded again next session.
  }
}

export async function fetchExchangeRate(
  base: string,
  quote: string,
): Promise<ExchangeRate> {
  const params = new URLSearchParams({ base, symbols: quote });
  const response = await fetch(`${EXCHANGE_RATE_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`Exchange rate request failed (${response.status})`);
  }

  const data: unknown = await response.json();
  const rate =
    typeof data === 'object' && data !== null && 'rates' in data
      ? (data.rates as Record<string, unknown>)?.[quote]
      : undefined;
  const date =
    typeof data === 'object' && data !== null && 'date' in data
      ? data.date
      : undefined;

  if (
    typeof rate !== 'number' ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    typeof date !== 'string'
  ) {
    throw new Error('Unexpected exchange rate response');
  }

  return { base, quote, rate, date, fetchedAt: Date.now() };
}

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export const exchangeRateQueries = {
  all: () => ['exchange-rate'],
  rate: (base: string, quote: string) =>
    queryOptions<ExchangeRate>({
      queryKey: [...exchangeRateQueries.all(), base, quote],
      queryFn: async () => {
        const rate = await fetchExchangeRate(base, quote);
        saveCachedRate(rate);
        return rate;
      },
      // Start from the last downloaded rate; it is refetched once it is stale.
      initialData: () => loadCachedRate(base, quote),
      initialDataUpdatedAt: () => loadCachedRate(base, quote)?.fetchedAt,
      // The ECB publishes once per business day.
      staleTime: TWELVE_HOURS,
      gcTime: Infinity,
      // Being offline is normal for a local-first app; keep the cached rate.
      retry: 1,
    }),
};
