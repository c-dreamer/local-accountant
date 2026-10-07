import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('package-electron translation options', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('forwards --skip-translations to the nested browser packager', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'package-electron-test-'));
    const fakeBin = path.join(tempDir, 'bin');
    const callLog = path.join(tempDir, 'calls.log');
    const yarnShim = path.join(fakeBin, 'yarn');
    const lageShim = path.join(fakeBin, 'lage');
    const gitShim = path.join(fakeBin, 'git');

    mkdirSync(fakeBin);
    writeFileSync(
      yarnShim,
      `#!/bin/bash
printf 'yarn' >> "$TEST_LOG"
printf ' <%s>' "$@" >> "$TEST_LOG"
printf '\n' >> "$TEST_LOG"
if [[ "$1" == "build:browser" ]]; then
  shift
  exec /bin/bash "$TEST_REPO_ROOT/bin/package-browser" "$@"
fi
`,
    );
    writeFileSync(
      lageShim,
      `#!/bin/bash
printf 'lage' >> "$TEST_LOG"
printf ' <%s>' "$@" >> "$TEST_LOG"
printf '\n' >> "$TEST_LOG"
`,
    );
    writeFileSync(
      gitShim,
      `#!/bin/bash
printf 'git called' >> "$TEST_LOG"
printf ' <%s>' "$@" >> "$TEST_LOG"
printf '\n' >> "$TEST_LOG"
exit 91
`,
    );
    for (const shim of [yarnShim, lageShim, gitShim]) {
      chmodSync(shim, 0o755);
    }

    const result = spawnSync(
      '/bin/bash',
      [
        path.join(repoRoot, 'bin/package-electron'),
        '--skip-translations',
        '--skip-exe-build',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? '/bin:/usr/bin'}`,
          TEST_LOG: callLog,
          TEST_REPO_ROOT: repoRoot,
        },
      },
    );

    const calls = readFileSync(callLog, 'utf8');
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain('yarn <build:browser> <--skip-translations>');
    expect(calls).toContain('lage <build:browser> <--to=@actual-app/web>');
    expect(calls).not.toContain('git called');
  });
});
