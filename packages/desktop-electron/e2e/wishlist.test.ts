// oxlint-disable-next-line eslint/no-restricted-imports -- fix me
import { ConfigurationPage } from '@actual-app/web/e2e/page-models/configuration-page';
import { expect } from '@playwright/test';

import { test } from './fixtures';

test('opens the first-run page and adds a synthetic wishlist item', async ({
  electronPage,
}) => {
  const configurationPage = new ConfigurationPage(electronPage);

  await expect(
    electronPage.getByRole('button', { name: "Don't use a server" }),
  ).toBeVisible();

  await configurationPage.clickOnNoServer();
  await configurationPage.createDemoFile();

  await electronPage.getByRole('button', { name: 'More' }).click();
  await electronPage.getByRole('link', { name: 'Wishlist' }).click();

  await expect(
    electronPage.getByRole('heading', { name: 'Wishlist' }),
  ).toBeVisible();
  await expect(
    electronPage.getByText('Your wishlist is empty. Add an item to start.'),
  ).toBeVisible();

  await electronPage.getByRole('button', { name: 'Add item' }).click();
  await electronPage.getByLabel('Item name').fill('Synthetic camera');
  await electronPage.getByLabel('Item price').fill('99.99');
  await electronPage.getByLabel('Item currency code').fill('USD');
  await electronPage
    .getByLabel('Price checked date')
    .fill(new Date().toISOString().slice(0, 10));
  await electronPage.getByRole('button', { name: 'Save item' }).click();

  await expect(
    electronPage.getByText('Synthetic camera', { exact: true }),
  ).toBeVisible();
});
