(function () {
  const CFG = window.APP_CONFIG || {
    N8N_BASE_URL: 'http://localhost:5678/webhook',
    USE_MOCK: false,
    TIMEZONE: 'America/Sao_Paulo',
    ENDPOINTS: {
      options: '/booking-options',
      availableSlots: '/available-slots',
      book: '/book-appointment',
      chat: '/agent-chat'
    }
  };

  const sessionId = 'session_' + Math.random().toString(36).slice(2, 10);
  const messagesContainer = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const contactStatus = document.getElementById('contactStatus');
  const quickChips = document.getElementById('quickChips');

  let isWaiting = false;
  let optionsCache = null;

  function getEndpointUrl(key, fallbackPath) {
    const path = (CFG.ENDPOINTS && CFG.ENDPOINTS[key]) ? CFG.ENDPOINTS[key] : fallbackPath;
    return CFG.N8N_BASE_URL + path;
  }

  // Formata hora atual no estilo WhatsApp (ex: 14:32)
  function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // Rola até o fim da conversa
  function scrollToBottom() {
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
  }

  // Formata a sintaxe de texto do WhatsApp (*negrito*, _itálico_, ~tachado~, `código`)
  function formatWhatsAppText(rawText) {
    if (!rawText) return '';
    const escaped = String(rawText)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped
      .replace(/\*([^\*\n\r]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n\r]+)_/g, '<em>$1</em>')
      .replace(/~([^~\n\r]+)~/g, '<del>$1</del>')
      .replace(/`([^`\n\r]+)`/g, '<code>$1</code>');
  }

  // Renderiza bolha de mensagem do usuário (Outgoing)
  function appendUserMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble message-outgoing';

    const textSpan = document.createElement('span');
    textSpan.innerHTML = formatWhatsAppText(text);
    bubble.appendChild(textSpan);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = `<span class="msg-time">${getCurrentTime()}</span><span class="check-icon">✓✓</span>`;
    bubble.appendChild(meta);

    messagesContainer.appendChild(bubble);
    scrollToBottom();
  }

  // Renderiza bolha de mensagem do agente (Incoming)
  function appendAgentMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble message-incoming';

    const textSpan = document.createElement('span');
    textSpan.innerHTML = formatWhatsAppText(text);
    bubble.appendChild(textSpan);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = `<span class="msg-time">${getCurrentTime()}</span>`;
    bubble.appendChild(meta);

    messagesContainer.appendChild(bubble);
    scrollToBottom();
  }

  // Indicador de "digitando..."
  let typingBubble = null;
  function showTyping() {
    contactStatus.textContent = 'digitando...';
    contactStatus.classList.add('typing');

    typingBubble = document.createElement('div');
    typingBubble.className = 'typing-bubble';
    typingBubble.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    messagesContainer.appendChild(typingBubble);
    scrollToBottom();
  }

  function hideTyping() {
    contactStatus.textContent = 'online • Concierge IA';
    contactStatus.classList.remove('typing');
    if (typingBubble && typingBubble.parentNode) {
      typingBubble.parentNode.removeChild(typingBubble);
      typingBubble = null;
    }
  }

  // Estado da conversa: MENU -> SERVICE -> BARBER -> DATE -> SLOT -> NAME -> CONFIRMED
  const flowState = {
    step: 'MENU',
    service: null,
    barber: null,
    assignedBarber: null,
    date: null,
    availableDays: [],
    availableSlots: [],
    selectedSlot: null,
    slot: null,
    name: null
  };

  let currentOptions = {};

  function resetFlowState() {
    flowState.step = 'MENU';
    flowState.service = null;
    flowState.barber = null;
    flowState.assignedBarber = null;
    flowState.date = null;
    flowState.availableDays = [];
    flowState.availableSlots = [];
    flowState.selectedSlot = null;
    flowState.slot = null;
    flowState.name = null;
    currentOptions = {};
  }

  function updateQuickChips(chips) {
    if (!quickChips) return;
    quickChips.innerHTML = '';
    chips.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'chip-btn';
      btn.dataset.text = c.value;
      btn.textContent = c.label;
      quickChips.appendChild(btn);
    });
  }

  function setMenuChips() {
    updateQuickChips([
      { value: '1', label: '1️⃣ Consultar Serviços' },
      { value: '2', label: '2️⃣ Ver Horários' },
      { value: '3', label: '3️⃣ Agendar Horário' }
    ]);
  }

  // Extrai dinamicamente opções numeradas [1], [2], [3] da resposta do bot
  function extractChipsFromMessage(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const found = [];
    const re = /^\[(\d+)\]\s*\*?([^\*\n\r—\(]+?)\*?(?:\s*—|\s*\(|$)/;
    currentOptions = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\[\d+\]/.test(trimmed)) {
        const match = trimmed.match(re);
        if (match) {
          const num = match[1];
          let label = match[2].trim().replace(/^[*\s]+|[*\s]+$/g, '');
          currentOptions[num] = label;
          if (label.length > 22) label = label.substring(0, 20) + '...';
          found.push({ value: num, label: `${num}️⃣ ${label}` });
        }
      }
    }
    return found.length >= 2 ? found : null;
  }

  async function loadBookingOptions() {
    if (optionsCache) return optionsCache;
    if (CFG.USE_MOCK) return null;
    try {
      const res = await fetch(getEndpointUrl('options', '/booking-options'));
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'ok') {
          optionsCache = data;
          return data;
        }
      }
    } catch (e) {
      console.warn('Não foi possível carregar /booking-options:', e);
    }
    return null;
  }

  function getTz() {
    return (optionsCache && optionsCache.timezone) || CFG.TIMEZONE || 'America/Sao_Paulo';
  }

  // Identifica os dias da semana em que o barbeiro atende (1 = seg ... 7 = dom)
  function getBarberWorkingDays(chosenBarber) {
    const norm = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isAny = !chosenBarber || norm(chosenBarber).includes('sem preferencia') || norm(chosenBarber) === 'any';

    if (optionsCache && Array.isArray(optionsCache.barbers) && optionsCache.barbers.length > 0) {
      if (isAny) {
        const union = new Set();
        optionsCache.barbers.forEach((b) => {
          if (Array.isArray(b.days)) {
            b.days.forEach((d) => union.add(Number(d)));
          }
        });
        if (union.size > 0) return Array.from(union).sort((a, b) => a - b);
      } else {
        const found = optionsCache.barbers.find((b) => norm(b.name) === norm(chosenBarber));
        if (found && Array.isArray(found.days) && found.days.length > 0) {
          return found.days.map(Number);
        }
      }
    }
    // Padrão da barbearia: segunda a sexta [1, 2, 3, 4, 5]
    return [1, 2, 3, 4, 5];
  }

  // Gera os 5 próximos dias ÚTEIS de atendimento do barbeiro (pula dias de folga como sáb/dom)
  function getNextAvailableDays(chosenBarber, count = 5) {
    const tz = getTz();
    const workingDays = getBarberWorkingDays(chosenBarber);
    const list = [];
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour').value, 10);
    // Se já passou das 18h no fuso do estabelecimento, começa a partir de amanhã
    const startOffset = hour >= 18 ? 1 : 0;

    for (let offset = startOffset; list.length < count && offset < 40; offset++) {
      const target = new Date(now.getTime() + offset * 86400000);
      const ymdParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(target);

      const get = (t) => ymdParts.find((p) => p.type === t).value;
      const ymd = `${get('year')}-${get('month')}-${get('day')}`;

      const [y, mo, da] = ymd.split('-').map(Number);
      const utcDate = new Date(Date.UTC(y, mo - 1, da));
      const jsDay = utcDate.getUTCDay(); // 0 = Dom, 1 = Seg ... 6 = Sáb
      const isoWeekday = jsDay === 0 ? 7 : jsDay;

      // Pula dias em que o profissional NÃO atende
      if (!workingDays.includes(isoWeekday)) {
        continue;
      }

      const weekday = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'UTC',
        weekday: 'long'
      }).format(utcDate);
      const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

      const prefix = offset === 0 ? 'Hoje - ' : (offset === 1 ? 'Amanhã - ' : '');
      const label = `${prefix}${capitalizedWeekday} (${get('day')}/${get('month')})`;
      const shortLabel = `${offset === 0 ? 'Hoje' : capitalizedWeekday.split('-')[0]} (${get('day')}/${get('month')})`;

      list.push({
        num: String(list.length + 1),
        ymd,
        label,
        shortLabel,
        isoWeekday
      });
    }
    return list;
  }

  // Analisa uma data digitada pelo usuário (ex: "25/11", "25/11/2026", "2026-11-25")
  function parseUserDate(input) {
    const raw = String(input || '').trim();
    const clean = raw.replace(/\s+/g, '').replace(/[^\d\/-]/g, '');
    const now = new Date();
    const nowYear = now.getFullYear();

    // 1. DD/MM/YYYY ou DD-MM-YYYY
    let m = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (m) {
      const d = String(m[1]).padStart(2, '0');
      const mo = String(m[2]).padStart(2, '0');
      const y = m[3];
      return `${y}-${mo}-${d}`;
    }

    // 2. DD/MM ou DD-MM (assume ano atual)
    m = clean.match(/^(\d{1,2})[\/-](\d{1,2})$/);
    if (m) {
      const d = String(m[1]).padStart(2, '0');
      const mo = String(m[2]).padStart(2, '0');
      return `${nowYear}-${mo}-${d}`;
    }

    // 3. YYYY-MM-DD
    m = clean.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (m) {
      const y = m[1];
      const mo = String(m[2]).padStart(2, '0');
      const d = String(m[3]).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }

    return null;
  }

  function formatYmdBr(ymd) {
    if (!ymd) return 'amanhã';
    const [y, m, d] = ymd.split('-').map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit'
    }).format(utcDate);
  }

  async function querySlotsForBarberOnDate(ymd, barberName, serviceName) {
    const res = await fetch(getEndpointUrl('availableSlots', '/available-slots'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: ymd,
        barber: barberName,
        service: serviceName || 'Corte Simples'
      })
    });
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    return res.json();
  }

  // Busca horários REAIS disponíveis para a data e barbeiro especificados
  async function fetchRealAvailableSlots(ymd, chosenBarber, serviceName) {
    const opts = await loadBookingOptions();
    const norm = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isAny = norm(chosenBarber).includes('sem preferencia') || norm(chosenBarber) === 'any';

    if (isAny) {
      const barberNames = (opts && Array.isArray(opts.barbers) && opts.barbers.length)
        ? opts.barbers.map((b) => b.name)
        : ['Juvenal'];

      const results = await Promise.all(
        barberNames.map(async (bName) => {
          try {
            const data = await querySlotsForBarberOnDate(ymd, bName, serviceName);
            return { bName, data };
          } catch (e) {
            return { bName, data: null };
          }
        })
      );

      const byLabel = new Map();
      for (const { bName, data } of results) {
        if (data && data.status === 'ok' && Array.isArray(data.slots)) {
          for (const s of data.slots) {
            if (!byLabel.has(s.label)) {
              byLabel.set(s.label, {
                startTime: s.startTime,
                endTime: s.endTime,
                label: s.label,
                assignedBarber: (Array.isArray(s.barbers) && s.barbers[0]) || bName
              });
            }
          }
        }
      }

      const merged = Array.from(byLabel.values()).sort((a, b) => a.label.localeCompare(b.label));
      return { date: ymd, slots: merged };
    }

    const data = await querySlotsForBarberOnDate(ymd, chosenBarber, serviceName);
    if (data.status === 'system_error') {
      return { error: data.message || `Não foi possível acessar a agenda de ${chosenBarber}.` };
    }
    if (data.status === 'barber_not_found') {
      return { error: `Barbeiro "${chosenBarber}" não encontrado na planilha.` };
    }
    if (data.status === 'ok' && Array.isArray(data.slots)) {
      return {
        date: ymd,
        slots: data.slots.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label,
          assignedBarber: (Array.isArray(s.barbers) && s.barbers[0]) || chosenBarber
        }))
      };
    }

    return { date: ymd, slots: [] };
  }

  function buildDatesMessage(barberLabel, days) {
    const lines = days.map((d) => `[${d.num}] *${d.label}*`).join('\n');
    return `Perfeito! Profissional selecionado: *${barberLabel}* 🧔\n\n📅 *Escolha a data do seu atendimento:*\n\n${lines}\n\nDigite o *número do dia* desejado ou digite outra data (ex: 25/11 ou DD/MM/AAAA):`;
  }

  function buildSlotsMessage(barberLabel, ymd, slots) {
    const lines = slots.map((s, idx) => `[${idx + 1}] *${s.label}*`).join('\n');
    return `Ótimo! Para *${formatYmdBr(ymd)}* com *${barberLabel}*, estes são os horários disponíveis:\n\n${lines}\n\nDigite o *número do horário* que você prefere:`;
  }

  function formatBarbersListMessage(opts, chosenService) {
    const DAY_NAMES = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sáb', 7: 'dom' };
    const defaultBarbers = [
      { name: 'Juvenal', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
      { name: 'Melk', days: [1, 2, 3, 4, 5], start: '10:00', end: '19:00' },
      { name: 'Zoomp', days: [1, 2, 3, 4, 5], start: '13:00', end: '20:00' }
    ];
    const barbers = (opts && Array.isArray(opts.barbers) && opts.barbers.length > 0) ? opts.barbers : defaultBarbers;

    const listLines = barbers.map((b, i) => {
      const days = Array.isArray(b.days) ? b.days.map((d) => DAY_NAMES[d] || d).join(', ') : 'seg-sex';
      return `[${i + 1}] *${b.name}* (Atende ${days}, ${b.start} às ${b.end})`;
    });
    listLines.push(`[${barbers.length + 1}] *Sem preferência* (Primeiro disponível)`);

    const intro = chosenService
      ? `Ótima escolha! Você selecionou *${chosenService}*. 💈\n\nAgora escolha o profissional que irá te atender:`
      : `📅 *Horários Disponíveis:*\nPara consultar a agenda, escolha o profissional que irá te atender:`;
    return `${intro}\n\n${listLines.join('\n')}\n\nDigite o *número do barbeiro*:`;
  }

  function formatServicesListMessage(opts) {
    const defaultServices = [
      { name: 'Corte Simples', duration: 30, price: 50 },
      { name: 'Barba', duration: 30, price: 30 },
      { name: 'Corte + Barba', duration: 60, price: 60 },
      { name: 'Pezinho / Acabamento', duration: 15, price: 15 }
    ];
    const services = (opts && Array.isArray(opts.services) && opts.services.length > 0) ? opts.services : defaultServices;

    const listLines = services.map((s, i) => {
      const priceStr = typeof s.price === 'number' ? `R$ ${s.price}` : (s.price ? `R$ ${s.price}` : '');
      const durStr = s.duration ? `(${s.duration} min)` : '';
      return `[${i + 1}] *${s.name}* — ${priceStr} ${durStr}`.trim();
    });

    return `✂️ *Nossos Serviços:*\n\n${listLines.join('\n')}\n\nDigite o *número do serviço* que você deseja agendar:`;
  }

  // Resposta Mock Inteligente para testes offline / GitHub Pages
  async function mockAgentResponse(input) {
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 200));
    const raw = input.trim();
    const txt = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (txt === '0' || txt.includes('inicio') || txt.includes('menu') || txt.includes('recomecar')) {
      resetFlowState();
      setMenuChips();
      return `Olá! Seja bem-vindo à *Barbearia Imperial*. 💈✂️\n\nEu sou o seu *Concierge Virtual com IA*. Digite o número da opção desejada:\n\n[1] Consultar nossos serviços e tabela de preços\n[2] Ver os horários disponíveis com nossos barbeiros\n[3] Realizar ou confirmar seu agendamento\n\nComo posso te ajudar hoje?`;
    }

    if (flowState.step === 'MENU') {
      if (txt === '1' || txt.includes('servico') || txt.includes('preco') || txt === '3' || txt.includes('agendar')) {
        flowState.step = 'SERVICE';
        return formatServicesListMessage(optionsCache);
      }

      if (txt === '2' || txt.includes('horario')) {
        flowState.step = 'BARBER';
        flowState.service = 'Corte Simples';
        return formatBarbersListMessage(optionsCache, null);
      }

      setMenuChips();
      return `Olá! Digite o número da opção desejada:\n\n[1] Consultar serviços e tabela de preços\n[2] Ver os horários disponíveis com nossos barbeiros\n[3] Realizar ou confirmar seu agendamento`;
    }

    if (flowState.step === 'SERVICE') {
      flowState.service = currentOptions[raw] || (txt === '2' ? 'Barba' : txt === '3' ? 'Corte + Barba' : 'Corte Simples');
      flowState.step = 'BARBER';
      return formatBarbersListMessage(optionsCache, flowState.service);
    }

    if (flowState.step === 'BARBER') {
      const chosen = currentOptions[raw] || (txt === '2' ? 'Melk' : txt === '3' ? 'Zoomp' : txt === '4' ? 'Sem preferência' : 'Juvenal');
      flowState.barber = chosen;
      flowState.assignedBarber = chosen.includes('Sem') ? 'Juvenal' : chosen;
      flowState.availableDays = getNextAvailableDays(flowState.barber, 5);
      flowState.step = 'DATE';
      return buildDatesMessage(flowState.barber, flowState.availableDays);
    }

    if (flowState.step === 'DATE') {
      const matchedDay = flowState.availableDays.find((d) => d.num === raw);
      const parsedYmd = matchedDay ? matchedDay.ymd : parseUserDate(raw);

      if (!parsedYmd) {
        return `⚠️ Formato de data não reconhecido. Por favor escolha um dos números de 1 a 5 ou digite a data no formato DD/MM (ex: 25/11):\n\n${buildDatesMessage(flowState.barber, flowState.availableDays)}`;
      }

      flowState.date = parsedYmd;
      flowState.availableSlots = ['09:00', '10:00', '11:30', '14:00', '15:30', '16:30'].map((l) => ({
        label: l,
        startTime: `${parsedYmd}T${l}:00-03:00`,
        endTime: `${parsedYmd}T${l}:30-03:00`,
        assignedBarber: flowState.assignedBarber
      }));
      flowState.step = 'SLOT';
      return buildSlotsMessage(flowState.barber, flowState.date, flowState.availableSlots);
    }

    if (flowState.step === 'SLOT') {
      const idx = parseInt(raw, 10) - 1;
      const chosenSlot = (idx >= 0 && flowState.availableSlots[idx]) || flowState.availableSlots.find((s) => s.label === raw) || flowState.availableSlots[0];
      flowState.selectedSlot = chosenSlot;
      flowState.slot = chosenSlot ? chosenSlot.label : '10:00';
      flowState.step = 'NAME';
      updateQuickChips([{ value: '0', label: '↩️ Cancelar / Recomeçar' }]);
      return `Excelente! Horário selecionado: *${flowState.slot}* (${formatYmdBr(flowState.date)}) com *${flowState.assignedBarber}* ⏰\n\nPara confirmarmos sua reserva na agenda, por favor digite seu *Nome completo*:`;
    }

    if (flowState.step === 'NAME') {
      flowState.name = raw;
      flowState.step = 'CONFIRMED';
      const code = '#IMP-' + Math.floor(1000 + Math.random() * 9000);
      updateQuickChips([{ value: '0', label: '💈 Fazer Outro Agendamento' }]);
      return `💈 *Agendamento Confirmado com Sucesso!* 🎉\n\n📍 *Resumo da Reserva:*\n• *Cliente:* ${flowState.name}\n• *Serviço:* ${flowState.service || 'Corte Simples'}\n• *Barbeiro:* ${flowState.assignedBarber || flowState.barber || 'Juvenal'}\n• *Quando:* ${formatYmdBr(flowState.date)} às ${flowState.slot || '10:00'}\n• *Código da Reserva:* ${code}\n\nDigite *[0]* se desejar fazer outro agendamento.`;
    }

    resetFlowState();
    setMenuChips();
    return `Olá! Deseja realizar um novo agendamento?\n\n[1] Consultar serviços e tabela de preços\n[2] Ver horários livres dos barbeiros\n[3] Fazer agendamento`;
  }

  async function callAgentChat(messageText) {
    const res = await fetch(getEndpointUrl('chat', '/agent-chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageText, sessionId: sessionId })
    });
    if (!res.ok) {
      throw new Error('Erro na resposta do n8n: ' + res.status);
    }
    const data = await res.json();
    return data.response || data.output || data.text || 'Mensagem recebida!';
  }

  // Envio de mensagem principal
  async function sendMessage(text) {
    if (!text || isWaiting) return;
    const cleanText = text.trim();
    if (!cleanText) return;

    appendUserMessage(cleanText);
    chatInput.value = '';
    isWaiting = true;
    showTyping();

    const txt = cleanText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    try {
      let replyText = '';

      if (CFG.USE_MOCK) {
        replyText = await mockAgentResponse(cleanText);
      } else if (txt === '0' || txt.includes('inicio') || txt.includes('menu') || txt.includes('recomecar')) {
        resetFlowState();
        setMenuChips();
        replyText = await callAgentChat('Quero voltar ao menu inicial da barbearia.');
      } else if (flowState.step === 'MENU') {
        if (txt === '1' || txt.includes('servico') || txt.includes('preco') || txt === '3' || txt.includes('agendar')) {
          flowState.step = 'SERVICE';
          const opts = await loadBookingOptions();
          replyText = formatServicesListMessage(opts);
        } else if (txt === '2' || txt.includes('horario')) {
          const opts = await loadBookingOptions();
          flowState.service = (opts && opts.services && opts.services[0]) ? opts.services[0].name : 'Corte Simples';
          flowState.step = 'BARBER';
          replyText = formatBarbersListMessage(opts, null);
        } else {
          replyText = await callAgentChat(cleanText);
        }
      } else if (flowState.step === 'SERVICE') {
        const opts = await loadBookingOptions();
        const chosenService = currentOptions[cleanText] || cleanText;
        flowState.service = chosenService;
        flowState.step = 'BARBER';
        replyText = formatBarbersListMessage(opts, chosenService);
      } else if (flowState.step === 'BARBER') {
        const chosenBarber = currentOptions[cleanText] || cleanText;
        flowState.barber = chosenBarber;
        flowState.assignedBarber = chosenBarber.includes('Sem') ? 'Juvenal' : chosenBarber;
        flowState.availableDays = getNextAvailableDays(flowState.barber, 5);
        flowState.step = 'DATE';
        replyText = buildDatesMessage(flowState.barber, flowState.availableDays);
      } else if (flowState.step === 'DATE') {
        // Verifica se o usuário escolheu um dos 5 números ou digitou data personalizada
        const matchedDay = flowState.availableDays.find((d) => d.num === cleanText);
        const parsedYmd = matchedDay ? matchedDay.ymd : parseUserDate(cleanText);

        if (!parsedYmd) {
          replyText = `⚠️ Formato de data não reconhecido. Por favor escolha um dos números de [1] a [5] acima ou digite no formato DD/MM (ex: 25/11):\n\n${buildDatesMessage(flowState.barber, flowState.availableDays)}`;
        } else {
          // Checa se a data é anterior a hoje
          const nowParts = new Intl.DateTimeFormat('en-CA', {
            timeZone: getTz(),
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).formatToParts(new Date());
          const getP = (t) => nowParts.find((p) => p.type === t).value;
          const todayYmd = `${getP('year')}-${getP('month')}-${getP('day')}`;

          if (parsedYmd < todayYmd) {
            replyText = `⚠️ A data selecionada (${formatYmdBr(parsedYmd)}) já passou. Por favor escolha uma data presente ou futura:\n\n${buildDatesMessage(flowState.barber, flowState.availableDays)}`;
          } else {
            // Checa se o barbeiro atende no dia da semana digitado
            const [py, pmo, pda] = parsedYmd.split('-').map(Number);
            const pUtc = new Date(Date.UTC(py, pmo - 1, pda));
            const pJsDay = pUtc.getUTCDay();
            const pIsoWd = pJsDay === 0 ? 7 : pJsDay;
            const bWorkingDays = getBarberWorkingDays(flowState.barber);

            if (!bWorkingDays.includes(pIsoWd)) {
              const wdName = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' }).format(pUtc);
              replyText = `⚠️ O profissional *${flowState.barber}* não atende aos ${wdName}s (dia de folga).\n\nPor favor escolha um dos dias disponíveis:\n\n${buildDatesMessage(flowState.barber, flowState.availableDays)}`;
            } else {
              flowState.date = parsedYmd;
              // Busca horários reais no Google Calendar para a data selecionada
              const result = await fetchRealAvailableSlots(parsedYmd, flowState.barber, flowState.service);

              if (result.error) {
                replyText = `⚠️ Não foi possível consultar a agenda de *${flowState.barber}* para ${formatYmdBr(parsedYmd)} (${result.error}).\n\nPor favor escolha outra data ou digite *[0]* para recomeçar.`;
              } else if (!result.slots || result.slots.length === 0) {
                replyText = `📅 Não encontramos horários disponíveis para *${flowState.barber}* no dia *${formatYmdBr(parsedYmd)}*.\n(Pode ser dia de folga do profissional ou todos os horários já foram reservados).\n\nPor favor escolha outro dia:\n\n${buildDatesMessage(flowState.barber, flowState.availableDays)}`;
              } else {
                flowState.availableSlots = result.slots;
                flowState.step = 'SLOT';
                replyText = buildSlotsMessage(flowState.barber, parsedYmd, result.slots);
              }
            }
          }
        }
      } else if (flowState.step === 'SLOT') {
        const idx = parseInt(cleanText, 10) - 1;
        const chosenSlotObj = (idx >= 0 && flowState.availableSlots[idx])
          || flowState.availableSlots.find((s) => s.label === cleanText || cleanText.includes(s.label));

        if (!chosenSlotObj) {
          const listStr = flowState.availableSlots.map((s, i) => `[${i + 1}] *${s.label}*`).join('\n');
          replyText = `⚠️ Opção inválida. Digite apenas o número de um dos horários disponíveis abaixo:\n\n${listStr}`;
        } else {
          flowState.selectedSlot = chosenSlotObj;
          flowState.slot = chosenSlotObj.label;
          flowState.assignedBarber = chosenSlotObj.assignedBarber || flowState.barber;
          flowState.step = 'NAME';
          updateQuickChips([{ value: '0', label: '↩️ Cancelar / Recomeçar' }]);
          replyText = `Excelente! Horário selecionado: *${flowState.slot}* (${formatYmdBr(flowState.date)}) com *${flowState.assignedBarber}* ⏰\n\nPara concluirmos sua reserva na agenda, por favor digite seu *Nome completo*:`;
        }
      } else if (flowState.step === 'NAME') {
        flowState.name = cleanText;

        // Dupla verificação anti-conflito em tempo real antes de gravar no Google Calendar
        let conflictDetected = false;
        let freshSlots = null;
        try {
          const check = await querySlotsForBarberOnDate(flowState.date, flowState.assignedBarber, flowState.service);
          if (check && check.status === 'ok' && Array.isArray(check.slots)) {
            const stillFree = check.slots.some((s) => s.startTime === flowState.selectedSlot.startTime);
            if (!stillFree) {
              conflictDetected = true;
              freshSlots = check.slots.map((s) => ({
                startTime: s.startTime,
                endTime: s.endTime,
                label: s.label,
                assignedBarber: (Array.isArray(s.barbers) && s.barbers[0]) || flowState.assignedBarber
              }));
            }
          }
        } catch (e) {
          console.warn('Não foi possível revalidar conflito antes da reserva:', e);
        }

        if (conflictDetected) {
          flowState.availableSlots = freshSlots || [];
          flowState.step = 'SLOT';
          if (flowState.availableSlots.length > 0) {
            const listStr = flowState.availableSlots.map((s, i) => `[${i + 1}] *${s.label}*`).join('\n');
            replyText = `⚠️ Ops! O horário das *${flowState.slot}* com *${flowState.assignedBarber}* acabou de ser reservado por outro cliente.\n\nEscolha outro horário ainda disponível:\n\n${listStr}`;
          } else {
            flowState.step = 'DATE';
            replyText = `⚠️ Ops! O horário das *${flowState.slot}* acabou de ser reservado e não há mais vagas neste dia.\n\nPor favor, escolha outro dia:\n\n${buildDatesMessage(flowState.barber, flowState.availableDays)}`;
          }
        } else {
          const bookPayload = {
            name: flowState.name,
            barber: flowState.assignedBarber,
            service: flowState.service || 'Corte Simples',
            startTime: flowState.selectedSlot.startTime,
            endTime: flowState.selectedSlot.endTime,
            summary: `${flowState.service || 'Corte'} - ${flowState.name}`,
            number: 'WhatsApp'
          };

          const bookRes = await fetch(getEndpointUrl('book', '/book-appointment'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookPayload)
          });

          if (!bookRes.ok) {
            throw new Error('Falha no webhook /book-appointment: HTTP ' + bookRes.status);
          }

          const rawBody = await bookRes.text();
          let bookData = {};
          if (rawBody && rawBody.trim()) {
            try {
              bookData = JSON.parse(rawBody);
            } catch (e) {
              console.warn('Resposta não-JSON de /book-appointment:', rawBody);
            }
          }

          flowState.step = 'CONFIRMED';
          updateQuickChips([{ value: '0', label: '💈 Fazer Outro Agendamento' }]);
          const code = '#IMP-' + Math.floor(1000 + Math.random() * 9000);

          // Confirmação limpa, objetiva e sem termos técnicos de sincronização interna
          replyText = `💈 *Agendamento Confirmado com Sucesso!* 🎉\n\n📍 *Resumo da Reserva:*\n• *Cliente:* ${bookData.name || flowState.name}\n• *Serviço:* ${bookData.service || flowState.service}\n• *Barbeiro:* ${bookData.barber || flowState.assignedBarber}\n• *Quando:* ${formatYmdBr(flowState.date)} às ${flowState.slot}\n• *Código da Reserva:* ${code}\n\nDigite *[0]* se desejar fazer outro agendamento.`;
        }
      } else {
        resetFlowState();
        setMenuChips();
        replyText = await callAgentChat(cleanText);
      }

      hideTyping();
      appendAgentMessage(replyText);

      // Atualiza botões rápidos (chips) com base na etapa atual
      if (flowState.step === 'DATE' && flowState.availableDays && flowState.availableDays.length > 0) {
        updateQuickChips(flowState.availableDays.map((d) => ({
          value: d.num,
          label: `${d.num}️⃣ ${d.shortLabel}`
        })));
      } else if (flowState.step === 'SLOT' && flowState.availableSlots && flowState.availableSlots.length > 0) {
        updateQuickChips(flowState.availableSlots.map((s, idx) => ({
          value: String(idx + 1),
          label: `${idx + 1}️⃣ ${s.label}`
        })));
      } else {
        const dynamicChips = extractChipsFromMessage(replyText);
        if (dynamicChips && dynamicChips.length > 0) {
          updateQuickChips(dynamicChips);
        }
      }
    } catch (err) {
      console.warn('Fallback ativado devido a erro na conexão com n8n:', err);
      const fallbackReply = await mockAgentResponse(cleanText);
      hideTyping();
      appendAgentMessage(fallbackReply);

      if (flowState.step === 'DATE' && flowState.availableDays && flowState.availableDays.length > 0) {
        updateQuickChips(flowState.availableDays.map((d) => ({
          value: d.num,
          label: `${d.num}️⃣ ${d.shortLabel}`
        })));
      } else if (flowState.step === 'SLOT' && flowState.availableSlots && flowState.availableSlots.length > 0) {
        updateQuickChips(flowState.availableSlots.map((s, idx) => ({
          value: String(idx + 1),
          label: `${idx + 1}️⃣ ${s.label}`
        })));
      } else {
        const dynamicChips = extractChipsFromMessage(fallbackReply);
        if (dynamicChips && dynamicChips.length > 0) {
          updateQuickChips(dynamicChips);
        }
      }
    } finally {
      isWaiting = false;
      chatInput.focus();
    }
  }

  // Event Listeners
  sendBtn.addEventListener('click', () => sendMessage(chatInput.value));

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });

  if (quickChips) {
    quickChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (btn && btn.dataset.text) {
        sendMessage(btn.dataset.text);
      }
    });
  }

  // Pré-carrega opções em segundo plano
  loadBookingOptions();
  chatInput.focus();
})();
