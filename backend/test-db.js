const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function testDb() {
    try {
        console.log('Connecting to database...');
        const client = await pool.connect();
        console.log('Connected to database!');
        await client.query('BEGIN');
        await client.query('DELETE FROM otps WHERE email = $1', ['test@example.com']);
        await client.query('INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3)', [
            'test@example.com',
            '123456',
            new Date(Date.now() + 10 * 60 * 1000)
        ]);
        await client.query('COMMIT');
        console.log('Database queries successful!');
        const result = await client.query('SELECT * FROM otps');
        console.log('OTPs:', result.rows);
        client.release();
    } catch (error) {
        console.error('Database Error:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
    } finally {
        await pool.end();
    }
}

testDb();