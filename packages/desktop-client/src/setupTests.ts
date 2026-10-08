import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';

import type * as Currencies from '@actual-app/core/shared/currencies';

import { resetTestProviders } from './mocks';

global.IS_TESTING = true;
global.Actual = {} as typeof global.Actual;

// jsdom doesn't implement ResizeObserver. Components that only use it to
// react to layout changes (rather than asserting on it) can run against a
// no-op stub.
global.ResizeObserver = class {
  observe() {
    // no-op
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
};

type Size = { height: number; width: number };

type AutoSizerProps = {
  renderProp?: (size: Size) => ReactNode;
  children?: (size: Size) => ReactNode;
};

vi.mock('react-virtualized-auto-sizer', () => {
  const AutoSizer = (props: AutoSizerProps) => {
    const render = props.renderProp ?? props.children;
    return render ? render({ height: 1000, width: 600 }) : null;
  };

  return {
    AutoSizer,
    default: AutoSizer,
  };
});

// This fork defaults to ZAR formatting (`1 234,56`). Run the client tests on
// upstream's "no currency" default so its tests keep passing on every sync;
// the ZAR default is covered by loot-core's currency and formula tests.
vi.mock('@actual-app/core/shared/currencies', async importOriginal => ({
  ...(await importOriginal<typeof Currencies>()),
  DEFAULT_CURRENCY_CODE: '',
}));

global.Date.now = () => 123456789;

global.__resetWorld = () => {
  resetTestProviders();
};

process.on('unhandledRejection', (reason: unknown) => {
  console.error('REJECTION', reason);
});

afterEach(() => {
  global.__resetWorld();
});
