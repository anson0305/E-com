export interface User {
    id: number;
    name: string;
    email: string;
    password: string;
    role: 'customer' | 'admin';
    created_at: Date;
    updated_at: Date;
}

export interface UserResponse {
    id: number;
    name: string;
    email: string;
    role: string;
}
