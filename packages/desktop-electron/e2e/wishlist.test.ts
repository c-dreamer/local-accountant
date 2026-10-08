// oxlint-disable-next-line eslint/no-restricted-imports -- fix me
import { ConfigurationPage } from '@actual-app/web/e2e/page-models/configuration-page';
import { expect } from '@playwright/test';

import { test } from './fixtures';

test('opens the first-run page and adds a synthetic wishlist item', async ({
  packagedPage,
}) => {
  const configurationPage = new ConfigurationPage(packagedPage);

  await expect(
    packagedPage.getByRole('button', { name: "Don't use a server" }),
  ).toBeVisible();

  await configurationPage.clickOnNoServer();
  await configurationPage.createDemoFile();

  await packagedPage.getByRole('button', { name: 'More' }).click();
  await packagedPage.getByRole('link', { name: 'Wishlist' }).click();

  await expect(
    packagedPage.getByText('Local-only wishlist and estimates', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    packagedPage.getByText('Your wishlist is empty. Add an item to start.'),
  ).toBeVisible();

  await packagedPage.getByRole('button', { name: 'Add item' }).click();
  await packagedPage.getByLabel('Item name').fill('Synthetic camera');
  await packagedPage.getByLabel('Item price').fill('99.99');
  await packagedPage.getByLabel('Item currency code').fill('USD');
  await packagedPage
    .getByLabel('Price checked date')
    .fill(new Date().toISOString().slice(0, 10));
  await packagedPage.getByRole('button', { name: 'Save item' }).click();

  await expect(
    packagedPage.getByText('Synthetic camera', { exact: true }),
  ).toBeVisible();
});
