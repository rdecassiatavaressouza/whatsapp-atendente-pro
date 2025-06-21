const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await pool.query(`
      SELECT phone, message, type, timestamp 
      FROM messages 
      ORDER BY timestamp DESC 
      LIMIT 50
    `);

    res.status(200).json({
      success: true,
      messages: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar mensagens:', error);
    res.status(500).json({ 
      error: 'Database error',
      message: error.message 
    });
  }
}
