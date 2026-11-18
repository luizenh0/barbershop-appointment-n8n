# 📸 Guia de Capturas de Tela do Projeto

Coloque nesta pasta (`docs/screenshots/`) os arquivos de imagem com os nomes listados abaixo. Eles já estão vinculados e aparecerão automaticamente no `README.md` e na `DOCUMENTACAO_PROJETO.md`:

### 📱 Parte 1: Jornada do Cliente no Frontend (3 Prints Sequenciais)

| Arquivo | Etapa | O que capturar na tela |
| :--- | :--- | :--- |
| `01-frontend-servicos.png` | **Etapa 1: Boas-vindas e Serviços** | Mensagem inicial de boas-vindas e o menu listando os serviços disponíveis com durações e preços. |
| `02-frontend-datas-horarios.png` | **Etapa 2: Barbeiro, Dias Úteis e Horários** | Escolha do profissional, exibição dos **5 dias úteis** de atendimento (pulando folgas/fins de semana) e os horários livres. |
| `03-frontend-confirmacao.png` | **Etapa 3: Nome e Comprovante Final** | Digitação do nome do cliente e a mensagem final de confirmação com resumo e o Código da Reserva `#IMP-XXXX`. |

---

### ⚙️ Parte 2: Backend, Integrações e IA (5 Prints Técnicos)

| Arquivo | Componente | O que capturar na tela |
| :--- | :--- | :--- |
| `04-n8n-workflow.png` | **Orquestrador n8n** | Visão geral panorâmica do fluxo completo no n8n com os 38 nós e os 4 fluxos conectados. |
| `05-n8n-gemini-prompt.png` | **LangChain / Gemini 1.5** | O nó `Gemini Conversational Agent` ou o nó de código `Format Agent Input` mostrando a injeção contextual da planilha no prompt. |
| `06-google-calendar.png` | **Google Calendar** | A grade da agenda do Google mostrando o evento criado no dia e horário exatos da reserva. |
| `07-google-sheets-summary.png` | **Google Sheets (`summary`)** | A aba `summary` mostrando as colunas preenchidas (`status`, `barber`, `name`, `service`, `startTime`, `endTime`, `summary`). |
| `08-google-sheets-ultimas-reservas.png` | **Google Sheets (`Últimas Reservas`)** | A aba `Últimas Reservas` mostrando a barra de fórmula com `=LET(...)` e a tabela espelhada com a última reserva na linha 2 com Data e Hora separadas. |
