const axios = require('axios');
const { Pool } = require('pg');

// Configuração do banco
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Inicializar banco
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(50),
        message TEXT,
        type VARCHAR(20),
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Banco inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  }
}

// Função para resposta da IA
async function getAIResponse(message, phone) {
  try {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `Você é um atendente virtual prestativo e educado. 
          Responda de forma natural e amigável. 
          Mantenha as respostas concisas e úteis.
          Cliente: ${phone}`
        },
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('❌ Erro na IA:', error.message);
    return 'Olá! Obrigado por entrar em contato. Como posso ajudá-lo hoje?';
  }
}

// Função para enviar mensagem WhatsApp
async function sendWhatsAppMessage(to, message) {
  try {
    // Simulação - substituir pela API real do WhatsApp Business
    console.log(`📱 Enviando para ${to}: ${message}`);
    
    // Aqui você colocará a integração real com WhatsApp Business API
    // const response = await axios.post('https://graph.facebook.com/v18.0/YOUR_PHONE_ID/messages', {
    //   messaging_product: 'whatsapp',
    //   to: to,
    //   text: { body: message }
    // }, {
    //   headers: {
    //     'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
    //     'Content-Type': 'application/json'
    //   }
    // });
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar WhatsApp:', error);
    return false;
  }
}

// Handler principal
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'WhatsApp Bot Online',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Inicializar banco na primeira execução
    await initDatabase();

    const { from, message, type = 'webhook' } = req.body;

    if (!from || !message) {
      return res.status(400).json({ error: 'Missing from or message' });
    }

    console.log(`📨 Mensagem recebida de ${from}: ${message}`);

    // Salvar mensagem recebida
    await pool.query(
      'INSERT INTO messages (phone, message, type, timestamp) VALUES ($1, $2, $3, NOW())',
      [from, message, 'received']
    );

    // Gerar resposta da IA
    const aiResponse = await getAIResponse(message, from);

    // Enviar resposta (simulado por enquanto)
    const sent = await sendWhatsAppMessage(from, aiResponse);

    if (sent) {
      // Salvar resposta enviada
      await pool.query(
        'INSERT INTO messages (phone, message, type, timestamp) VALUES ($1, $2, $3, NOW())',
        [from, aiResponse, 'sent']
      );
    }

    res.status(200).json({ 
      success: true, 
      response: aiResponse,
      sent: sent
    });

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
