import { pool } from '../src/config/db.js';
import bcrypt from 'bcrypt';

const email = process.argv[2] ?? 'admin@example.com';
const password = process.argv[3] ?? 'admin123';
const name = process.argv[4] ?? 'Admin';

async function setupRootAdmin() {
    try {
        const hashedPwd = await bcrypt.hash(password, await bcrypt.genSalt(10));
    
        const { rows } = await pool.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ($1, $2, $3, 'admin')
             ON CONFLICT (email) DO UPDATE SET role = 'admin'
             RETURNING id, name, email, role`,
            [name, email, hashedPwd]
        );
    
        console.log(`✅ Admin account ready:`);
        console.log(`   Email:    ${email}`);
        console.log(`   Password: ${password}`);
        console.log(`   Role:     ${rows[0].role}`);
    } catch (err) {
        console.error('❌ Failed to seed admin:', err);
    } finally {
        await pool.end();
    }
}

setupRootAdmin();