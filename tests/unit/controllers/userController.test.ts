/// <reference path="../../../src/types/express.d.ts" />
import { mockReq, mockRes } from '../../setup';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock userServices ──────────────────────────────────────────────
vi.mock('../../../src/services/userServices.js', () => {
    class DuplicateError extends Error {
        constructor(email: string) {
            super(`Email "${email}" is already registered`);
            this.name = 'DuplicateError';
        }
    }

    class LoginError extends Error {
        constructor() {
            super('the password is wrong');
            this.name = 'loginError';
        }
    }

    class UserNotFoundError extends Error {
        constructor() {
            super('Unknown User or email');
            this.name = 'UserNotFoundError';
        }
    }

    class roleDoesNotExist extends Error {
        constructor() {
            super('role does not exist');
            this.name = 'roleDoesNotExist';
        }
    }

    const userService = {
        register: vi.fn(),
        login: vi.fn(),
        profile: vi.fn(),
        listAllUsers: vi.fn(),
        deleteUser: vi.fn(),
        updateUserRole: vi.fn(),
    };

    return { userService, DuplicateError, LoginError, UserNotFoundError, roleDoesNotExist };
});

// ── Mock JWT ───────────────────────────────────────────────────────
vi.mock('../../../src/services/JWT.js', () => ({
    genJwtAccessToken: vi.fn(),
    genJwtRefreshToken: vi.fn(),
    verifyRefreshToken: vi.fn(),
}));

// ── Imports (after mocks so vitest hoisting resolves correctly) ────
import {
    register,
    login,
    profile,
    refresh,
    listUsers,
    removeUser,
    changeRole,
} from '../../../src/controllers/userController.js';
import {
    userService,
    DuplicateError,
    LoginError,
    UserNotFoundError,
    roleDoesNotExist,
} from '../../../src/services/userServices.js';
import {
    genJwtAccessToken,
    genJwtRefreshToken,
    verifyRefreshToken,
} from '../../../src/services/JWT.js';

// ── Typed mock references ──────────────────────────────────────────
const mockRegister = userService.register as ReturnType<typeof vi.fn>;
const mockLogin = userService.login as ReturnType<typeof vi.fn>;
const mockProfile = userService.profile as ReturnType<typeof vi.fn>;
const mockListAllUsers = userService.listAllUsers as ReturnType<typeof vi.fn>;
const mockDeleteUser = userService.deleteUser as ReturnType<typeof vi.fn>;
const mockUpdateUserRole = userService.updateUserRole as ReturnType<typeof vi.fn>;

const mockGenJwtAccessToken = genJwtAccessToken as ReturnType<typeof vi.fn>;
const mockGenJwtRefreshToken = genJwtRefreshToken as ReturnType<typeof vi.fn>;
const mockVerifyRefreshToken = verifyRefreshToken as ReturnType<typeof vi.fn>;

// ── Helpers ────────────────────────────────────────────────────────
const userStub = {
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
    role: 'customer' as const,
};

const tokensStub = {
    access_token: 'access-token-stub',
    refresh_token: 'refresh-token-stub',
};

