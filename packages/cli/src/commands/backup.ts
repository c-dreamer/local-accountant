import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as api from '@actual-app/api';
import type { Command } from 'commander';

import { withConnection } from '#connection';
import { printOutput } from '#output';

type BackupCmdOpts = {
  overwrite?: boolean;
};

function defaultBackupPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `actual-budget-backup-${timestamp}.zip`;
}

export function registerBackupCommand(program: Command) {
  program
    .command('backup [output]')
    .description('Export the current budget to a ZIP backup file')
    .option('--overwrite', 'Replace the output file if it already exists')
    .action(async (output: string | undefined, cmdOpts: BackupCmdOpts) => {
      const opts = program.opts();
      const outputPath = resolve(output ?? defaultBackupPath());

      await withConnection(
        opts,
        async () => {
          const archive = await api.exportBudget();
          writeFileSync(outputPath, archive, {
            flag: cmdOpts.overwrite ? 'w' : 'wx',
          });
          printOutput(
            {
              success: true,
              path: outputPath,
              bytes: archive.byteLength,
            },
            opts.format,
          );
        },
        { mutates: false },
      );
    });
}
