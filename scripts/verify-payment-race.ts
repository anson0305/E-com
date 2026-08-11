import { pool } from '../src/config/db.js';
import { PaymentRepository } from '../src/repositories/paymentRepository.js';

async function main() {
    const suffix = Date.now().toString();
    const emailA = `payment-race-a-${suffix}@test.local`;
    const emailB = `payment-race-b-${suffix}@test.local`;
    const repo = new PaymentRepository(pool);
    let userA = 0;
    let userB = 0;
    let productId = 0;

    try {
        userA = (await pool.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ('Race A', $1, 'test', 'customer') RETURNING id`,
            [emailA],
        )).rows[0].id;
        userB = (await pool.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ('Race B', $1, 'test', 'customer') RETURNING id`,
            [emailB],
        )).rows[0].id;
        productId = (await pool.query(
            `INSERT INTO products (name, description, price, stock, image_url, category)
             VALUES ($1, '', 10, 1, '', 0) RETURNING id`,
            [`Race Product ${suffix}`],
        )).rows[0].id;

        const cartA = (await pool.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING id', [userA])).rows[0].id;
        const cartB = (await pool.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING id', [userB])).rows[0].id;
        await pool.query(
            'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1), ($3, $2, 1)',
            [cartA, productId, cartB],
        );

        const attempts = await Promise.allSettled([
            repo.createOrGetReservedOrder(userA, `race-${suffix}-a`),
            repo.createOrGetReservedOrder(userB, `race-${suffix}-b`),
        ]);
        const successCount = attempts.filter(attempt => attempt.status === 'fulfilled').length;
        const stock = (await pool.query('SELECT stock FROM products WHERE id = $1', [productId])).rows[0].stock;

        if (successCount !== 1 || stock !== 0) {
            throw new Error(`race assertion failed: successes=${successCount}, stock=${stock}`);
        }
        console.log('PASS: two concurrent checkouts for stock=1 produced exactly one order and stock=0.');
    } finally {
        const userIds = [userA, userB].filter(Boolean);
        if (userIds.length > 0) {
            await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY($1::int[]))', [userIds]);
            await pool.query('DELETE FROM orders WHERE user_id = ANY($1::int[])', [userIds]);
            await pool.query('DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ANY($1::int[]))', [userIds]);
            await pool.query('DELETE FROM carts WHERE user_id = ANY($1::int[])', [userIds]);
        }
        if (productId) await pool.query('DELETE FROM products WHERE id = $1', [productId]);
        if (userIds.length > 0) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
        await pool.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
