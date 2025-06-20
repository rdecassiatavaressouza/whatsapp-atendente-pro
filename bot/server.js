const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Configuração do banco PostgreSQL (Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Configuração do WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './sessions'
  }),
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

// Variáveis globais
let qrCodeData = '';
let isClientReady = false;
let clientInfo = null;

// Configurações do negócio
const BUSINESS_CONFIG = {
  name: "IPTV Premium",
  owner_phone: process.env.OWNER_PHONE || "5511999999999@c.us",
  business_hours: {
    start: 8,
    end: 22
  },
  plans: {
    "1_tela": {
      "1_mes": 40,
      "3_meses": 105,
      "6_meses": 200,
      "12_meses": 380
    },
    "2_telas": {
      "1_mes": 70,
      "3_meses": 180,
      "6_meses": 330,
      "12_meses": 600
    }
  },
  features: [
    "Mais de 15.000 canais",
    "Qualidade HD/4K/8K",
    "Filmes e séries atualizados",
    "Canais premium inclusos",
    "Suporte técnico 24h",
    "Funciona em qualquer dispositivo"
  ],
  payment_methods: ["PIX (5% desconto)", "Cartão de crédito", "Transferência bancária"],
  test_duration: "6 horas"
};

// Contexto da IA
const AI_CONTEXT = `
Você é um assistente especializado em vendas de IPTV. Seja sempre educado, prestativo e profissional.

INFORMAÇÕES DO SERVIÇO:
- Nome: ${BUSINESS_CONFIG.name}
- Recursos: ${BUSINESS_CONFIG.features.join(', ')}
- Teste grátis: ${BUSINESS_CONFIG.test_duration}
- Horário de atendimento: ${BUSINESS_CONFIG.business_hours.start}h às ${BUSINESS_CONFIG.business_hours.end}h

PLANOS E PREÇOS:
1 TELA: 1 mês R$${BUSINESS_CONFIG.plans["1_tela"]["1_mes"]}, 3 meses R$${BUSINESS_CONFIG.plans["1_tela"]["3_meses"]}, 6 meses R$${BUSINESS_CONFIG.plans["1_tela"]["6_meses"]}, 12 meses R$${BUSINESS_CONFIG.plans["1_tela"]["12_meses"]}
2 TELAS: 1 mês R$${BUSINESS_CONFIG.plans["2_telas"]["1_mes"]}, 3 meses R$${BUSINESS_CONFIG.plans["2_telas"]["3_meses"]}, 6 meses R$${BUSINESS_CONFIG.plans["2_telas"]["6_meses"]}, 12 meses R$${BUSINESS_CONFIG.plans["2_telas"]["12_meses"]}

PAGAMENTO: ${BUSINESS_CONFIG.payment_methods.join(', ')}

INSTRUÇÕES:
- Sempre responda de forma amigável
- Ofereça teste grátis para interessados
- Para problemas técnicos, diga que vai encaminhar para suporte especializado
- Não invente informações que não foram fornecidas
- Se não souber algo, seja honesto e diga que vai verificar
`;