// ── Tests ──────────────────────────────────────────────────────────
describe('userController', () => {
    let req: ReturnType<typeof mockReq>;
    let res: ReturnType<typeof mockRes>;

    beforeEach(() => {
        vi.clearAllMocks();
        req = mockReq();
        res = mockRes();
    });

    // ──── register ─────────────────────────────────────────────────
    describe('register', () => {
        it('returns 201 with user data on success', async () => {
            req.body = { email: 'alice@example.com', userName: 'Alice', password: 'secret' };
            mockRegister.mockResolvedValue({ user: userStub, ...tokensStub });

            await register(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: { user: userStub, ...tokensStub },
            });
        });

        it.each([
            { missing: 'email', body: { userName: 'Alice', password: 'secret' } },
            { missing: 'userName', body: { email: 'alice@example.com', password: 'secret' } },
            { missing: 'password', body: { email: 'alice@example.com', userName: 'Alice' } },
        ])('returns 400 when $missing is missing', async ({ body }) => {
            req.body = body;

            await register(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'email, userName, and password are required',
            });
        });

        it('returns 409 when DuplicateError is thrown', async () => {
            req.body = { email: 'dupe@example.com', userName: 'Dup', password: 'secret' };
            mockRegister.mockRejectedValue(new DuplicateError('dupe@example.com'));

            await register(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Email "dupe@example.com" is already registered',
            });
        });
    });

    // ──── login ────────────────────────────────────────────────────
    describe('login', () => {
        it('returns 200 with access_token and sets refresh_token cookie', async () => {
            req.body = { email: 'alice@example.com', password: 'secret' };
            mockLogin.mockResolvedValue({ user: userStub, ...tokensStub });

            await login(req, res);

            expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-token-stub', {
                httpOnly: true,
                sameSite: 'strict',
                secure: false, // NODE_ENV is not 'production' in tests
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: { user: userStub, access_token: 'access-token-stub' },
            });
        });

        it.each([
            { missing: 'email', body: { password: 'secret' } },
            { missing: 'password', body: { email: 'alice@example.com' } },
        ])('returns 400 when $missing is missing', async ({ body }) => {
            req.body = body;

            await login(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'email and password are required',
            });
        });

        it('returns 401 when LoginError is thrown', async () => {
            req.body = { email: 'alice@example.com', password: 'wrong' };
            mockLogin.mockRejectedValue(new LoginError());

            await login(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'login failed',
            });
        });

        it('returns 404 when UserNotFoundError is thrown', async () => {
            req.body = { email: 'ghost@example.com', password: 'secret' };
            mockLogin.mockRejectedValue(new UserNotFoundError());

            await login(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'unknown user, please register',
            });
        });
    });

    // ──── profile ──────────────────────────────────────────────────
    describe('profile', () => {
        it('returns 200 with user data when jwtPayload.email is set', async () => {
            req.jwtPayload = { email: 'alice@example.com' } as typeof req.jwtPayload;
            mockProfile.mockResolvedValue(userStub);

            await profile(req, res);

            expect(res.json).toHaveBeenCalledWith(userStub);
        });

        it('returns 400 when email is missing from jwtPayload', async () => {
            req.jwtPayload = {} as typeof req.jwtPayload;

            await profile(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'email is required',
            });
        });

        it('returns 404 when UserNotFoundError is thrown', async () => {
            req.jwtPayload = { email: 'ghost@example.com' } as typeof req.jwtPayload;
            mockProfile.mockRejectedValue(new UserNotFoundError());

            await profile(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'unknown user',
            });
        });
    });

    // ──── listUsers ────────────────────────────────────────────────
    describe('listUsers', () => {
        it('returns 200 with user list', async () => {
            const users = [userStub, { ...userStub, id: 2, email: 'bob@example.com' }];
            mockListAllUsers.mockResolvedValue(users);

            await listUsers(req, res);

            expect(res.json).toHaveBeenCalledWith({ success: true, data: users });
        });

        it('returns 404 when UserNotFoundError is thrown', async () => {
            mockListAllUsers.mockRejectedValue(new UserNotFoundError());

            await listUsers(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Unknown User or email',
            });
        });
    });

    // ──── removeUser ───────────────────────────────────────────────
    describe('removeUser', () => {
        it('returns 200 on successful deletion', async () => {
            req.params = { id: '1' };
            mockDeleteUser.mockResolvedValue(true);

            await removeUser(req, res);

            expect(mockDeleteUser).toHaveBeenCalledWith(1);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: 'user 1 is removed',
            });
        });

        it('returns 404 when UserNotFoundError is thrown', async () => {
            req.params = { id: '999' };
            mockDeleteUser.mockRejectedValue(new UserNotFoundError());

            await removeUser(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Unknown User or email',
            });
        });
    });

    // ──── changeRole ───────────────────────────────────────────────
    describe('changeRole', () => {
        it('returns 200 with updated user', async () => {
            req.body = { role: 'admin' };
            req.params = { id: '1' };
            const adminUser = { ...userStub, role: 'admin' as const };
            mockUpdateUserRole.mockResolvedValue(adminUser);

            await changeRole(req, res);

            expect(mockUpdateUserRole).toHaveBeenCalledWith(1, 'admin');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, data: adminUser });
        });

        it('returns 400 when role is missing from body', async () => {
            req.body = {};
            req.params = { id: '1' };

            await changeRole(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'role is required',
            });
        });

        it('returns 400 when roleDoesNotExist is thrown', async () => {
            req.body = { role: 'superadmin' };
            req.params = { id: '1' };
            mockUpdateUserRole.mockRejectedValue(new roleDoesNotExist());

            await changeRole(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'role does not exist',
            });
        });

        it('returns 404 when UserNotFoundError is thrown', async () => {
            req.body = { role: 'admin' };
            req.params = { id: '999' };
            mockUpdateUserRole.mockRejectedValue(new UserNotFoundError());

            await changeRole(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Unknown User or email',
            });
        });
    });

    // ──── refresh ──────────────────────────────────────────────────
    describe('refresh', () => {
        it('returns 200 with new access_token on valid refresh token', async () => {
            req.cookies = { refresh_token: 'valid-refresh-token' };
            const decoded = { userId: '1', email: 'alice@example.com', role: 'customer' as const };
            mockVerifyRefreshToken.mockReturnValue(decoded);
            mockGenJwtAccessToken.mockReturnValue('new-access-token');
            mockGenJwtRefreshToken.mockReturnValue('new-refresh-token');

            await refresh(req, res);

            expect(mockVerifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
            expect(mockGenJwtAccessToken).toHaveBeenCalledWith(decoded);
            expect(mockGenJwtRefreshToken).toHaveBeenCalledWith(decoded);
            expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'new-refresh-token', {
                httpOnly: true,
                sameSite: 'strict',
                secure: false,
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: { access_token: 'new-access-token' },
            });
        });

        it('returns 401 when refresh_token cookie is missing', async () => {
            req.cookies = {};

            await refresh(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Refresh token is missing',
            });
        });

        it('returns 403 when verifyRefreshToken throws', async () => {
            req.cookies = { refresh_token: 'tampered-token' };
            mockVerifyRefreshToken.mockImplementation(() => {
                throw new Error('jwt malformed');
            });

            await refresh(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Invalid or expired refresh token',
            });
        });
    });
});
