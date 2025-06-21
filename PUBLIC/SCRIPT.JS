// Estado da aplicação
let isLoading = false;

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 WhatsApp Atendente Pro iniciado');
    loadStatus();
    loadMessages();
    
    // Atualizar a cada 30 segundos
    setInterval(() => {
        loadStatus();
        loadMessages();
    }, 30000);
});

// Carregar status do sistema
async function loadStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        const statusElement = document.getElementById('status');
        const statusDetails = document.getElementById('statusDetails');
        const totalMessages = document.getElementById('totalMessages');
        const uptime = document.getElementById('uptime');
        
        if (data.status === 'online') {
            statusElement.className = 'status-online';
            statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Sistema Online';
            
            statusDetails.innerHTML = `
                <strong>Banco:</strong> ${data.database}<br>
                <strong>IA:</strong> ${data.deepseek}<br>
                <strong>Última atualização:</strong> ${new Date(data.timestamp).toLocaleString()}
            `;
            
            totalMessages.textContent = data.totalMessages || 0;
            uptime.textContent = formatUptime(data.uptime);
            
        } else {
            statusElement.className = 'status-offline';
            statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Sistema Offline';
            statusDetails.innerHTML = `<strong>Erro:</strong> ${data.error}`;
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar status:', error);
        const statusElement = document.getElementById('status');
        statusElement.className = 'status-offline';
        statusElement.innerHTML = '<i class="fas fa-times-circle"></i> Erro de Conexão';
    }
}

// Carregar mensagens
async function loadMessages() {
    if (isLoading) return;
    isLoading = true;
    
    try {
        const response = await fetch('/api/messages');
        const data = await response.json();
        
        const messagesList = document.getElementById('messagesList');
        
        if (data.success && data.messages.length > 0) {
            messagesList.innerHTML = data.messages.map(msg => `
                <div class="message-item">
                    <div class="message-content">
                        <div class="message-phone">${msg.phone}</div>
                        <div class="message-text">${msg.message}</div>
                        <div class="message-time">${new Date(msg.timestamp).toLocaleString()}</div>
                    </div>
                    <div class="message-type ${msg.type}">${msg.type}</div>
                </div>
            `).join('');
        } else {
            messagesList.innerHTML = '<div class="loading">Nenhuma mensagem encontrada</div>';
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar mensagens:', error);
        document.getElementById('messagesList').innerHTML = 
            '<div class="loading">Erro ao carregar mensagens</div>';
    }
    
    isLoading = false;
}

// Testar webhook
async function testWebhook() {
    const phone = document.getElementById('testPhone').value;
    const message = document.getElementById('testMessage').value;
    
    if (!phone || !message) {
        alert('Por favor, preencha telefone e mensagem');
        return;
    }
    
    try {
        const response = await fetch('/api/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: phone,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`✅ Teste realizado com sucesso!\n\nResposta da IA: ${data.response}`);
            loadMessages(); // Recarregar mensagens
        } else {
            alert(`❌ Erro no teste: ${data.error}`);
        }
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        alert('❌ Erro de conexão no teste');
    }
}

// Formatar tempo de atividade
function formatUptime(seconds) {
    if (!seconds) return '-';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

// Função para atualizar mensagens (chamada pelo botão)
window.loadMessages = loadMessages;
window.testWebhook = testWebhook;
