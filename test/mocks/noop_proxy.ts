import { ILogger } from '../../src/types/types.js';

export const noopProxy = new Proxy(
  {},
  {
    get() {
      return () => {};
    },
  },
);

export const mockLogger: ILogger = noopProxy as ILogger;
