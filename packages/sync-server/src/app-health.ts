import { constants } from 'node:fs';
import fs from 'node:fs/promises';

import type { Express, Request, Response } from 'express';

import { getAccountDb } from './account-db';
import { config } from './load-config';

type HealthCheckStatus = { status: 'UP' | 'DOWN' };

type HealthCheckResult = {
  status: 'UP' | 'DOWN';
  checks: Record<string, HealthCheckStatus>;
};

async function checkDatabase(): Promise<HealthCheckStatus> {
  try {
    const db = getAccountDb();
    // Simple query to verify database connectivity
    db.all('SELECT 1');
    return { status: 'UP' };
  } catch {
    return { status: 'DOWN' };
  }
}

async function checkServerFilesDir(): Promise<HealthCheckStatus> {
  try {
    const serverFilesDir = config.get('serverFiles');
    await fs.access(serverFilesDir, constants.R_OK | constants.W_OK);
    return { status: 'UP' };
  } catch {
    return { status: 'DOWN' };
  }
}

async function checkUserFilesDir(): Promise<HealthCheckStatus> {
  try {
    const userFilesDir = config.get('userFiles');
    await fs.access(userFilesDir, constants.R_OK | constants.W_OK);
    return { status: 'UP' };
  } catch {
    return { status: 'DOWN' };
  }
}

async function checkWebRoot(): Promise<HealthCheckStatus> {
  try {
    const webRoot = config.get('webRoot');
    await fs.access(webRoot, constants.R_OK);
    return { status: 'UP' };
  } catch {
    return { status: 'DOWN' };
  }
}

async function performHealthChecks(): Promise<HealthCheckResult> {
  const checkFunctions: Record<string, () => Promise<HealthCheckStatus>> = {
    database: checkDatabase,
    serverFiles: checkServerFilesDir,
    userFiles: checkUserFilesDir,
  };
  // Development serves the frontend through Vite, not the production web root.
  if (process.env.NODE_ENV !== 'development') {
    checkFunctions.webRoot = checkWebRoot;
  }

  const checkEntries = await Promise.all(
    Object.entries(checkFunctions).map(async ([name, check]) => {
      try {
        return [name, await check()] as const;
      } catch {
        return [name, { status: 'DOWN' }] as const;
      }
    }),
  );
  const checksResult: Record<string, HealthCheckStatus> =
    Object.fromEntries(checkEntries);

  const allUp = Object.values(checksResult).every(
    check => check.status === 'UP',
  );

  return {
    status: allUp ? 'UP' : 'DOWN',
    checks: checksResult,
  };
}

export async function healthHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await performHealthChecks();
  const statusCode = result.status === 'UP' ? 200 : 503;
  res.status(statusCode).json(result);
}

export async function healthLiveHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  // Liveness probe - just confirms the process is running
  res.status(200).json({ status: 'UP', check: 'liveness' });
}

export async function healthReadyHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  // Readiness probe - checks if the service is ready to serve traffic
  const result = await performHealthChecks();
  const statusCode = result.status === 'UP' ? 200 : 503;
  res.status(statusCode).json(result);
}

export function registerHealthEndpoints(app: Express): void {
  app.get('/health', healthHandler);
  app.get('/health/live', healthLiveHandler);
  app.get('/health/ready', healthReadyHandler);
}
