import { vi, beforeEach, describe, it, expect } from 'vitest';

// Mock the JWT module with a factory that re-exports the real implementations.
// This puts the module under vitest's control while letting hashPwd, verifyPwd,
// genJwtAccessToken, and genJwtRefreshToken run as real functions.
vi.mock('../../../src/services/JWT.js', async () => {
    const actual = await vi.importActual<typeof import('../../../src/services/JWT.js')>(
        '../../../src/services/JWT.js',
    );
    return actual;
});

import {
    UserService,
    DuplicateError,
    LoginError,
    UserNotFoundError,
    roleDoesNotExist,
} from '../../../src/services/userServices.js';
import { hashPwd } from '../../../src/services/JWT.js';
import { mockRes, mockReq, mockNext } from '../../setup.js';
import type { User, CreateUserInput } from '../../../src/models/users.js';

// ---------------------------------------------------------------------------
// Mock repository – we only mock the data-access layer.
// JWT helpers (hashPwd, verifyPwd, genJwtAccessToken, genJwtRefreshToken)
// run as real functions because they have no DB dependency.
// ---------------------------------------------------------------------------
const mockRepo = {
    findByEmail: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    deleteById: vi.fn(),
    updateById: vi.fn(),
};

// Ensure helpers imported from setup are referenced so the linter does not
// complain about unused imports (they are imported per the instructions).
void mockRes;
void mockReq;
void mockNext;

