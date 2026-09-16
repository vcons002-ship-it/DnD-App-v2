/** Catch synchronous throws AND rejected async work at the socket boundary. */
export function invokeSafely(
  run: () => unknown,
  report: (error: unknown) => void,
): void {
  try {
    const result = run();
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(result).catch(report);
    }
  } catch (error) {
    report(error);
  }
}
