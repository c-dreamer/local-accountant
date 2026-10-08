import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { _electron, test as base, chromium } from '@playwright/test';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  electronPage: Page;
  packagedPage: Page;
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

    const app = await _electron.launch({
      args: [
        '.',
        `--user-data-dir=${path.resolve(testDataDir, 'electron-user-data')}`,
      ],
      env: {
        ...process.env,
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

  packagedPage: async ({ blockDocumentDir }, use, testInfo: TestInfo) => {
    const appImagePath = process.env.LEDGER_E2E_APPIMAGE;
    if (!appImagePath) {
      throw new Error('LEDGER_E2E_APPIMAGE is required for packaged UI tests');
    }

    const uniqueTestId = testInfo.testId.replace(/[^\w-]/g, '-');
    const testDataDir = path.join('e2e/data/', uniqueTestId);
    await rm(testDataDir, { recursive: true, force: true });
    await mkdir(testDataDir, { recursive: true });

    let documentDir = testDataDir;
    if (blockDocumentDir) {
      documentDir = path.join(testDataDir, 'blocked');
      await writeFile(documentDir, 'not a directory');
    }

    const appImageLogPath = path.resolve(testDataDir, 'appimage-output.log');
    const logStream = createWriteStream(appImageLogPath, { flags: 'w' });
    const app = spawn(
      appImagePath,
      [
        '--appimage-extract-and-run',
        '--disable-gpu',
        '--remote-debugging-port=0',
        `--user-data-dir=${path.resolve(testDataDir, 'electron-user-data')}`,
      ],
      {
        env: {
          ...process.env,
          ACTUAL_ELECTRON_APP_DATA_DIR: path.resolve(
            testDataDir,
            'electron-app-data',
          ),
          ACTUAL_DOCUMENT_DIR: documentDir,
          ACTUAL_DATA_DIR: testDataDir,
          EXECUTION_CONTEXT: 'playwright',
          NODE_ENV: 'development',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    app.stdout.pipe(logStream, { end: false });
    app.stderr.pipe(logStream, { end: false });

    let browser:
      | Awaited<ReturnType<typeof chromium.connectOverCDP>>
      | undefined;
    let testPassed = false;
    let stderrTail = '';
    try {
      const endpoint = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting for AppImage DevTools. See ${appImageLogPath}`,
            ),
          );
        }, 45_000);

        app.stderr.on('data', (chunk: Buffer) => {
          stderrTail = (stderrTail + chunk.toString()).slice(-8192);
          const match = stderrTail.match(
            /DevTools listening on (ws:\/\/[^\s]+)/,
          );
          if (match) {
            clearTimeout(timeout);
            resolve(match[1]);
          }
        });
        app.once('error', error => {
          clearTimeout(timeout);
          reject(error);
        });
        app.once('exit', (code, signal) => {
          clearTimeout(timeout);
          reject(
            new Error(
              `AppImage exited before DevTools was ready (code=${code}, signal=${signal}). See ${appImageLogPath}`,
            ),
          );
        });
      });

      browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
      const context = browser.contexts()[0];
      if (!context) {
        throw new Error('AppImage DevTools did not expose a browser context');
      }
      const page =
        context.pages()[0] ??
        (await context.waitForEvent('page', { timeout: 30_000 }));
      await use(page);
      testPassed = true;
    } finally {
      await browser?.close().catch(() => undefined);
      if (app.exitCode === null && app.signalCode === null) {
        const exited = new Promise<void>(resolve => {
          app.once('exit', () => resolve());
          app.kill('SIGTERM');
        });
        await Promise.race([
          exited,
          new Promise(resolve => setTimeout(resolve, 5_000)),
        ]);
        if (app.exitCode === null && app.signalCode === null) {
          app.kill('SIGKILL');
        }
      }
      logStream.end();
      if (testPassed) {
        await rm(testDataDir, { recursive: true, force: true });
      }
    }
  },
});
