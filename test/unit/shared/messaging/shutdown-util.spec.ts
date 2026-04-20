import { shutdownIfPossible } from '@shared/messaging/shutdown.util';

describe('shutdownIfPossible', () => {
  it('null is a no-op', async () => {
    await expect(shutdownIfPossible(null)).resolves.toBeUndefined();
  });

  it('undefined is a no-op', async () => {
    await expect(shutdownIfPossible(undefined)).resolves.toBeUndefined();
  });

  it('object without shutdown property is a no-op', async () => {
    await expect(shutdownIfPossible({})).resolves.toBeUndefined();
  });

  it('object with non-function shutdown is a no-op', async () => {
    await expect(shutdownIfPossible({ shutdown: 'not-a-function' })).resolves.toBeUndefined();
  });

  it('calls shutdown() when present and resolves', async () => {
    let called = false;
    const bus = {
      shutdown: async () => {
        called = true;
      },
    };
    await shutdownIfPossible(bus);
    expect(called).toBe(true);
  });

  it('propagates error thrown by shutdown()', async () => {
    const err = new Error('bus exploded');
    const bus = {
      shutdown: async () => {
        throw err;
      },
    };
    await expect(shutdownIfPossible(bus)).rejects.toThrow('bus exploded');
  });
});
