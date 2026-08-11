import { pool } from "../config/db.js";
import type { PaginatedProductResponse, ProductResponse } from "../models/products.js";
import type { CreateProductBody, ListProductsQuery, UpdateProductBody } from '../schemas/productSchemas.js';

// Whitelist: only these columns may be updated via UpdateProductInput
const ALLOWED_UPDATE_COLUMNS = new Set([
    'name', 'description', 'price', 'stock', 'image_url', 'category_id', 'is_active',
]);

const SORT_COLUMNS = {
    name: 'name',
    price: 'price',
    stock: 'stock',
    created_at: 'created_at',
} as const;

export class ProductRepository {
    async findall(): Promise<ProductResponse[] | null> {
        const { rows } = await pool.query(
            'SELECT * FROM products WHERE is_active = true'
        );
        return rows.length > 0 ? rows : null;
    }

    async findPage(query: ListProductsQuery): Promise<PaginatedProductResponse> {
        const conditions = ['is_active = true'];
        const values: Array<number | string> = [];

        if (query.category_id !== undefined) {
            values.push(query.category_id);
            conditions.push(`category_id = $${values.length}`);
        }
        if (query.name !== undefined) {
            values.push(`%${query.name}%`);
            conditions.push(`name ILIKE $${values.length}`);
        }

        const whereClause = conditions.join(' AND ');
        const { rows: countRows } = await pool.query<{ total: string }>(
            `SELECT COUNT(*)::text AS total FROM products WHERE ${whereClause}`,
            values,
        );

        const limitPosition = values.length + 1;
        const offsetPosition = values.length + 2;
        const sortColumn = SORT_COLUMNS[query.sort];
        const order = query.order === 'asc' ? 'ASC' : 'DESC';
        const offset = (query.page - 1) * query.limit;
        const { rows } = await pool.query<ProductResponse>(
            `SELECT * FROM products
             WHERE ${whereClause}
             ORDER BY ${sortColumn} ${order}, id ASC
             LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
            [...values, query.limit, offset],
        );

        return { items: rows, total: Number(countRows[0]?.total ?? 0) };
    }

    async findByID(id: number): Promise<ProductResponse | null> {
        const { rows } = await pool.query(
            'SELECT * FROM products WHERE id = $1',
            [id]
        );
        return rows[0] ?? null;
    }

    async findByCategoryId(id: number): Promise<ProductResponse[] | null> {
        const { rows } = await pool.query(
            'SELECT * FROM products WHERE category_id = $1',
            [id]
        );
        return rows.length > 0 ? rows : null;
    }

    async findByName(name: string): Promise<ProductResponse[] | null> {
        const { rows } = await pool.query(
            'SELECT * FROM products WHERE name = $1',
            [name]
        );
        return rows.length > 0 ? rows : null;
    }

    async create(product_info: CreateProductBody): Promise<ProductResponse> {
        const { rows } = await pool.query(
            `INSERT INTO products (name, price, stock, category_id, description)
            VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [
                product_info.name,
                product_info.price,
                product_info.stock,
                product_info.category_id,
                product_info.description,
            ]
        );
        return rows[0];
    }

    async deleteById(id: number): Promise<boolean> {
        const { rowCount } = await pool.query(
            'DELETE FROM products WHERE id = $1',
            [id]
        );
        return (rowCount ?? 0) > 0;
    }

    async update(id: number, product: UpdateProductBody): Promise<ProductResponse | null> {
        // 1. Filter out undefined/null fields — only update provided values
        //    Whitelist keys to prevent SQL injection via column names
        const entries = Object.entries(product).filter(
            ([key, value]) =>
                value !== undefined &&
                value !== null &&
                ALLOWED_UPDATE_COLUMNS.has(key)
        );

        if (entries.length === 0) return null;

        // 2. Build parameterized SET clause: "col1" = $2, "col2" = $3, ...
        //    $1 is reserved for the id
        const setClauses = entries.map(([, _], i) => `"${entries[i][0]}" = $${i + 2}`);
        const values = entries.map(([, value]) => value);

        const queryString = `UPDATE products SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
        const { rows } = await pool.query(queryString, [id, ...values]);
        return rows[0] ?? null;
    }
}

export const productRepository = new ProductRepository();
