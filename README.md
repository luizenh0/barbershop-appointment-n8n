# 💈 Sistema de Agendamento Online para Barbearia com n8n

Sistema moderno e completo de agendamento online para barbearias e salões, integrado via **n8n** com **Google Sheets** (gestão de barbeiros e serviços) e **Google Calendar** (consulta e reserva de horários em tempo real).

---

## 🚀 Funcionalidades

- **Escolha de Serviço Dinâmica:** Lista serviços, durações e preços direto da aba `Servicos` da planilha.
- **Múltiplos Barbeiros:** Suporte a barbeiros com agendas, dias da semana e horários de expediente personalizados.
- **Sem Preferência:** O cliente pode optar por qualquer profissional disponível. O sistema aloca automaticamente no primeiro barbeiro livre.
- **Disponibilidade em Tempo Real:** Consulta a agenda do Google Calendar de cada profissional e exibe apenas os horários livres.
- **Bloqueio de Folgas:** Eventos ou folgas criados na agenda do barbeiro bloqueiam os horários automaticamente.
- **Gravação Automática:** Cria o evento na agenda do profissional e gera comprovante com código de reserva.
- **Frontend Responsivo:** Interface moderna (dark theme com detalhes em dourado) adaptável para celulares e computadores.

---

## 📁 Estrutura do Projeto

```text
├── frontend/
│   ├── index.html       # Interface do cliente (5 passos intuitivos)
│   ├── styles.css       # Estilização moderna e responsiva
│   ├── app.js           # Lógica da aplicação e comunicação com n8n
│   └── config.js        # Configuração da URL do n8n e modo teste (MOCK)
├── workflow-completo-barbearia.json   # Fluxo n8n completo (Options, Slots e Booking)
└── README.md                          # Documentação do projeto
```

---

## 📊 Estrutura da Planilha Google (Google Sheets)

Crie uma planilha no Google Sheets com 3 abas obrigatórias:

### 1. Aba `Barbers`
| barber | calendarId | dias | inicio | fim | ativo |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Barbeiro 01 | seu-email@gmail.com | seg-sex | 09:00 | 18:00 | sim |
| Barbeiro 02 | outro-email@gmail.com | ter,qui,sab | 10:00 | 19:00 | sim |

### 2. Aba `Servicos`
| servico | duracao | preco | ativo |
| :--- | :--- | :--- | :--- |
| Corte Simples | 30 | 35 | sim |
| Barba | 30 | 30 | sim |
| Corte + Barba | 60 | 60 | sim |

### 3. Aba `Summary`
Cabeçalho para registro do histórico de reservas:
`Name` | `Number` | `Barber` | `Summary`

---

## ⚙️ Como Configurar o n8n

1. Importe o arquivo `workflow-completo-barbearia.json` no seu n8n.
2. Conecte as credenciais OAuth2:
   - **Google Sheets OAuth2 API**
   - **Google Calendar OAuth2 API**
3. Em cada nó do Google Sheets, selecione a sua planilha.
4. No nó do Google Calendar (`Get Barber Events of Day` e `Create Appointment in Calendar`), selecione a credencial do Calendar.
5. Ative o fluxo clicando em **Publish**.

---

## 🌐 Como Executar a Tela Frontend

1. Abra o arquivo `frontend/config.js` e configure a URL base do seu n8n:
   ```javascript
   N8N_BASE_URL: 'https://seu-n8n.com/webhook',
   USE_MOCK: false,
   ```
2. Abra o arquivo `frontend/index.html` em qualquer navegador ou hospede gratuitamente na **Vercel**, **Netlify** ou **GitHub Pages**!

