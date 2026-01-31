import { describe, it, expect, vi } from 'vitest';
import { sendSuccess, sendError, errors } from './response';

function mockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

describe('sendSuccess', () => {
  it('sends 200 with data by default', () => {
    const res = mockRes();
    sendSuccess(res, { foo: 'bar' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { foo: 'bar' } });
  });

  it('sends custom status code', () => {
    const res = mockRes();
    sendSuccess(res, null, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('includes pagination when provided', () => {
    const res = mockRes();
    const pagination = { page: 1, limit: 10, total: 50, totalPages: 5 };
    sendSuccess(res, [], 200, pagination);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
      pagination,
    });
  });
});

describe('sendError', () => {
  it('sends error response with correct shape', () => {
    const res = mockRes();
    sendError(res, 'TEST_ERR', 'Something broke', 422, { field: 'email' });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'TEST_ERR',
        message: 'Something broke',
        details: { field: 'email' },
      },
    });
  });

  it('defaults to 400 status', () => {
    const res = mockRes();
    sendError(res, 'BAD', 'bad');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('errors helpers', () => {
  it('notFound sends 404', () => {
    const res = mockRes();
    errors.notFound(res, 'Secret');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: 'Secret not found' }) })
    );
  });

  it('unauthorized sends 401', () => {
    const res = mockRes();
    errors.unauthorized(res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('forbidden sends 403', () => {
    const res = mockRes();
    errors.forbidden(res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('badRequest sends 400', () => {
    const res = mockRes();
    errors.badRequest(res, 'Invalid input');
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('internal sends 500', () => {
    const res = mockRes();
    errors.internal(res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('rateLimit sends 429', () => {
    const res = mockRes();
    errors.rateLimit(res);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('conflict sends 409', () => {
    const res = mockRes();
    errors.conflict(res, 'Already exists');
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