// ---------------------------------------------------------------------------
// Helper: build a fake User row as returned by the repository
// ---------------------------------------------------------------------------
function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashed_password',
        role: 'customer',
        created_at: new Date('2025-01-01'),
        updated_at: new Date('2025-01-01'),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('UserService', () => {
    let service: UserService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new UserService(mockRepo as any);
    });

    // -- register -----------------------------------------------------------

    describe('register()', () => {
        const input: CreateUserInput = {
            email: 'new@example.com',
            userName: 'New User',
            password: 'secret123',
        };

        it('creates a user and returns tokens', async () => {
            const createdUser = makeUser({
                id: 10,
                name: 'New User',
                email: 'new@example.com',
            });

            mockRepo.findByEmail.mockResolvedValue(null); // no duplicate
            mockRepo.create.mockResolvedValue(createdUser);

            const result = await service.register(input);

            expect(mockRepo.findByEmail).toHaveBeenCalledWith('new@example.com');
            expect(mockRepo.create).toHaveBeenCalledTimes(1);

            // Assert the create call received hashed password (not plaintext)
            const createCallArg = mockRepo.create.mock.calls[0][0];
            expect(createCallArg.name).toBe('New User');
            expect(createCallArg.email).toBe('new@example.com');
            expect(createCallArg.hashedPassword).not.toBe(input.password);
            expect(createCallArg.role).toBe('customer');

            expect(result.user).toEqual({
                id: 10,
                name: 'New User',
                email: 'new@example.com',
                role: 'customer',
            });
            expect(typeof result.access_token).toBe('string');
            expect(result.access_token.length).toBeGreaterThan(0);
            expect(typeof result.refresh_token).toBe('string');
            expect(result.refresh_token.length).toBeGreaterThan(0);
        });

        it('throws DuplicateError when email already exists', async () => {
            mockRepo.findByEmail.mockResolvedValue(makeUser({ email: input.email }));

            await expect(service.register(input)).rejects.toThrow(DuplicateError);
            await expect(service.register(input)).rejects.toThrow(
                `Email "${input.email}" is already registered`,
            );

            expect(mockRepo.create).not.toHaveBeenCalled();
        });
    });

    // -- login --------------------------------------------------------------

    describe('login()', () => {
        const email = 'user@example.com';
        const plainPassword = 'my-password';

        it('returns tokens on correct password', async () => {
            const hashed = await hashPwd(plainPassword); // real bcrypt hash
            mockRepo.findByEmail.mockResolvedValue(
                makeUser({ email, password: hashed }),
            );

            const result = await service.login(email, plainPassword);

            expect(mockRepo.findByEmail).toHaveBeenCalledWith(email);

            expect(result.user).toEqual({
                id: 1,
                name: 'Test User',
                email,
                role: 'customer',
            });
            expect(typeof result.access_token).toBe('string');
            expect(result.access_token.length).toBeGreaterThan(0);
            expect(typeof result.refresh_token).toBe('string');
            expect(result.refresh_token.length).toBeGreaterThan(0);
        });

        it('throws LoginError on wrong password', async () => {
            const hashed = await hashPwd(plainPassword);
            mockRepo.findByEmail.mockResolvedValue(
                makeUser({ email, password: hashed }),
            );

            await expect(
                service.login(email, 'totally-different-password'),
            ).rejects.toThrow(LoginError);

            expect(mockRepo.findByEmail).toHaveBeenCalledWith(email);
        });

        it('throws UserNotFoundError on unknown email', async () => {
            mockRepo.findByEmail.mockResolvedValue(null);

            await expect(
                service.login('ghost@example.com', 'irrelevant'),
            ).rejects.toThrow(UserNotFoundError);

            expect(mockRepo.findByEmail).toHaveBeenCalledWith('ghost@example.com');
        });
    });

    // -- profile ------------------------------------------------------------

    describe('profile()', () => {
        const email = 'user@example.com';

        it('returns user by email', async () => {
            mockRepo.findByEmail.mockResolvedValue(makeUser({ email }));

            const result = await service.profile(email);

            expect(mockRepo.findByEmail).toHaveBeenCalledWith(email);
            expect(result).toEqual({
                id: 1,
                name: 'Test User',
                email,
                role: 'customer',
            });
        });

        it('throws UserNotFoundError on unknown email', async () => {
            mockRepo.findByEmail.mockResolvedValue(null);

            await expect(service.profile('nobody@example.com')).rejects.toThrow(
                UserNotFoundError,
            );
            expect(mockRepo.findByEmail).toHaveBeenCalledWith('nobody@example.com');
        });
    });

    // -- listAllUsers -------------------------------------------------------

    describe('listAllUsers()', () => {
        it('returns the user list', async () => {
            const users = [
                { id: 1, name: 'Alice', email: 'alice@example.com', role: 'customer' },
                { id: 2, name: 'Bob', email: 'bob@example.com', role: 'admin' },
            ];
            mockRepo.findAll.mockResolvedValue(users);

            const result = await service.listAllUsers();

            expect(mockRepo.findAll).toHaveBeenCalledTimes(1);
            expect(result).toEqual(users);
        });
    });

    // -- deleteUser ---------------------------------------------------------

    describe('deleteUser()', () => {
        it('returns true on successful deletion', async () => {
            mockRepo.findById.mockResolvedValue(makeUser({ id: 42 }));
            mockRepo.deleteById.mockResolvedValue(true);

            const result = await service.deleteUser(42);

            expect(mockRepo.findById).toHaveBeenCalledWith(42);
            expect(mockRepo.deleteById).toHaveBeenCalledWith(42);
            expect(result).toBe(true);
        });

        it('throws UserNotFoundError on unknown id', async () => {
            mockRepo.findById.mockResolvedValue(null);

            await expect(service.deleteUser(999)).rejects.toThrow(UserNotFoundError);

            expect(mockRepo.findById).toHaveBeenCalledWith(999);
            expect(mockRepo.deleteById).not.toHaveBeenCalled();
        });
    });

    // -- updateUserRole -----------------------------------------------------

    describe('updateUserRole()', () => {
        it('returns the updated user', async () => {
            const existing = makeUser({ id: 7, role: 'customer' });
            const updated = { ...existing, role: 'admin' };

            mockRepo.findById.mockResolvedValue(existing);
            mockRepo.updateById.mockResolvedValue(updated);

            const result = await service.updateUserRole(7, 'admin');

            expect(mockRepo.findById).toHaveBeenCalledWith(7);
            expect(mockRepo.updateById).toHaveBeenCalledWith(7, 'admin');
            expect(result).toEqual(updated);
        });

        it('throws roleDoesNotExist on invalid role', async () => {
            await expect(
                service.updateUserRole(1, 'superadmin'),
            ).rejects.toThrow(roleDoesNotExist);

            // Repository should NOT be called when the role is invalid
            expect(mockRepo.findById).not.toHaveBeenCalled();
            expect(mockRepo.updateById).not.toHaveBeenCalled();
        });

        it('throws UserNotFoundError on unknown id', async () => {
            mockRepo.findById.mockResolvedValue(null);

            await expect(service.updateUserRole(404, 'admin')).rejects.toThrow(
                UserNotFoundError,
            );

            expect(mockRepo.findById).toHaveBeenCalledWith(404);
            expect(mockRepo.updateById).not.toHaveBeenCalled();
        });
    });
});
