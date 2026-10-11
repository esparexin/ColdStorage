import type { NextFunction, Request, Response } from 'express';

/**
 * Express 4 async boundary (F22).
 *
 * Route handlers never call next(err), so awaits placed before try/catch
 * (e.g. resolveFacilityIdForGrn) become unhandled rejections that bypass the
 * terminal JSON handler. Wrap pilot routes with this helper; it forwards
 * rejections to Express so app.ts terminal middleware returns JSON 500.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
