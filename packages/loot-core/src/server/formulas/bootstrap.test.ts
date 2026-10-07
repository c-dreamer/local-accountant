import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as asyncStorage from '#platform/server/asyncStorage';
import * as aql from '#server/aql';
import * as db from '#server/db';
import { handlers } from '#server/main';
import { runHandler } from '#server/mutators';
import { Action } from '#server/rules/action';

import {
  ensureFormulaPreferencesLoaded,
  resetFormulaPreferencesCache,
} from './bootstrap';
import { loadUserPreferencesForFormulas } from './customFunctionsPreferences';

function executeFormula(formula: string) {
  const action = new Action('set', 'notes', null, { formula });
  const transaction = { notes: '' };

  action.exec(transaction);

  return transaction.notes;
}

describe('formula preference bootstrap', () => {
  beforeEach(async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await (global as any).emptyDatabase()();
    vi.clearAllMocks();
    resetFormulaPreferencesCache();
  });

  it('reloads cached user preferences after reset', async () => {
    await ensureFormulaPreferencesLoaded();
    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1\u202F234,50');

    await db.update('preferences', {
      id: 'numberFormat',
      value: 'dot-comma',
    });

    resetFormulaPreferencesCache();
    await ensureFormulaPreferencesLoaded();

    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1.234,50');
  });

  it('uses South African number separators by default', async () => {
    const preferences = await loadUserPreferencesForFormulas({
      selectedLocale: 'de-DE',
    });

    expect(preferences.currency.code).toBe('ZAR');
    expect(preferences.numberFormat).toBe('space-comma');
    expect(preferences.decimalPlaces).toBe(2);
    expect(preferences.thousandsSeparator).toBe('\u202F');
    expect(preferences.decimalSeparator).toBe(',');
  });

  it('uses South African rand when the stored currency preference is empty', async () => {
    await db.update('preferences', {
      id: 'defaultCurrencyCode',
      value: '',
    });

    const preferences = await loadUserPreferencesForFormulas();

    expect(preferences.currency.code).toBe('ZAR');
    expect(preferences.numberFormat).toBe('space-comma');
  });

  it('loads hidden fraction preference for formula number formatting', async () => {
    await db.update('preferences', {
      id: 'hideFraction',
      value: 'true',
    });

    const preferences = await loadUserPreferencesForFormulas();

    expect(preferences.decimalPlaces).toBe(0);
  });

  it('loads formula preferences with one preferences query', async () => {
    const aqlQuerySpy = vi.spyOn(aql, 'aqlQuery');

    await loadUserPreferencesForFormulas();

    expect(aqlQuerySpy).toHaveBeenCalledTimes(1);
  });

  it('reloads cached user preferences after relevant synced preferences change', async () => {
    await ensureFormulaPreferencesLoaded();
    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1\u202F234,50');

    await runHandler(handlers['preferences/save'], {
      id: 'numberFormat',
      value: 'dot-comma',
    });
    await ensureFormulaPreferencesLoaded();

    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1.234,50');
  });

  it('reloads cached user preferences after hide fraction changes', async () => {
    await ensureFormulaPreferencesLoaded();
    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1\u202F234,50');

    await runHandler(handlers['preferences/save'], {
      id: 'hideFraction',
      value: 'true',
    });
    await ensureFormulaPreferencesLoaded();

    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1\u202F235');
  });

  it('keeps cached user preferences after unrelated synced preferences change', async () => {
    await ensureFormulaPreferencesLoaded();
    await db.update('preferences', {
      id: 'numberFormat',
      value: 'dot-comma',
    });

    await runHandler(handlers['preferences/save'], {
      id: 'dateFormat',
      value: 'dd/MM/yyyy',
    });
    await ensureFormulaPreferencesLoaded();

    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1\u202F234,50');
  });

  it('reloads cached user preferences after language changes', async () => {
    await ensureFormulaPreferencesLoaded();
    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1\u202F234,50');

    await runHandler(handlers['save-global-prefs'], {
      language: 'de-DE',
    });
    vi.mocked(asyncStorage.getItem).mockResolvedValue('de-DE');
    await ensureFormulaPreferencesLoaded();

    expect(vi.mocked(asyncStorage.setItem)).toHaveBeenCalledWith(
      'language',
      'de-DE',
    );
    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1\u202F234,50');
  });
});
