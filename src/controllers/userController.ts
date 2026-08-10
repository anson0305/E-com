import type { Request, Response } from 'express';
import { userService, DuplicateError, LoginError, UserNotFoundError, roleDoesNotExist } from '../services/userServices.js';
import { genJwtAccessToken, genJwtRefreshToken, verifyRefreshToken, type UserPayload } from '../services/JWT.js';

export async function register(req: Request, res: Response) {
    try {
        const { email, userName, password } = req.body;

        // Basic validation（將來換 Zod middleware）
        if (!email || !userName || !password) {
            res.status(400).json({
                success: false,
                error: 'email, userName, and password are required',
            });
            return;
        }

        const result = await userService.register({ email, userName, password });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        if (error instanceof DuplicateError) {
            res.status(409).json({ success: false, error: error.message });
        } else {
            console.error('Register error:', error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}

export async function login(req: Request, res: Response) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({
                success: false,
                error: 'email and password are required',
            });
            return;
        }
        const { user, access_token, refresh_token } = await userService.login(email, password);

        res.cookie('refresh_token', refresh_token, {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
        });
        res.status(200).json({ success: true, data: { user, access_token } });
    } catch (error) {
        if (error instanceof LoginError) {
            res.status(401).json({ success: false, error: "login failed" });
        } else if (error instanceof UserNotFoundError) {
            res.status(404).json({ success: false, error: "unknown user, please register" });
        } else {
            console.error('Login error:', error);
            res.status(500).json({ success: false, error: "Internal server error" });
        }
    }
}

export async function profile(req: Request, res: Response) {
    try {
        const { email } = req.jwtPayload!;
        if (email) {
            const user = await userService.profile(email);
            res.json(user);
        } else {
            res.status(400).json({
                success: false,
                error: 'email is required',
            });
        }
    } catch (error) {
        if (error instanceof UserNotFoundError) {
            res.status(404).json({ success: false, error: "unknown user" });
        } else {
            console.error('Profile error:', error);
            res.status(500).json({ success: false, error: "unexpected error" });
        }
    }
}

export async function refresh(req: Request, res: Response) {
    const refresh_token = req.cookies.refresh_token;
    console.log("test: ", req.cookies);
    if (!refresh_token) {
        res.status(401).json({ success: false, error: 'Refresh token is missing' });
        return;
    }
    try {
        const decoded = verifyRefreshToken(refresh_token) as UserPayload;
        const new_access_token = genJwtAccessToken(decoded);
        const new_refresh_token = genJwtRefreshToken(decoded);

        // 更新 cookie 入面嘅 refresh token（rotation）
        res.cookie('refresh_token', new_refresh_token, {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
        });
        res.status(200).json({ success: true, data: { access_token: new_access_token } });
    } catch (error) {
        res.status(403).json({ success: false, error: 'Invalid or expired refresh token' });
    }
}

export async function listUsers(req: Request, res: Response) {
    try {
        const userList = await userService.listAllUsers();
        res.json({ success: true, data: userList });
    } catch (error) {
        if (error instanceof UserNotFoundError) {
            res.status(404).json({ success: false, error: error.message });
        } else {
            console.error('listUsers error:', error);
            res.status(500).json({ success: false, error: "unexpected error" });
        }
    }
}

export async function removeUser(req: Request, res: Response) {
    try {
        const result = await userService.deleteUser(Number.parseInt(req.params.id as string));
        if (result) {
            res.status(200).json({success: true, data: `user ${req.params.id} is removed`});
        } else {
            res.status(500).json({success: false, error: "unexpected error"});
        }
    } catch (error) {
        if (error instanceof UserNotFoundError) {
            res.status(404).json({success: false, error: error.message});
        } else {
            console.error('removeUser error:', error);
            res.status(500).json({success: false, error: "unexpected error"});
        }
    }
}

export async function changeRole(req: Request, res: Response) {
    const newRole = req.body.role;
    try {
        if (!newRole) {
            res.status(400).json({ success: false, error: 'role is required' });
            return;
        }
        const id = req.params.id;
        if (!id) {
            res.status(400).json({ success: false, error: 'id is required' });
            return;
        }
        const updatedUser = await userService.updateUserRole(Number.parseInt(id as string), newRole);
        if (updatedUser) {
            res.status(200).json({success: true, data: updatedUser});
        } else {
            res.status(500).json({success: false, error: "unexpected error"});
        }
    } catch (error) {
        if (error instanceof UserNotFoundError) {
            res.status(404).json({success: false, error: error.message});
        } else if (error instanceof roleDoesNotExist) {
            res.status(400).json({success: false, error: error.message});
        } else {
            console.error('changeRole error:', error);
            res.status(500).json({success: false, error: "unexpected error"});
        }
    }
}