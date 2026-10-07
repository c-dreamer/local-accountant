import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchExchangeRate } from './exchangeRates';

function mockFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    json: async () => response.body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchExchangeRate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests one quote currency and returns its rate and date', async () => {
    const fetchMock = mockFetch({
      ok: true,
      body: {
        amount: 1,
        base: 'ZAR',
        date: '2026-10-07',
        rates: { USD: 0.05992 },
      },
    });

    const rate = await fetchExchangeRate('ZAR', 'USD');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v1/latest?base=ZAR&symbols=USD',
    );
    expect(rate).toMatchObject({
      base: 'ZAR',
      quote: 'USD',
      rate: 0.05992,
      date: '2026-10-07',
    });
  });

  it('rejects when the service responds with an error status', async () => {
    mockFetch({ ok: false, status: 404 });

    await expect(fetchExchangeRate('ZAR', 'XXX')).rejects.toThrow(
      'Exchange rate request failed (404)',
    );
  });

  it('rejects a response without a usable rate', async () => {
    mockFetch({ ok: true, body: { date: '2026-10-07', rates: {} } });

    await expect(fetchExchangeRate('ZAR', 'USD')).rejects.toThrow(
      'Unexpected exchange rate response',
    );
  });
});
