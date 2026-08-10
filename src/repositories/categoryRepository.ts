import { pool } from '../config/db.js';
import { Category, CategoryResponse } from '../models/categories.js';

export class CategoryRepository {
    async findAll(): Promise<CategoryResponse[]> {
        const { rows } = await pool.query(
            'SELECT * FROM categories ORDER BY name'
        );
        return rows;
    }

    async findById(id: number): Promise<CategoryResponse | null> {
        const { rows } = await pool.query(
            'SELECT * FROM categories WHERE id = $1', [id]
        );
        return rows[0] ?? null;
    }

    async findByParent(id: number): Promise<CategoryResponse[]|null> {
        const {rows} = await pool.query(
            'select * from categories where parent_id = $1',
            [id]
        );
        return rows ?? null
    }

    async findByName(name: string): Promise<CategoryResponse | null> {
        const { rows } = await pool.query(
            'SELECT * FROM categories WHERE name = $1', [name]
        );
        return rows[0] ?? null;
    }

    async create(name: string, parent_id?: number): Promise<CategoryResponse> {
        const { rows } = await pool.query(
            `INSERT INTO categories (name, parent_id)
            VALUES ($1, $2) RETURNING *`,
            [name, parent_id ?? null]
        );
        return rows[0];
    }
    
}

export const categoryRepository = new CategoryRepository();