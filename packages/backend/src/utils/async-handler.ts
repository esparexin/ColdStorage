import { Router, type Request, type RequestHandler, type Response, type NextFunction } from 'express';

/**
 * Express 4 async boundary (F22, API-03 standard).
 *
 * Route handlers never call next(err), so awaits placed before try/catch
 * become unhandled rejections that bypass the terminal JSON handler. Wrap
 * ALL async route handlers with this helper; it forwards rejections to
 * Express so app.ts terminal middleware returns JSON 500.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/** HTTP verbs that accept an async handler needing the async boundary. */
const ASYNC_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'all'] as const;

/**
 * Creates a Router in which every async handler is automatically wrapped by
 * {@link asyncHandler}.
 *
 * Express 4 does not catch rejected promises from route handlers. Before this
 * factory, `asyncHandler` had to be applied by hand and was used by only two
 * of nineteen routers. Seven handlers awaited a DB call *before* entering
 * their try block:
 *
 *   grn.routes.ts:172, :200, :230
 *   delivery.routes.ts:39, :125, :153, :201
 *
 * A transient Mongo failure (Atlas replica stepdown, primary election, a
 * buffering timeout) on any of those produced an unhandled rejection, and
 * Node >= 15 defaults to `--unhandled-rejections=throw`, so the whole API
 * process exited. In three of the seven the un-guarded await *is* the
 * authorization call, so a DB blip simultaneously skipped the scope check.
 *
 * Wrapping at the router level closes the whole class at once and removes the
 * per-handler discipline that let it recur. Synchronous middleware (auth,
 * RBAC, facility scope) is passed through untouched, so ordering and
 * short-circuit behaviour are unchanged.
 */
export function asyncRouter(): Router {
  const router = Router();
  for (const verb of ASYNC_VERBS) {
    const original = router[verb].bind(router) as unknown as (
      path: string,
      ...handlers: Array<RequestHandler | RequestHandler[]>
    ) => unknown;
    (router as unknown as Record<string, unknown>)[verb] = (
      path: string,
      ...handlers: Array<RequestHandler | RequestHandler[]>
    ): unknown => {
      const wrapped = handlers.map((h) =>
        Array.isArray(h) ? h.map(wrapIfAsync) : wrapIfAsync(h),
      );
      return original(path, ...(wrapped as Array<RequestHandler | RequestHandler[]>));
    };
  }
  return router;
}

/**
 * Wraps a handler only if it is genuinely async, so synchronous middleware
 * (which can legitimately call next() and return void) is left alone.
 */
function wrapIfAsync(handler: RequestHandler): RequestHandler {
  if (handler.length >= 4) return handler; // error-handling middleware
  // `async` functions are detected structurally: a handler declared `async`
  // has a constructor named 'AsyncFunction'.
  const isAsync =
    handler.constructor?.name === 'AsyncFunction' ||
    handler.constructor?.name === 'AsyncGeneratorFunction';
  return isAsync ? asyncHandler(handler as never) : handler;
}