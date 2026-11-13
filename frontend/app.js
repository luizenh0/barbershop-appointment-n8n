(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const TZ = CFG.TIMEZONE;

  const state = {
    rangeDays: 10,
    services: [],
    barbers: [],
    service: null,
    barber: null,
    date: null,
    slots: [],
    slot: null,
    slotsRequest: 0,
    submitting: false,
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    shopName: $('shopName'),
    mockBanner: $('mockBanner'),
    footerInfo: $('footerInfo'),
    serviceList: $('serviceList'),
    barberList: $('barberList'),
    dayList: $('dayList'),
    slotArea: $('slotArea'),
    form: $('customerForm'),
    name: $('name'),
    phone: $('phone'),
    summary: $('summary'),
    formError: $('formError'),
    suggestions: $('suggestions'),
    submitBtn: $('submitBtn'),
    bookingView: $('bookingView'),
    successView: $('successView'),
    successDetails: $('successDetails'),
    newBookingBtn: $('newBookingBtn'),
  };

  function ymdInTz(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function ymdToUtcDate(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function utcDateToYmd(date) {
    return date.toISOString().slice(0, 10);
  }

  function isoWeekday(ymd) {
    const wd = ymdToUtcDate(ymd).getUTCDay();
    return wd === 0 ? 7 : wd;
  }

  function fmtDay(ymd, opts) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opts }).format(ymdToUtcDate(ymd));
  }

  function fmtTime(iso) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  function fmtDateTimeLong(iso) {
    const day = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }).format(new Date(iso));
    return `${day} às ${fmtTime(iso)}`;
  }

  function fmtDateTimeShort(iso) {
    const day = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(iso));
    return `${day} às ${fmtTime(iso)}`;
  }

  function nextDays() {
    const today = ymdToUtcDate(ymdInTz(new Date()));
    return Array.from({ length: state.rangeDays }, (_, i) => utcDateToYmd(new Date(today.getTime() + i * 86400000)));
  }

  function fmtPrice(p) {
    if (p === '' || p === null || p === undefined) return '';
    if (typeof p === 'number') return p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const s = String(p).trim();
    return /^\d+([.,]\d{1,2})?$/.test(s)
      ? Number(s.replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : s;
  }

  function fmtDuration(min) {
    return min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min} min`;
  }

  function workingDays() {
    const list = state.barber === 'any' || !state.barber
      ? state.barbers
      : state.barbers.filter((b) => b.name === state.barber);
    return new Set(list.flatMap((b) => b.days || []));
  }

  async function request(path, body) {
    const res = await fetch(CFG.N8N_BASE_URL + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`(HTTP ${res.status}): ${errText || res.statusText}`);
    }
    return res.json();
  }

  const api = {
    options: () => (CFG.USE_MOCK ? mock.options() : request(CFG.ENDPOINTS.options)),
    slots: (b) => (CFG.USE_MOCK ? mock.slots(b) : request(CFG.ENDPOINTS.availableSlots, b)),
    book: (p) => (CFG.USE_MOCK ? mock.book(p) : request(CFG.ENDPOINTS.book, p)),
  };

  const mock = (() => {
    const barbers = [
      { name: 'Carlos', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
      { name: 'Eduardo', days: [2, 3, 4, 5, 6], start: '10:00', end: '19:00' },
      { name: 'Rafael', days: [1, 3, 5, 6], start: '13:00', end: '20:00' },
    ];
    const services = [
      { name: 'Corte Simples', duration: 30, price: 35 },
      { name: 'Barba', duration: 30, price: 30 },
      { name: 'Corte + Barba', duration: 60, price: 60 },
      { name: 'Pezinho', duration: 15, price: 15 },
    ];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const offsetOf = (ymd) => {
      const v = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
        .formatToParts(new Date(`${ymd}T12:00:00Z`))
        .find((p) => p.type === 'timeZoneName').value;
      return v === 'GMT' ? '+00:00' : v.replace('GMT', '');
    };
    const isBusy = (name, ymd, m) => {
      let h = 0;
      for (const c of name + ymd + m) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return h % 4 === 0;
    };

    return {
      async options() {
        await wait(400);
        return { status: 'ok', timezone: TZ, rangeDays: 10, barbers, services };
      },
      async slots({ barber, date, service }) {
        await wait(500);
        const svc = services.find((s) => s.name === service);
        const dur = svc ? svc.duration : 60;
        const wd = isoWeekday(date);
        const pool = (barber === 'any' ? barbers : barbers.filter((b) => b.name === barber)).filter((b) => b.days.includes(wd));
        if (!pool.length) return { status: 'ok', date, barber, duration: dur, dayOff: true, slots: [] };

        const off = offsetOf(date);
        const first = Math.min(...pool.map((b) => toMin(b.start)));
        const last = Math.max(...pool.map((b) => toMin(b.end)));
        const slots = [];

        for (let m = first; m + dur <= last; m += 30) {
          const hh = String(Math.floor(m / 60)).padStart(2, '0');
          const mm = String(m % 60).padStart(2, '0');
          const startTime = `${date}T${hh}:${mm}:00${off}`;
          if (new Date(startTime) < new Date()) continue;
          const free = pool
            .filter((b) => m >= toMin(b.start) && m + dur <= toMin(b.end) && !isBusy(b.name, date, m))
            .map((b) => b.name);
          if (free.length) {
            slots.push({
              startTime,
              endTime: new Date(new Date(startTime).getTime() + dur * 60000).toISOString(),
              label: `${hh}:${mm}`,
              barbers: free,
            });
          }
        }
        return { status: 'ok', date, barber, duration: dur, slots };
      },
      async book(p) {
        await wait(700);
        return {
          status: 'booked',
          barber: p.barber,
          startTime: p.startTime,
          endTime: p.endTime,
          eventId: 'demo_' + Math.random().toString(36).slice(2, 10),
          calendarId: 'demo@group.calendar.google.com',
        };
      },
    };
  })();

  const initials = (name) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const DAY_NAMES = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

  function radioButton(className, checked, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(!!checked));
    b.addEventListener('click', onClick);
    return b;
  }

  function div(className, text) {
    const d = document.createElement('div');
    d.className = className;
    d.textContent = text;
    return d;
  }

  function renderServices() {
    el.serviceList.innerHTML = '';
    if (!state.services.length) {
      el.serviceList.appendChild(div('hint', 'Nenhum serviço disponível.'));
      return;
    }
    for (const s of state.services) {
      const b = radioButton('service', state.service && state.service.name === s.name, () => selectService(s));
      const left = document.createElement('div');
      left.append(div('s-name', s.name), div('s-dur', fmtDuration(s.duration)));
      b.append(left, div('s-price', fmtPrice(s.price)));
      el.serviceList.appendChild(b);
    }
  }

  function renderBarbers() {
    el.barberList.innerHTML = '';
    const options = [{ value: 'any', name: 'Sem preferência', desc: 'Primeiro disponível', avatar: '★' }]
      .concat(state.barbers.map((b) => ({
        value: b.name,
        name: b.name,
        avatar: initials(b.name),
        desc: `${(b.days || []).map((d) => DAY_NAMES[d - 1]).join(', ')} · ${b.start}–${b.end}`,
      })));

    for (const o of options) {
      const b = radioButton('barber', state.barber === o.value, () => selectBarber(o.value));
      b.append(div('avatar', o.avatar), div('name', o.name), div('desc', o.desc));
      el.barberList.appendChild(b);
    }
  }

  function renderDays() {
    el.dayList.innerHTML = '';
    const days = workingDays();
    for (const ymd of nextDays()) {
      const open = days.has(isoWeekday(ymd));
      const b = radioButton('day', state.date === ymd, () => selectDay(ymd));
      b.disabled = !open;
      b.setAttribute('aria-label', fmtDay(ymd, { weekday: 'long', day: 'numeric', month: 'long' }) + (open ? '' : ' (indisponível)'));
      const wd = ymd === ymdInTz(new Date()) ? 'hoje' : fmtDay(ymd, { weekday: 'short' }).replace('.', '');
      b.append(
        div('wd', wd),
        div('dn', fmtDay(ymd, { day: '2-digit' })),
        div(open ? 'mo' : 'closed', open ? fmtDay(ymd, { month: 'short' }).replace('.', '') : 'folga')
      );
      el.dayList.appendChild(b);
    }
  }

  function renderSlotsMessage(text, isError) {
    el.slotArea.innerHTML = '';
    const p = document.createElement('p');
    p.className = isError ? 'alert alert-error' : 'hint';
    p.textContent = text;
    el.slotArea.appendChild(p);
  }

  function renderSlots() {
    if (!state.slots.length) {
      renderSlotsMessage('Nenhum horário livre neste dia. Tente outro dia ou profissional.');
      return;
    }
    el.slotArea.innerHTML = '';
    const hourOf = (s) => Number(fmtTime(s.startTime).slice(0, 2));
    const groups = [
      { title: 'Manhã', items: state.slots.filter((s) => hourOf(s) < 12) },
      { title: 'Tarde', items: state.slots.filter((s) => hourOf(s) >= 12 && hourOf(s) < 18) },
      { title: 'Noite', items: state.slots.filter((s) => hourOf(s) >= 18) },
    ];

    for (const g of groups) {
      if (!g.items.length) continue;
      const grid = document.createElement('div');
      grid.className = 'slot-grid';
      grid.setAttribute('role', 'radiogroup');

      for (const s of g.items) {
        const selected = state.slot && new Date(state.slot.startTime).getTime() === new Date(s.startTime).getTime();
        const b = radioButton('slot', selected, () => selectSlot(s));
        b.textContent = fmtTime(s.startTime);
        if (state.barber === 'any' && Array.isArray(s.barbers)) {
          const sm = document.createElement('small');
          sm.textContent = s.barbers.length === 1 ? s.barbers[0] : `${s.barbers.length} livres`;
          b.appendChild(sm);
        }
        grid.appendChild(b);
      }
      el.slotArea.append(div('slot-group-title', g.title), grid);
    }
  }

  function renderSummary() {
    if (!state.slot || !state.service) {
      el.summary.classList.add('hidden');
      return;
    }
    el.summary.innerHTML = '';
    const lines = [
      ['Serviço', `${state.service.name}${state.service.price !== '' ? ' · ' + fmtPrice(state.service.price) : ''}`],
      ['Barbeiro', state.barber === 'any' ? `${bookingBarber()} (primeiro disponível)` : state.barber],
      ['Quando', fmtDateTimeLong(state.slot.startTime)],
      ['Duração', `${fmtDuration(state.service.duration)} (até ${fmtTime(state.slot.endTime)})`],
    ];

    lines.forEach(([k, v], i) => {
      const strong = document.createElement('strong');
      strong.textContent = k + ': ';
      el.summary.append(strong, document.createTextNode(v));
      if (i < lines.length - 1) el.summary.appendChild(document.createElement('br'));
    });
    el.summary.classList.remove('hidden');
  }

  function updateSubmitState() {
    el.submitBtn.disabled = state.submitting || !state.service || !state.barber || !state.slot;
    el.submitBtn.textContent = state.submitting ? 'Agendando...' : 'Confirmar agendamento';
  }

  function showError(text) {
    el.formError.textContent = text;
    el.formError.classList.remove('hidden');
  }

  function clearMessages() {
    el.formError.classList.add('hidden');
    el.suggestions.classList.add('hidden');
    el.suggestions.innerHTML = '';
  }

  function refreshAfterChange() {
    state.slot = null;
    clearMessages();
    renderSummary();
    updateSubmitState();
    if (state.service && state.barber && state.date) loadSlots();
    else if (state.date) renderSlotsMessage(!state.service ? 'Escolha um serviço.' : 'Escolha um barbeiro.');
    else renderSlotsMessage('Escolha o serviço, o barbeiro e o dia para ver os horários livres.');
  }

  function bookingBarber() {
    if (state.barber !== 'any') return state.barber;
    return state.slot && state.slot.barbers && state.slot.barbers.length ? state.slot.barbers[0] : 'any';
  }

  function selectService(s) {
    state.service = s;
    renderServices();
    refreshAfterChange();
  }

  function selectBarber(value) {
    state.barber = value;
    if (state.date && !workingDays().has(isoWeekday(state.date))) state.date = null;
    renderBarbers();
    renderDays();
    refreshAfterChange();
  }

  function selectDay(ymd) {
    state.date = ymd;
    renderDays();
    refreshAfterChange();
  }

  function selectSlot(slot) {
    state.slot = slot;
    clearMessages();
    renderSlots();
    renderSummary();
    updateSubmitState();
    el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.name.focus({ preventScroll: true });
  }

  async function loadSlots(selectStartTime) {
    const reqId = ++state.slotsRequest;
    el.slotArea.innerHTML = '<div class="slot-grid">' + '<div class="skeleton skeleton-slot"></div>'.repeat(8) + '</div>';

    try {
      const data = await api.slots({ barber: state.barber, date: state.date, service: state.service.name });
      if (reqId !== state.slotsRequest) return;

      if (data.status === 'ok') {
        state.slots = Array.isArray(data.slots) ? data.slots : [];
        if (data.dayOff) return renderSlotsMessage('Não há atendimento neste dia para essa escolha. Escolha outro dia.');
        if (selectStartTime) {
          const t = new Date(selectStartTime).getTime();
          state.slot = state.slots.find((s) => new Date(s.startTime).getTime() === t) || null;
          renderSummary();
          updateSubmitState();
        }
        renderSlots();
      } else if (data.status === 'barber_not_found') {
        renderSlotsMessage('Barbeiro não disponível. Escolha outro.', true);
      } else if (data.status === 'service_not_found') {
        renderSlotsMessage('Serviço não disponível. Escolha outro.', true);
      } else if (data.status === 'invalid_request') {
        renderSlotsMessage('Data indisponível para agendamento.', true);
      } else {
        renderSlotsMessage(data.message || 'Não foi possível carregar os horários.', true);
      }
    } catch (err) {
      if (reqId !== state.slotsRequest) return;
      console.error(err);
      renderSlotsMessage(`Falha ao carregar horários: ${err.message || 'Verifique a conexão.'}`, true);
    }
  }

  function showSuggestions(list) {
    el.suggestions.innerHTML = '';
    el.suggestions.appendChild(div('', list.length
      ? 'Esse horário foi preenchido. Horários mais próximos disponíveis:'
      : 'Esse horário não está mais disponível. Escolha outro horário abaixo.'));

    if (list.length) {
      const wrap = document.createElement('div');
      wrap.className = 'suggestion-list';
      for (const s of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'suggestion';
        b.textContent = fmtDateTimeShort(s.startTime) + (s.barber ? ` · ${s.barber}` : '');
        b.addEventListener('click', () => {
          clearMessages();
          state.date = ymdInTz(new Date(s.startTime));
          renderDays();
          loadSlots(s.startTime);
        });
        wrap.appendChild(b);
      }
      el.suggestions.appendChild(wrap);
    }
    el.suggestions.classList.remove('hidden');
  }

  function showSuccess(data) {
    el.successDetails.innerHTML = '';
    const rows = [
      ['Serviço', state.service.name],
      ['Barbeiro', data.barber || bookingBarber()],
      ['Quando', fmtDateTimeLong(data.startTime || state.slot.startTime)],
      ['Código', data.eventId || '-'],
    ];

    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      el.successDetails.append(dt, dd);
    }

    el.bookingView.classList.add('hidden');
    el.successView.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function maskPhone(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  async function onSubmit(e) {
    e.preventDefault();
    clearMessages();
    const name = el.name.value.trim();
    const digits = el.phone.value.replace(/\D/g, '');

    el.name.classList.toggle('invalid', !name);
    el.phone.classList.toggle('invalid', digits.length < 10);

    if (!state.service || !state.barber || !state.slot) return showError('Selecione serviço, barbeiro, dia e horário.');
    if (!name) return showError('Informe seu nome.');
    if (digits.length < 10) return showError('Informe um telefone válido com DDD.');

    const payload = {
      name: name,
      service: state.service.name,
      barber: bookingBarber(),
      startTime: state.slot.startTime,
      endTime: state.slot.endTime,
      number: digits,
      phone_number: digits,
      summary: `${state.service.name} - ${name}`,
      description: `Cliente: ${name}\nTelefone: ${el.phone.value}\nServiço: ${state.service.name}` +
        (state.service.price !== '' ? `\nValor: ${fmtPrice(state.service.price)}` : '') + '\nOrigem: Web',
    };

    state.submitting = true;
    updateSubmitState();

    try {
      const data = await api.book(payload);
      switch (data.status) {
        case 'booked':
          showSuccess(data);
          break;
        case 'unavailable':
          state.slot = null;
          renderSummary();
          showSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
          loadSlots();
          break;
        case 'barber_not_found':
          showError('Barbeiro não encontrado. Escolha outro ou "Sem preferência".');
          break;
        case 'invalid_request':
          showError(translateValidation(data.message));
          break;
        default:
          showError('Não foi possível concluir o agendamento. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      showError(`Falha ao agendar: ${err.message || 'Verifique a conexão.'}`);
    } finally {
      state.submitting = false;
      updateSubmitState();
    }
  }

  function translateValidation(msg) {
    const map = {
      'A valid phone number is required.': 'Informe um telefone válido com DDD.',
      'startTime cannot be in the past.': 'Esse horário já passou. Escolha outro.',
      'endTime must be after startTime.': 'Horário inválido. Escolha outro.',
    };
    return map[msg] || 'Dados inválidos. Revise e tente novamente.';
  }

  function resetAll() {
    Object.assign(state, { service: null, barber: null, date: null, slot: null, slots: [] });
    el.form.reset();
    renderServices();
    renderBarbers();
    renderDays();
    refreshAfterChange();
    el.successView.classList.add('hidden');
    el.bookingView.classList.remove('hidden');
  }

  async function init() {
    document.title = `Agendamento - ${CFG.SHOP_NAME}`;
    el.shopName.textContent = CFG.SHOP_NAME;
    el.mockBanner.classList.toggle('hidden', !CFG.USE_MOCK);
    el.phone.addEventListener('input', () => { el.phone.value = maskPhone(el.phone.value); });
    el.form.addEventListener('submit', onSubmit);
    el.newBookingBtn.addEventListener('click', resetAll);
    updateSubmitState();

    try {
      const data = await api.options();
      if (data.status !== 'ok') throw new Error(data.message || 'status ' + data.status);
      state.services = Array.isArray(data.services) ? data.services : [];
      state.barbers = Array.isArray(data.barbers) ? data.barbers : [];
      if (data.rangeDays) state.rangeDays = data.rangeDays;
      el.footerInfo.textContent = `Horários no fuso ${data.timezone || TZ}`;
    } catch (err) {
      console.error(err);
      showError('Não foi possível carregar serviços e barbeiros.');
    }
    renderServices();
    renderBarbers();
    renderDays();
  }

  init();
})();
