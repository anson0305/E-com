import { Request, Response, NextFunction } from "express";

export function authorize(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.jwtPayload || !roles.includes(req.jwtPayload.role)) {
            return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
        }
        next();
    };
}