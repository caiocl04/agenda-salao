// ===== SUPABASE (a chave anon é pública por design; a proteção real está nas regras RLS do arquivo supabase.sql) =====
const SUPABASE_URL = 'https://tgzanubzswqfhzvsjylk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnemFudWJ6c3dxZmh6dnNqeWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzY2NjksImV4cCI6MjEwOTkxMjY2OX0.fn7m6N22TAmOd0KcLQYObg_X3h__4Yf9rvMjEgB8Ukw';

// ===== CONFIGURAÇÕES DA BARBEARIA =====
const CONFIG = {
  salonPhone: "5511999999999", // WhatsApp da barbearia com 55 + DDD
  startHour: 8,
  endHour: 19,
  slotInterval: 30,
  closedDays: [0],   // 0 = domingo, 1 = segunda ... 6 = sábado
  maxDaysAhead: 60
};

const SERVICES = [
  { id: 1, name: "Corte Masculino", duration: 30, price: 25 },
  { id: 2, name: "Barba", duration: 30, price: 20 },
  { id: 3, name: "Corte + Barba", duration: 60, price: 40 },
  { id: 4, name: "Sombrancelha", duration: 10, price: 5 }
];

let db, selectedService = SERVICES[0], selectedSlot = null, busy = false;
const $ = id => document.getElementById(id);

// ===== UTILITÁRIOS =====
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const money = v => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const digits = s => String(s || '').replace(/\D/g, '');
const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const brDate = iso => iso.split('-').reverse().join('/');
const weekday = iso => new Date(iso + 'T12:00:00').getDay();
const hhmm = t => String(t).slice(0, 5);

function maskPhone(el) {
  el.addEventListener('input', () => {
    let v = digits(el.value).slice(0, 11);
    if (v.length > 6) v = v.replace(/^(\d{2})(\d{4,5})(\d{0,4}).*/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
    else if (v.length) v = '(' + v;
    el.value = v;
  });
}

const waLink = text => `https://wa.me/${CONFIG.salonPhone}?text=${encodeURIComponent(text)}`;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', async () => {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const today = localISO();
  const max = new Date(); max.setDate(max.getDate() + CONFIG.maxDaysAhead);
  const dateInput = $('booking-date');
  dateInput.min = today; dateInput.max = localISO(max);
  dateInput.value = today;
  $('admin-date').value = today;

  const days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const open = days.map((d, i) => i).filter(i => !CONFIG.closedDays.includes(i));
  $('hours-text').textContent = `Atendemos de ${days[open[0]]} a ${days[open[open.length - 1]]}, das ${CONFIG.startHour}h às ${CONFIG.endHour}h`;

  const wa = waLink('Olá! Vim pelo site da SC Barber e gostaria de uma informação.');
  $('hero-wa').href = wa; $('fab-wa').href = wa;

  // Eventos
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('open-admin').addEventListener('click', () => switchTab('admin'));
  dateInput.addEventListener('change', () => { selectedSlot = null; renderSlots(); });
  $('admin-date').addEventListener('change', renderAdminSchedule);
  $('confirm-btn').addEventListener('click', confirmBooking);
  $('search-btn').addEventListener('click', searchClientBookings);
  $('admin-login-btn').addEventListener('click', adminLogin);
  $('admin-logout').addEventListener('click', adminLogout);
  $('new-booking').addEventListener('click', resetBooking);
  maskPhone($('client-phone')); maskPhone($('search-phone'));

  renderServices();
  renderSlots();

  const { data } = await db.auth.getSession();
  if (data.session) showAdminPanel();
});

function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('tab-' + name).classList.add('active');
  if (name === 'admin') renderAdminSchedule();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== SERVIÇOS =====
function renderServices() {
  $('services-container').innerHTML = SERVICES.map(s => `
    <button type="button" class="service-card ${s.id === selectedService.id ? 'selected' : ''}" data-id="${s.id}">
      <span><strong>${esc(s.name)}</strong><small>${s.duration} min</small></span>
      <span class="service-price">${money(s.price)}</span>
    </button>`).join('');
  document.querySelectorAll('.service-card').forEach(c => c.addEventListener('click', () => {
    selectedService = SERVICES.find(s => s.id === Number(c.dataset.id));
    selectedSlot = null;
    renderServices(); renderSlots();
  }));
}

