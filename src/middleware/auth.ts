import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, UserPayload } from "../services/JWT.js";
import { JwtPayload } from "jsonwebtoken";

export function JWT_auth(req: Request, res: Response, next: NextFunction) {
    console.log("JWT_auth");
    try {
        const auth_header = req.headers.authorization;

        if (!auth_header || !auth_header.startsWith('Bearer ')) {
            res.status(401).json({ error: "Missing or malformed authorization header" });
            return;
        }

        const token = auth_header.slice(7);
        if (!token) {
            res.status(401).json({ error: "Token is empty" });
            return;
        }

        const payload = verifyAccessToken(token) as UserPayload;
        req.jwtPayload = payload;
        // console.log("passed auth")
        next();
    } catch (err: any) {
        if (err.name === 'JsonWebTokenError' ) {
            console.error("JWT verification failed:", err);
            res.status(401).json({ error: "Invalid token" });
        } else if (err.name === 'TokenExpiredError') {
            console.error("JWT verification failed:", err);
            res.status(401).json({ error: "expired token" });
        } else {
            console.error("Unexpected auth error:", err);
            res.status(500).json({ error: "Internal authentication error" });
        }
    }
}