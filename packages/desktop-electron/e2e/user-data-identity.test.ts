import path from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';

test('renamed product keeps the existing user-data directory identity', async ({
  electronApp,
  electronPage,
}) => {
  await electronPage.waitForLoadState('domcontentloaded');

  const identity = await electronApp.evaluate(
    ({ app, BrowserWindow, Menu }) => ({
      appData: app.getPath('appData'),
      appName: app.getName(),
      appMenuName: Menu.getApplicationMenu()?.items[0]?.label,
      windowTitle: BrowserWindow.getAllWindows()[0]?.getTitle(),
      userData: app.getPath('userData'),
    }),
  );

  expect(identity.appName).toBe('LAccountant');
  expect(identity.windowTitle).toBe('LAccountant');
  if (process.platform === 'darwin') {
    expect(identity.appMenuName).toBe('LAccountant');
  }
  expect(identity.userData).toBe(path.join(identity.appData, 'Actual'));
  expect(identity.appData).toContain(path.join('e2e', 'data'));
});
