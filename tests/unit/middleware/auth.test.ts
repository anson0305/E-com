import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes, mockNext } from '../../setup.js';
import jwt from 'jsonwebtoken';

vi.mock('../../../src/services/JWT.js', () => ({
  verifyAccessToken: vi.fn(),
}));

import { JWT_auth } from '../../../src/middleware/auth.js';
import { verifyAccessToken } from '../../../src/services/JWT.js';

const mockVerify = verifyAccessToken as ReturnType<typeof vi.fn>;

describe('JWT_auth middleware', () => {
  let req: ReturnType<typeof mockReq>;
  let res: ReturnType<typeof mockRes>;
  let next: ReturnType<typeof mockNext>;

  beforeEach(() => {
    vi.clearAllMocks();
    req = mockReq();
    res = mockRes();
    next = mockNext();
  });

  it('returns 401 with "Missing or malformed authorization header" when no Authorization header', () => {
    JWT_auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or malformed authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with "Missing or malformed authorization header" when header does not start with \'Bearer \'', () => {
    req = mockReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    JWT_auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or malformed authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with "Token is empty" when header is \'Bearer \' with no token', () => {
    req = mockReq({ headers: { authorization: 'Bearer ' } });
    JWT_auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token is empty' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches jwtPayload when token is valid', () => {
    const payload = { userId: 'user-1', email: 'a@b.com', role: 'customer' as const };
    mockVerify.mockReturnValue(payload);

    req = mockReq({ headers: { authorization: 'Bearer valid.token.here' } });
    JWT_auth(req, res, next);

    expect(mockVerify).toHaveBeenCalledWith('valid.token.here');
    expect(req.jwtPayload).toEqual(payload);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 401 with "Invalid token" when verifyAccessToken throws JsonWebTokenError', () => {
    const err = new jwt.JsonWebTokenError('invalid token');
    mockVerify.mockImplementation(() => {
      throw err;
    });

    req = mockReq({ headers: { authorization: 'Bearer bad.token.here' } });
    JWT_auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with "expired token" when verifyAccessToken throws TokenExpiredError', () => {
    const err = new jwt.TokenExpiredError('jwt expired', new Date());
    mockVerify.mockImplementation(() => {
      throw err;
    });

    req = mockReq({ headers: { authorization: 'Bearer expired.token.here' } });
    JWT_auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when verifyAccessToken throws an unexpected error', () => {
    const err = new Error('something unexpected');
    mockVerify.mockImplementation(() => {
      throw err;
    });

    req = mockReq({ headers: { authorization: 'Bearer some.token.here' } });
    JWT_auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal authentication error' });
    expect(next).not.toHaveBeenCalled();
  });
});
