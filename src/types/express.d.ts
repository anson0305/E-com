declare global {
    namespace Express {
        interface Request {
            jwtPayload?: {
                userId: string;
                email: string;
                role: string;
            };
        }
    }
}

export {};
