import type { NextFunction, Request, Response } from 'express';

/**
 * Express 4 async boundary (F22, API-03 standard).
 *
 * Route handlers never call next(err), so awaits placed before try/catch
 * become unhandled rejections that bypass the terminal JSON handler. Wrap
 * ALL async route handlers with this helper; it forwards rejections to
 * Express so app.ts terminal middleware returns JSON 500. Dashboard pilot
 * is done; grn/delivery/rent/inventory wrapped incrementally (non-breaking).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
