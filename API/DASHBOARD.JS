export default async function handler(req, res) {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 WhatsApp Atendente Pro</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        header {
            text-align: center;
            margin-bottom: 30px;
            color: white;
        }

        header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }

        .card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }

        .card:hover {
            transform: translateY(-5px);
        }

        .card h2 {
            color: #333;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .status-online {
            color: #27ae60;
            font-weight: bold;
            padding: 15px;
            background: #d4edda;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .status-loading {
            color: #f39c12;
            font-weight: bold;
            padding: 15px;
            background: #fff3cd;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .test-form {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 15px;
        }

        .test-form input {
            flex: 1;
            min-width: 150px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }

        .test-btn {
            padding: 10px 20px;
            background: #25D366;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }

        .test-btn:hover {
            background: #128C7E;
        }

        .messages-list {
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid #eee;
            border-radius: 8px;
            padding: 10px;
            background: #fafafa;
        }

        .message-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
            margin-bottom: 10px;
        }

        .message-phone {
            font-weight: bold;
            color: #25D366;
        }

        .message-text {
            margin: 5px 0;
        }

        .message-time {
            font-size: 0.8rem;
            color: #666;
        }

        @media (max-width: 768px) {
            .dashboard {
                grid-template-columns: 1fr;
            }
            
            .test-form {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><i class="fab fa-whatsapp"></i> WhatsApp Atendente Pro</h1>
            <p>Sistema de Atendimento Automatizado com IA</p>
        </header>

        <div class="dashboard">
            <div class="card">
                <h2><i class="fas fa-heartbeat"></i> Status do Sistema</h2>
                <div id="status" class="status-loading">
                    <i class="fas fa-spinner fa-spin"></i> Verificando...
                </div>
                <div id="statusDetails"></div>
            </div>

            <div class="card">
                <h2><i class="fas fa-comments"></i> Últimas Conversas</h2>
                <div id="messagesList" class="messages-list">
                    <div>Carregando mensagens...</div>
                </div>
                <button onclick="loadMessages()" class="test-btn" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </button>
            </div>

            <div class="card">
                <h2><i class="fas fa-cog"></i> Teste de Webhook</h2>
                <p>Teste o sistema enviando uma mensagem:</p>
                <div class="test-form">
                    <input type="text" id="testPhone" placeholder="5511999999999" />
                    <input type="text" id="testMessage" placeholder="Olá, como você está?" />
                    <button onclick="testWebhook()" class="test-btn">
                        <i class="fas fa-paper-plane"></i> Testar
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Carregar status
        async function loadStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                const statusElement = document.getElementById('status');
                const statusDetails = document.getElementById('statusDetails');
                
                if (data.status === 'online') {
                    statusElement.className = 'status-online';
                    statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Sistema Online';
                    statusDetails.innerHTML = \`
                        <strong>Banco:</strong> \${data.database}<br>
                        <strong>IA:</strong> \${data.deepseek}<br>
                        <strong>Mensagens:</strong> \${data.totalMessages || 0}<br>
                        <strong>Última atualização:</strong> \${new Date(data.timestamp).toLocaleString()}
                    \`;
                } else {
                    statusElement.className = 'status-loading';
                    statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Verificando...';
                }
            } catch (error) {
                console.error('Erro ao carregar status:', error);
            }
        }

        // Carregar mensagens
        async function loadMessages() {
            try {
                const response = await fetch('/api/messages');
                const data = await response.json();
                
                const messagesList = document.getElementById('messagesList');
                
                if (data.success && data.messages.length > 0) {
                    messagesList.innerHTML = data.messages.slice(0, 10).map(msg => \`
                        <div class="message-item">
                            <div class="message-phone">\${msg.phone}</div>
                            <div class="message-text">\${msg.message}</div>
                            <div class="message-time">\${new Date(msg.timestamp).toLocaleString()}</div>
                        </div>
                    \`).join('');
                } else {
                    messagesList.innerHTML = '<div>Nenhuma mensagem encontrada</div>';
                }
            } catch (error) {
                messagesList.innerHTML = '<div>Erro ao carregar mensagens</div>';
            }
        }

        // Testar webhook
        async function testWebhook() {
            const phone = document.getElementById('testPhone').value;
            const message = document.getElementById('testMessage').value;
            
            if (!phone || !message) {
                alert('Preencha telefone e mensagem');
                return;
            }
            
            try {
                const response = await fetch('/api/webhook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: phone, message: message })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    alert(\`✅ Teste realizado!\\n\\nResposta: \${data.response}\`);
                    loadMessages();
                } else {
                    alert(\`❌ Erro: \${data.error}\`);
                }
            } catch (error) {
                alert('❌ Erro de conexão');
            }
        }

        // Inicializar
        document.addEventListener('DOMContentLoaded', function() {
            loadStatus();
            loadMessages();
            setInterval(loadStatus, 30000);
        });
    </script>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
