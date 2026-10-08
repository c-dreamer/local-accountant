import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { _electron, test as base } from '@playwright/test';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  electronPage: Page;
};

type ElectronOptions = {
  /**
   * When true, the app is launched with its budget data folder pointing
   * inside a regular file, so creating the folder fails at startup. Used to
   * exercise the startup error screen.
   */
  blockDocumentDir: boolean;
};

// Create the extended test with fixtures
export const test = base.extend<ElectronFixtures & ElectronOptions>({
  blockDocumentDir: [false, { option: true }],

  electronApp: async ({ blockDocumentDir }, use, testInfo: TestInfo) => {
    const uniqueTestId = testInfo.testId.replace(/[^\w-]/g, '-');
    const testDataDir = path.join('e2e/data/', uniqueTestId);

    await rm(testDataDir, { recursive: true, force: true }); // ensure any leftover test data is removed
    await mkdir(testDataDir, { recursive: true });

    let documentDir = testDataDir;
    if (blockDocumentDir) {
      // A regular file can't contain a folder, so `mkdir <file>/Actual` fails
      // deterministically on every platform.
      documentDir = path.join(testDataDir, 'blocked');
      await writeFile(documentDir, 'not a directory');
    }

    const appImagePath = process.env.LEDGER_E2E_APPIMAGE;
    let executablePath: string | undefined;
    let appImageLogPath: string | undefined;
    let args: string[];
    if (appImagePath) {
      executablePath = path.resolve(testDataDir, 'launch-appimage.sh');
      appImageLogPath = path.resolve(testDataDir, 'appimage-output.log');
      await writeFile(
        executablePath,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'exec > >(tee -a "$LEDGER_E2E_APPIMAGE_LOG")',
          'exec 2> >(tee -a "$LEDGER_E2E_APPIMAGE_LOG" >&2)',
          'args=()',
          'for arg in "$@"; do',
          '  if [[ "$arg" != "--no-sandbox" ]]; then args+=("$arg"); fi',
          'done',
          'exec "$LEDGER_E2E_APPIMAGE" --appimage-extract-and-run "${' +
            'args[@]}"',
          '',
        ].join('\n'),
        { mode: 0o700 },
      );
      args = [
        '--disable-gpu',
        `--user-data-dir=${path.resolve(testDataDir, 'electron-user-data')}`,
      ];
    } else {
      args = [
        '.',
        `--user-data-dir=${path.resolve(testDataDir, 'electron-user-data')}`,
      ];
    }

    const app = await _electron.launch({
      ...(executablePath ? { executablePath } : {}),
      ...(appImagePath ? { chromiumSandbox: true } : {}),
      args,
      env: {
        ...process.env,
        ...(appImageLogPath
          ? { LEDGER_E2E_APPIMAGE_LOG: appImageLogPath }
          : {}),
        ACTUAL_ELECTRON_APP_DATA_DIR: path.resolve(
          testDataDir,
          'electron-app-data',
        ),
        ACTUAL_DOCUMENT_DIR: documentDir,
        ACTUAL_DATA_DIR: testDataDir,
        EXECUTION_CONTEXT: 'playwright',
        NODE_ENV: 'development',
      },
    });

    await use(app);

    // Cleanup after tests
    await app.close();
    await rm(testDataDir, { recursive: true, force: true });
  },

  electronPage: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await use(page);
  },
});
