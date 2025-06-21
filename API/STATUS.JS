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

  try {
    // Testar conexão com banco
    const dbTest = await pool.query('SELECT NOW()');
    
    // Testar API DeepSeek
    const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
    
    // Contar mensagens
    const messageCount = await pool.query('SELECT COUNT(*) FROM messages');

    res.status(200).json({
      status: 'online',
      timestamp: new Date().toISOString(),
      database: 'connected',
      deepseek: hasDeepSeek ? 'configured' : 'missing',
      totalMessages: parseInt(messageCount.rows[0].count),
      uptime: process.uptime()
    });

  } catch (error) {
    console.error('❌ Erro no status:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
