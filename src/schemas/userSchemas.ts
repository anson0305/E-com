import { z } from 'zod';

export const userIdParamsSchema = z.strictObject({
    id: z.string().regex(/^[1-9]\d*$/, 'id must be a positive integer'),
});

export const registerBodySchema = z.strictObject({
    email: z.email().trim().toLowerCase(),
    userName: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(128),
});

export const loginBodySchema = z.strictObject({
    email: z.email().trim().toLowerCase(),
    password: z.string().min(1).max(128),
});

export const changeRoleBodySchema = z.strictObject({
    role: z.enum(['customer', 'admin']),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type ChangeRoleBody = z.infer<typeof changeRoleBodySchema>;
