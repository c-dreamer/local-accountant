import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import * as api from '@actual-app/api';
import { Command } from 'commander';

import { registerBackupCommand } from './backup';

vi.mock('@actual-app/api', () => ({
  exportBudget: vi.fn().mockResolvedValue(new Uint8Array([80, 75, 3, 4])),
}));

vi.mock('#connection', () => ({
  withConnection: vi.fn(async (_opts, callback) => callback()),
}));

function program() {
  const instance = new Command();
  instance.exitOverride();
  instance.option('--format <format>', 'Output format', 'json');
  instance.option('--verbose');
  registerBackupCommand(instance);
  return instance;
}

describe('actual backup', () => {
  let dataDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dataDir = mkdtempSync(join(tmpdir(), 'actual-cli-backup-'));
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('exports the current budget to the requested path', async () => {
    const output = join(dataDir, 'budget.zip');
    await program().parseAsync(['node', 'actual', 'backup', output]);

    expect(api.exportBudget).toHaveBeenCalledOnce();
    expect(readFileSync(output)).toEqual(Buffer.from([80, 75, 3, 4]));
    expect(
      stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join(''),
    ).toContain(resolve(output));
  });

  it('does not overwrite an existing file without --overwrite', async () => {
    const output = join(dataDir, 'budget.zip');
    writeFileSync(output, 'keep this file');

    await expect(
      program().parseAsync(['node', 'actual', 'backup', output]),
    ).rejects.toThrow();

    expect(readFileSync(output, 'utf8')).toBe('keep this file');
  });

  it('overwrites the destination only when explicitly requested', async () => {
    const output = join(dataDir, 'budget.zip');
    writeFileSync(output, 'old backup');

    await program().parseAsync([
      'node',
      'actual',
      'backup',
      output,
      '--overwrite',
    ]);

    expect(existsSync(output)).toBe(true);
    expect(readFileSync(output)).toEqual(Buffer.from([80, 75, 3, 4]));
  });
});
