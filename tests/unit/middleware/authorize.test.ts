/// <reference path="../../../src/types/express.d.ts" />
import { mockReq, mockRes, mockNext } from '../../setup.js';
import { authorize } from '../../../src/middleware/authorize.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('authorize middleware', () => {
  let req: ReturnType<typeof mockReq>;
  let res: ReturnType<typeof mockRes>;
  let next: ReturnType<typeof mockNext>;

  beforeEach(() => {
    vi.clearAllMocks();
    req = mockReq();
    res = mockRes();
    next = mockNext();
  });

  it('returns 403 when req.jwtPayload is undefined', () => {
    const middleware = authorize('admin');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role does not match', () => {
    const middleware = authorize('admin');
    req = mockReq({ jwtPayload: { userId: '1', email: 'a@b.com', role: 'customer' } });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when role matches', () => {
    const middleware = authorize('admin');
    req = mockReq({ jwtPayload: { userId: '1', email: 'a@b.com', role: 'admin' } });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() when role is one of allowed roles', () => {
    const middleware = authorize('admin', 'customer');
    req = mockReq({ jwtPayload: { userId: '1', email: 'a@b.com', role: 'customer' } });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
