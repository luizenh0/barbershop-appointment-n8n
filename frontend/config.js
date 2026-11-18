// Auto-detecção de ambiente: se estiver rodando no GitHub Pages (HTTPS), ativa o MOCK inteligente
// para garantir que qualquer avaliador teste o chat sem depender de servidor n8n local ativo.
const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

window.APP_CONFIG = {
  SHOP_NAME: 'Barbearia',
  N8N_BASE_URL: 'http://localhost:5678/webhook',
  USE_MOCK: isGitHubPages || false,
  ENDPOINTS: {
    options: '/booking-options',
    availableSlots: '/available-slots',
    book: '/book-appointment',
    chat: '/agent-chat',
  },
  TIMEZONE: 'America/Sao_Paulo',
};
