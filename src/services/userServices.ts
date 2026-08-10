import { userRepository } from '../repositories/userRepository.js';
import { hashPwd, verifyPwd, genJwtAccessToken, genJwtRefreshToken } from './JWT.js'
import { CreateUserInput, User, UserResponse} from '../models/users.js';

export class DuplicateError extends Error {
    constructor(email: string) {
        super(`Email "${email}" is already registered`);
        this.name = 'DuplicateError';
    }
}

export class LoginError extends Error {
    constructor() {
        super("the password is wrong");
        this.name = "loginError";
    }
}

export class UserNotFoundError extends Error {
    constructor() {
        super("Unknown User or email");
        this.name = "UserNotFoundError";
    }
}

export class roleDoesNotExist extends Error {
    constructor() {
        super("role does not exist");
        this.name = "roleDoesNotExist";
    }
}

export class UserService {
    constructor(private repo = userRepository) {}  // 可以 inject mock

    async register(input: CreateUserInput): Promise<{
        user: UserResponse;
        access_token: string;
        refresh_token: string;
    }> {
        // 1. Check duplicate
        const existing = await this.repo.findByEmail(input.email);
        if (existing) {
            throw new DuplicateError(input.email);
        }

        // 2. Hash password
        const hashedPwd = await hashPwd(input.password);

        // 3. Create user
        const user = await this.repo.create({
            name: input.userName,
            email: input.email,
            hashedPassword: hashedPwd,
            role: 'customer',
        });

        // 4. Generate tokens
        const payload = {
            userId: user.id.toString(),
            email: user.email,
            role: user.role as 'customer',
        };

        return {
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
            access_token: genJwtAccessToken(payload),
            refresh_token: genJwtRefreshToken(payload),
        };
    }

    async login(email: string, password: string): Promise<{
        user: UserResponse,
        access_token: string,
        refresh_token: string
    }> {
        const user = await this.repo.findByEmail(email);
        if (user) {
            const passed = await verifyPwd(user.password, password);
            const payload = {
                userId: user.id.toString(),
                email: user.email,
                role: user.role as 'customer',
            };
            if (passed) {
                return {
                    user: { id: user.id, name: user.name, email: user.email, role: user.role },
                    access_token: genJwtAccessToken(payload),
                    refresh_token: genJwtRefreshToken(payload),
                }
            } else {
                throw new LoginError();
            }
        } else {
            throw new UserNotFoundError();
        }
    }

    async profile(email: string) {
        const user = await this.repo.findByEmail(email);
        if (user) {
            return { id: user.id, name: user.name, email: user.email, role: user.role };
        } else {
            throw new UserNotFoundError();
        }
    }

    async listAllUsers() {
        const userList = await this.repo.findAll();
        if (userList) {
            return userList;
        } else {
            throw new UserNotFoundError();
        }
    }

    async deleteUser(id: number): Promise<boolean> {
        const user = await this.repo.findById(id);
        if (user) {
            const success = await this.repo.deleteById(id);
            if (success) {
                return true;
            } else {
                return false;
            }
        } else {
            throw new UserNotFoundError();
        }
    }

    async updateUserRole(id: number, role: string): Promise<UserResponse|null> {
        if (role == "admin" || role == "customer") {
            const user = await this.repo.findById(id);
            if (user) {
                const updatedUser = await this.repo.updateById(id, role);
                return updatedUser ?? null;
            } else {
                throw new UserNotFoundError();
            }
        } else {
            throw new roleDoesNotExist();
        }
    }
}

export const userService = new UserService();