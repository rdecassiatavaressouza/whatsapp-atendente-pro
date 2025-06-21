const axios = require('axios');
const { Pool } = require('pg');

// Configuração do banco
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Função para resposta da IA
async function getAIResponse(message) {
  try {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Você é um atendente virtual prestativo e educado.'
        },
        {
          role: 'user',
          content: message
        }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Erro na IA:', error);
    return 'Desculpe, não consegui processar sua mensagem no momento.';
  }
}

// Função para enviar mensagem WhatsApp
async function sendWhatsAppMessage(to, message) {
  try {
    // Aqui você usará a API do WhatsApp Business
    // Por enquanto, vamos simular
    console.log(`Enviando para ${to}: ${message}`);
    return true;
  } catch (error) {
    console.error('Erro ao enviar:', error);
    return false;
  }
}

// Handler principal
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { from, message } = req.body;

    // Salvar mensagem recebida
    await pool.query(
      'INSERT INTO messages (phone, message, type, timestamp) VALUES ($1, $2, $3, NOW())',
      [from, message, 'received']
    );

    // Gerar resposta da IA
    const aiResponse = await getAIResponse(message);

    // Enviar resposta
    await sendWhatsAppMessage(from, aiResponse);

    // Salvar resposta enviada
    await pool.query(
      'INSERT INTO messages (phone, message, type, timestamp) VALUES ($1, $2, $3, NOW())',
      [from, aiResponse, 'sent']
    );

    res.status(200).json({ 
      success: true, 
      response: aiResponse 
    });

  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
