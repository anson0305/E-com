import jwt from 'jsonwebtoken';
import { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcrypt';

export interface UserPayload extends JwtPayload {
  userId: string;
  email: string;
  role: 'customer'|'admin';
}

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? (() => {
    console.warn('[WARNING] JWT_ACCESS_SECRET env var is not set — using insecure fallback. Do NOT use in production.');
    return 'access_secret_key';
})();

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? (() => {
    console.warn('[WARNING] JWT_REFRESH_SECRET env var is not set — using insecure fallback. Do NOT use in production.');
    return 'refresh_secret_key';
})();

export async function hashPwd(password: string) {
    return bcrypt.hash(password, await bcrypt.genSalt(10));
}

export async function verifyPwd(hashedPwd: string, inputPwd: string) {
    return bcrypt.compare(inputPwd, hashedPwd);
}

export function genJwtRefreshToken(payload: {
  userId: string;
  email: string;
  role: 'customer' |'admin';
}) {
    return jwt.sign(
        { userId: payload.userId, email: payload.email, role: payload.role },
        JWT_REFRESH_SECRET, {
        expiresIn: '1d'
    });
}

export function genJwtAccessToken(payload: UserPayload) {
    return jwt.sign(
        { userId: payload.userId, email: payload.email, role: payload.role },
        JWT_ACCESS_SECRET, {
        expiresIn: '15m'
    });
}

export function verifyAccessToken(token: string) {
    return jwt.verify(token, JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token: string) {
    return jwt.verify(token, JWT_REFRESH_SECRET);
}