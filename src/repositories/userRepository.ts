import { pool } from '../config/db.js';
import { User, UserResponse } from '../models/users.js';

export class UserRepository {
    async findByEmail(email: string): Promise<User | null> {
        const { rows } = await pool.query(
            'SELECT * FROM users WHERE email = $1', [email]
        );
        return rows[0] ?? null;
    }

    async create(data: {
        name: string;
        email: string;
        hashedPassword: string;
        role: string;
    }): Promise<User> {
        const { rows } = await pool.query(
            `INSERT INTO users (name, email, password, role)
            VALUES ($1, $2, $3, $4) RETURNING *`,
            [data.name, data.email, data.hashedPassword, data.role]
        );
        return rows[0];
    }

    async findAll(): Promise<UserResponse[]> {
        const {rows} = await pool.query("select * from users;");
        return rows;
    }

    async findById(id: number): Promise<UserResponse> {
        const {rows} = await pool.query("select * from users where id=$1 ;",
            [id]
        );
        return rows[0];
    }

    async deleteById(id: number): Promise<boolean> {
        const { rowCount } = await pool.query("delete from users where id=$1;", [id]);
        return (rowCount ?? 0) > 0;
    }

    async updateById(id: number, role: string): Promise<UserResponse|null> {
        const {rows} = await pool.query("UPDATE users SET role = $2 WHERE id = $1 RETURNING *",
            [id, role]
        );
        return rows[0];
    }
}

export const userRepository = new UserRepository();