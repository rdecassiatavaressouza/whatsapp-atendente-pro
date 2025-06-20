const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Configuração PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

let qrCodeData = '';
let isClientReady = false;

// Configurações do negócio
const BUSINESS_CONFIG = {
  name: "IPTV Premium",
  owner_phone: process.env.OWNER_PHONE || "5511999999999@c.us",
  plans: {
    "1_tela": { "1_mes": 40, "3_meses": 105, "6_meses": 200, "12_meses": 380 },
    "2_telas": { "1_mes": 70, "3_meses": 180, "6_meses": 330, "12_meses": 600 }
  },
  features: [
    "Mais de 15.000 canais",
    "Qualidade HD/4K/8K", 
    "Filmes e séries atualizados",
    "Suporte técnico 24h"
  ]
};

// Inicializar banco
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        name VARCHAR(100),
        message TEXT NOT NULL,
        response TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_from_bot BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'lead',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Banco inicializado');
  } catch (error) {
    console.error('❌ Erro banco:', error);
  }
}

// Salvar conversa
async function saveConversation(phone, name, message, response, isFromBot = false) {
  try {
    await pool.query(
      'INSERT INTO conversations (phone, name, message, response, is_from_bot) VALUES ($1, $2, $3, $4, $5)',
      [phone, name, message, response, isFromBot]
    );

    await pool.query(`
      INSERT INTO customers (phone, name)
      VALUES ($1, $2)
      ON CONFLICT (phone) DO UPDATE SET name = $2
    `, [phone, name]);

  } catch (error) {
    console.error('❌ Erro ao salvar:', error);
  }
}

// IA Response
async function getAIResponse(message, customerName = 'Cliente') {
  try {
    const prompt = `
Você é um vendedor especializado em IPTV. Responda de forma amigável e profissional.

INFORMAÇÕES:
- Empresa: ${BUSINESS_CONFIG.name}
- Recursos: ${BUSINESS_CONFIG.features.join(', ')}
- Planos 1 tela: 1 mês R$40, 3 meses R$105, 6 meses R$200, 12 meses R$380
- Planos 2 telas: 1 mês R$70, 3 meses R$180, 6 meses R$330, 12 meses R$600
- Teste grátis: 6 horas disponível
- Pagamento: PIX, cartão, transferência

Cliente ${customerName} disse: "${message}"

Responda de forma natural, oferecendo teste grátis e explicando benefícios.
`;

    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    return `Olá ${customerName}! 😊\n\nObrigado por entrar em contato!\n\nTemos os melhores planos de IPTV com mais de 15.000 canais em HD/4K.\n\n🎯 Planos disponíveis:\n• 1 tela: R$40/mês\n• 2 telas: R$70/mês\n\n🆓 Teste grátis de 6 horas disponível!\n\nQuer conhecer melhor? 🚀`;
  }
}

// Eventos WhatsApp
client.on('qr', async (qr) => {
  console.log('📱 QR Code gerado');
  qrCodeData = qr;
});

client.on('ready', () => {
  console.log('✅ WhatsApp conectado!');
  isClientReady = true;
});

client.on('message', async (message) => {
  if (message.from === 'status@broadcast') return;
  
  const contact = await message.getContact();
  const customerName = contact.pushname || 'Cliente';
  const customerPhone = message.from;
  const messageBody = message.body;

  console.log(`📨 ${customerName}: ${messageBody}`);

  try {
    const aiResponse = await getAIResponse(messageBody, customerName);
    await message.reply(aiResponse);
    await saveConversation(customerPhone, customerName, messageBody, aiResponse, true);
  } catch (error) {
    console.error('❌ Erro:', error);
    await message.reply('Desculpe, tive um problema técnico. Pode repetir sua mensagem? 😊');
  }
});

// Rotas
app.get('/', (req, res) => {
  res.json({
    status: '✅ Online',
    service: 'WhatsApp IPTV Bot Pro',
    whatsapp: isClientReady ? 'Conectado' : 'Desconectado',
    features: ['Bot inteligente', 'Dashboard web', 'Banco PostgreSQL', '100% Nuvem']
  });
});

app.get('/qr', async (req, res) => {
  if (isClientReady) {
    res.send(`
      <div style="text-align: center; padding: 50px; font-family: Arial;">
        <h2>✅ WhatsApp Conectado!</h2>
        <p>Bot funcionando perfeitamente</p>
        <a href="/dashboard" style="background: #25D366; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 16px;">📊 Ver Dashboard</a>
      </div>
    `);
  } else if (qrCodeData) {
    const qrImage = await qrcode.toDataURL(qrCodeData);
    res.send(`
      <div style="text-align: center; padding: 20px; font-family: Arial;">
        <h2>📱 Escaneie o QR Code</h2>
        <img src="${qrImage}" style="max-width: 300px; border: 2px solid #25D366; border-radius: 15px;">
        <p>1. Abra WhatsApp no celular</p>
        <p>2. Toque em ⋮ → Aparelhos conectados</p>
        <p>3. Toque em "Conectar aparelho"</p>
        <p>4. Escaneie este código</p>
        <script>setTimeout(() => location.reload(), 5000);</script>
      </div>
    `);
  } else {
    res.send(`
      <div style="text-align: center; padding: 50px; font-family: Arial;">
        <h2>🔄 Inicializando...</h2>
        <p>Aguarde alguns segundos</p>
        <script>setTimeout(() => location.reload(), 3000);</script>
      </div>
    `);
  }
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/api/conversations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM conversations ORDER BY timestamp DESC LIMIT 50');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicializar
async function start() {
  await initDatabase();
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
  });

  console.log('🔄 Inicializando WhatsApp...');
  client.initialize();
}

start().catch(console.error);