// Inicialização do banco
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
        is_from_bot BOOLEAN DEFAULT false,
        needs_human BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'active'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100),
        email VARCHAR(100),
        status VARCHAR(20) DEFAULT 'lead',
        plan VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_stats (
        id SERIAL PRIMARY KEY,
        date DATE DEFAULT CURRENT_DATE,
        total_messages INTEGER DEFAULT 0,
        bot_responses INTEGER DEFAULT 0,
        human_escalations INTEGER DEFAULT 0,
        new_customers INTEGER DEFAULT 0
      )
    `);

    console.log('✅ Banco de dados inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  }
}

// Função para salvar conversa
async function saveConversation(phone, name, message, response, isFromBot = false, needsHuman = false) {
  try {
    await pool.query(
      'INSERT INTO conversations (phone, name, message, response, is_from_bot, needs_human) VALUES ($1, $2, $3, $4, $5, $6)',
      [phone, name, message, response, isFromBot, needsHuman]
    );

    // Atualizar ou criar cliente
    await pool.query(`
      INSERT INTO customers (phone, name, last_interaction)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (phone) 
      DO UPDATE SET name = $2, last_interaction = CURRENT_TIMESTAMP
    `, [phone, name]);

    // Atualizar estatísticas
    await pool.query(`
      INSERT INTO bot_stats (date, total_messages, bot_responses, human_escalations)
      VALUES (CURRENT_DATE, 1, $1, $2)
      ON CONFLICT (date)
      DO UPDATE SET 
        total_messages = bot_stats.total_messages + 1,
        bot_responses = bot_stats.bot_responses + $1,
        human_escalations = bot_stats.human_escalations + $2
    `, [isFromBot ? 1 : 0, needsHuman ? 1 : 0]);

  } catch (error) {
    console.error('❌ Erro ao salvar conversa:', error);
  }
}

// Função para chamar IA
async function getAIResponse(message, customerName = 'Cliente') {
  try {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: AI_CONTEXT
        },
        {
          role: "user",
          content: `Cliente ${customerName} disse: "${message}"`
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('❌ Erro na IA:', error);
    return `Olá ${customerName}! 😊\n\nObrigado por entrar em contato com a ${BUSINESS_CONFIG.name}!\n\nTemos os melhores planos de IPTV com mais de 15.000 canais em HD/4K.\n\n📱 Quer conhecer nossos planos ou fazer um teste grátis?\n\nEstou aqui para te ajudar! 🚀`;
  }
}

// Função para verificar se precisa escalação humana
function needsHumanEscalation(message) {
  const keywords = [
    'problema', 'erro', 'não funciona', 'travando', 'suporte', 'técnico',
    'cancelar', 'reclamação', 'insatisfeito', 'reembolso', 'gerente'
  ];
  
  return keywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );
}

// Eventos do WhatsApp
client.on('qr', async (qr) => {
  console.log('📱 QR Code gerado');
  qrCodeData = qr;
});

client.on('ready', async () => {
  console.log('✅ WhatsApp conectado!');
  isClientReady = true;
  clientInfo = client.info;
});

client.on('message', async (message) => {
  if (message.from === 'status@broadcast') return;
  if (message.from === clientInfo?.wid?._serialized) return;

  const contact = await message.getContact();
  const customerName = contact.pushname || contact.name || 'Cliente';
  const customerPhone = message.from;
  const messageBody = message.body;

  console.log(`📨 Mensagem de ${customerName}: ${messageBody}`);

  try {
    // Verificar se precisa escalação humana
    const needsHuman = needsHumanEscalation(messageBody);

    if (needsHuman) {
      // Escalação para humano
      const escalationMessage = `🔔 *ESCALAÇÃO NECESSÁRIA*\n\n👤 Cliente: ${customerName}\n📱 Telefone: ${customerPhone}\n💬 Mensagem: "${messageBody}"\n\n⚠️ Requer atendimento humano especializado.`;
      
      await client.sendMessage(BUSINESS_CONFIG.owner_phone, escalationMessage);
      
      const response = `Olá ${customerName}! 😊\n\nEntendi que você precisa de um atendimento mais especializado.\n\n👨‍💻 Já encaminhei sua solicitação para nossa equipe técnica que entrará em contato em breve.\n\n⏰ Tempo de resposta: até 30 minutos\n\nObrigado pela paciência! 🙏`;
      
      await message.reply(response);
      await saveConversation(customerPhone, customerName, messageBody, response, true, true);
    } else {
      // Resposta automática da IA
      const aiResponse = await getAIResponse(messageBody, customerName);
      await message.reply(aiResponse);
      await saveConversation(customerPhone, customerName, messageBody, aiResponse, true, false);
    }

  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
    const errorResponse = `Olá ${customerName}! 😊\n\nTive um pequeno problema técnico, mas já estou funcionando novamente!\n\nPode repetir sua mensagem? Estou aqui para te ajudar! 🚀`;
    await message.reply(errorResponse);
  }
});

client.on('disconnected', (reason) => {
  console.log('❌ WhatsApp desconectado:', reason);
  isClientReady = false;
  clientInfo = null;
});

// Rotas da API
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'WhatsApp IPTV Bot Pro',
    whatsapp_status: isClientReady ? 'connected' : 'disconnected',
    database: 'connected',
    features: [
      'Bot WhatsApp inteligente',
      'Dashboard web completo',
      'Banco PostgreSQL',
      'Sistema de escalação',
      'Métricas em tempo real',
      'Notificações automáticas'
    ]
  });
});

app.get('/qr', async (req, res) => {
  if (isClientReady) {
    res.send(`
      <div style="text-align: center; padding: 50px; font-family: Arial;">
        <h2>✅ WhatsApp já está conectado!</h2>
        <p>Bot funcionando normalmente</p>
        <a href="/dashboard" style="background: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ver Dashboard</a>
      </div>
    `);
  } else if (qrCodeData) {
    try {
      const qrImage = await qrcode.toDataURL(qrCodeData);
      res.send(`
        <div style="text-align: center; padding: 20px; font-family: Arial;">
          <h2>📱 Escaneie o QR Code</h2>
          <img src="${qrImage}" alt="QR Code" style="max-width: 300px;">
          <p>Abra o WhatsApp → Aparelhos conectados → Conectar aparelho</p>
          <script>setTimeout(() => location.reload(), 5000);</script>
        </div>
      `);
    } catch (error) {
      res.send('<h2>❌ Erro ao gerar QR Code</h2>');
    }
  } else {
    res.send(`
      <div style="text-align: center; padding: 50px; font-family: Arial;">
        <h2>🔄 Inicializando WhatsApp...</h2>
        <p>Aguarde alguns segundos</p>
        <script>setTimeout(() => location.reload(), 3000);</script>
      </div>
    `);
  }
});

app.get('/status', async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COALESCE(SUM(total_messages), 0) as total_messages,
        COALESCE(SUM(bot_responses), 0) as bot_responses,
        COALESCE(SUM(human_escalations), 0) as human_escalations
      FROM bot_stats 
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
    `);

    const customersResult = await pool.query('SELECT COUNT(*) as total FROM customers');

    res.json({
      whatsapp: {
        connected: isClientReady,
        phone: clientInfo?.wid?.user || 'N/A'
      },
      database: {
        status: 'connected',
        total_customers: parseInt(customersResult.rows[0].total)
      },
      stats_7_days: {
        total_messages: parseInt(statsResult.rows[0].total_messages),
        bot_responses: parseInt(statsResult.rows[0].bot_responses),
        human_escalations: parseInt(statsResult.rows[0].human_escalations)
      },
      config: {
        business_name: BUSINESS_CONFIG.name,
        owner_phone: BUSINESS_CONFIG.owner_phone,
        ai_enabled: !!process.env.DEEPSEEK_API_KEY
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// API para dashboard
app.get('/api/conversations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, cu.name as customer_name, cu.status as customer_status
      FROM conversations c
      LEFT JOIN customers cu ON c.phone = cu.phone
      ORDER BY c.timestamp DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, 
        (SELECT COUNT(*) FROM conversations WHERE phone = customers.phone) as message_count
      FROM customers 
      ORDER BY last_interaction DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const dailyStats = await pool.query(`
      SELECT date, total_messages, bot_responses, human_escalations
      FROM bot_stats
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY date DESC
    `);

    const totalStats = await pool.query(`
      SELECT 
        COALESCE(SUM(total_messages), 0) as total_messages,
        COALESCE(SUM(bot_responses), 0) as bot_responses,
        COALESCE(SUM(human_escalations), 0) as human_escalations,
        COUNT(DISTINCT date) as active_days
      FROM bot_stats
    `);

    res.json({
      daily: dailyStats.rows,
      totals: totalStats.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicializar aplicação
async function startApp() {
  await initDatabase();
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
  });

  console.log('🔄 Inicializando WhatsApp...');
  client.initialize();
}

startApp().catch(console.error);
