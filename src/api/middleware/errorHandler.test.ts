import { describe, it, expect, vi } from 'vitest';
import { AppError, errorHandler, asyncHandler } from './errorHandler';
import { ZodError, ZodIssue } from 'zod';

function mockReqRes() {
  const req: any = { path: '/test', method: 'GET', traceId: undefined };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    getHeader: vi.fn().mockReturnValue(undefined),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('AppError', () => {
  it('has correct properties', () => {
    const err = new AppError('NOT_FOUND', 'Secret not found', 404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Secret not found');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults to 400 status', () => {
    const err = new AppError('BAD', 'bad');
    expect(err.statusCode).toBe(400);
  });
});

describe('errorHandler', () => {
  it('handles AppError', () => {
    const { req, res, next } = mockReqRes();
    const err = new AppError('FORBIDDEN', 'Nope', 403);
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN', message: 'Nope' }),
      })
    );
  });

  it('handles ZodError', () => {
    const { req, res, next } = mockReqRes();
    const issues: ZodIssue[] = [
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string',
      },
    ];
    const err = new ZodError(issues);
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      })
    );
  });

  it('handles unknown errors as 500', () => {
    const { req, res, next } = mockReqRes();
    errorHandler(new Error('kaboom'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('asyncHandler', () => {
  it('passes errors to next', async () => {
    const { req, res, next } = mockReqRes();
    const err = new Error('async fail');
    const handler = asyncHandler(async () => {
      throw err;
    });
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not call next on success', async () => {
    const { req, res, next } = mockReqRes();
    const handler = asyncHandler(async (_req, res) => {
      res.status(200).json({ ok: true });
    });
    await handler(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