// ===== HORÁRIOS =====
async function renderSlots() {
  const date = $('booking-date').value;
  const box = $('slots-container');
  const msg = t => { box.innerHTML = `<p class="msg">${t}</p>`; };
  updateSummary();
  if (!date) return msg('Selecione uma data.');
  if (CONFIG.closedDays.includes(weekday(date))) return msg('Não atendemos neste dia. Escolha outra data.');

  msg('Consultando horários...');
  const { data, error } = await db.from('horarios_ocupados').select('horario, duracao').eq('data', date);
  if (date !== $('booking-date').value) return; // usuário trocou a data durante a consulta
  if (error) {
    console.error('Erro ao carregar horários:', error);
    return msg(`Não foi possível carregar os horários.<br><small>Detalhe técnico: ${esc(error.message)}</small>`);
  }

  const booked = data.map(b => ({ start: toMin(hhmm(b.horario)), end: toMin(hhmm(b.horario)) + (b.duracao || 30) }));
  const now = new Date();
  const nowMin = date === localISO() ? now.getHours() * 60 + now.getMinutes() : -1;
  const dur = selectedService.duration;
  const closing = CONFIG.endHour * 60;

  let html = '';
  for (let t = CONFIG.startHour * 60; t + dur <= closing; t += CONFIG.slotInterval) {
    const unavailable = t <= nowMin || booked.some(b => t < b.end && t + dur > b.start);
    const label = fromMin(t);
    html += `<button type="button" class="slot-btn ${selectedSlot === label ? 'selected' : ''}" ${unavailable ? 'disabled' : ''} data-time="${label}">${label}</button>`;
  }
  box.innerHTML = html || '<p class="msg">Sem horários para este dia.</p>';
  if (box.querySelector('.slot-btn:not(:disabled)') === null && html) {
    box.insertAdjacentHTML('beforeend', '<p class="msg">Dia lotado. Tente outra data.</p>');
  }
  box.querySelectorAll('.slot-btn').forEach(b => b.addEventListener('click', () => {
    selectedSlot = b.dataset.time;
    renderSlots();
    if (window.innerWidth < 720) $('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function updateSummary() {
  const el = $('summary');
  if (!selectedSlot) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<strong>${esc(selectedService.name)}</strong><br>${brDate($('booking-date').value)} às ${selectedSlot} · ${money(selectedService.price)}`;
}

// ===== CONFIRMAR AGENDAMENTO =====
async function confirmBooking() {
  if (busy) return;
  const date = $('booking-date').value;
  const name = $('client-name').value.trim();
  const phone = digits($('client-phone').value);

  if (!selectedSlot) return alert('Escolha um horário.');
  if (name.length < 2) return alert('Informe seu nome.');
  if (phone.length < 10) return alert('Informe um WhatsApp válido com DDD.');

  busy = true;
  const btn = $('confirm-btn');
  btn.disabled = true; btn.textContent = 'Reservando...';

  // A checagem de conflito definitiva é feita no banco (trigger); aqui só tratamos o resultado.
  const { error } = await db.from('agendamentos').insert([{
    cliente: name, telefone: phone, data: date,
    horario: selectedSlot, servico: selectedService.name, duracao: selectedService.duration
  }]);

  busy = false;
  btn.disabled = false; btn.textContent = 'Confirmar agendamento';

  if (error) {
    const conflict = /indispon|conflict|overlap/i.test(error.message);
    alert(conflict ? 'Esse horário acabou de ser reservado. Escolha outro.' : 'Não foi possível agendar. Tente novamente.');
    if (conflict) { selectedSlot = null; renderSlots(); }
    return;
  }

  const text = `Olá! Acabei de agendar na SC Barber:\n\n✂️ Serviço: ${selectedService.name}\n📅 Data: ${brDate(date)}\n⏰ Horário: ${selectedSlot}\n👤 Nome: ${name}`;
  $('success-text').textContent = `${selectedService.name} em ${brDate(date)} às ${selectedSlot}. Envie a confirmação para a barbearia.`;
  $('success-wa').href = waLink(text);
  ['servicos', 'form-card'].forEach(id => $(id).hidden = true);
  $('booking-date').closest('.card').hidden = true;
  $('success-card').hidden = false;
  $('success-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetBooking() {
  selectedSlot = null;
  $('client-name').value = ''; $('client-phone').value = '';
  document.querySelectorAll('#tab-agendar .card').forEach(c => c.hidden = false);
  $('success-card').hidden = true;
  renderSlots();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== MEUS HORÁRIOS (via função segura no banco: exige o telefone completo) =====
async function searchClientBookings() {
  const phone = digits($('search-phone').value);
  const out = $('client-results');
  if (phone.length < 10) return alert('Digite seu WhatsApp completo com DDD.');
  out.innerHTML = '<p class="empty">Buscando...</p>';

  const { data, error } = await db.rpc('buscar_agendamentos', { p_telefone: phone });
  if (error) { out.innerHTML = '<p class="empty">Erro na busca. Tente novamente.</p>'; return; }
  if (!data.length) { out.innerHTML = '<p class="empty">Nenhum agendamento futuro encontrado.</p>'; return; }

  out.innerHTML = data.map(b => {
    const s = SERVICES.find(x => x.name === b.servico);
    return `<div class="card appointment-item">
      <div><strong>${esc(b.servico)}</strong>
        <small>${brDate(b.data)} às ${esc(hhmm(b.horario))}${s ? ' · ' + money(s.price) : ''}</small></div>
      <button class="btn-sm btn-cancel" data-id="${esc(b.id)}">Cancelar</button></div>`;
  }).join('');
  out.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Cancelar este agendamento?')) return;
    const { error: err } = await db.rpc('cancelar_agendamento', { p_id: btn.dataset.id, p_telefone: phone });
    if (err) return alert('Não foi possível cancelar.');
    searchClientBookings(); renderSlots();
  }));
}

// ===== ÁREA PROFISSIONAL (login real via Supabase Auth) =====
async function adminLogin() {
  const email = $('admin-email').value.trim(), password = $('admin-pass').value;
  if (!email || !password) return alert('Informe e-mail e senha.');
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert('E-mail ou senha incorretos.');
  $('admin-pass').value = '';
  showAdminPanel();
}

function showAdminPanel() {
  $('admin-login-card').hidden = true;
  $('admin-panel').hidden = false;
  renderAdminSchedule();
}

async function adminLogout() {
  await db.auth.signOut();
  $('admin-panel').hidden = true;
  $('admin-login-card').hidden = false;
}

async function renderAdminSchedule() {
  if ($('admin-panel').hidden) return;
  const date = $('admin-date').value;
  const list = $('admin-schedule-list');
  if (!date) return;
  list.innerHTML = '<p class="empty">Carregando...</p>';

  const { data, error } = await db.from('agendamentos').select('*').eq('data', date).order('horario');
  if (error) { list.innerHTML = '<p class="empty">Erro ao carregar. Entre novamente.</p>'; return; }

  const total = data.reduce((sum, b) => sum + (SERVICES.find(s => s.name === b.servico)?.price || 0), 0);
  $('admin-revenue').textContent = money(total);

  if (!data.length) { list.innerHTML = '<div class="card empty">Nenhum agendamento nesta data.</div>'; return; }

  list.innerHTML = data.map(b => {
    const s = SERVICES.find(x => x.name === b.servico);
    let ph = digits(b.telefone); if (!ph.startsWith('55')) ph = '55' + ph;
    return `<div class="card appointment-item">
      <div><strong>${esc(hhmm(b.horario))} · ${esc(b.cliente)}</strong>
        <small>${esc(b.servico)}${s ? ' · ' + money(s.price) : ''}</small>
        <small>${esc(b.telefone)}</small></div>
      <div class="actions">
        <a class="btn-sm btn-whatsapp" href="https://wa.me/${ph}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn-sm btn-cancel" data-id="${esc(b.id)}">Cancelar</button>
      </div></div>`;
  }).join('');
  list.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Cancelar este agendamento?')) return;
    const { error: err } = await db.from('agendamentos').delete().eq('id', btn.dataset.id);
    if (err) return alert('Erro ao cancelar.');
    renderAdminSchedule(); renderSlots();
  }));
}