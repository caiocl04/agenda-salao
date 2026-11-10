// CONFIGURAÇÃO DO SUPABASE
const SUPABASE_URL = 'https://tgzanubzswqfhzvsjylk.supabase.co';
const SUPABASE_KEY = 'COLE_SUA_CHAVE_ANON_AQUI'; // Cole aqui sua chave anon/public do Supabase
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// CONFIGURAÇÕES DO SALÃO
const CONFIG = {
  salonPhone: "5511999999999", // WhatsApp do Salão com DDD
  adminPIN: "1234",
  startHour: 8,  // 08:00
  endHour: 19,   // 19:00
  slotInterval: 30 // Minutos
};

const SERVICES = [
  { id: 1, name: "Corte Masculino", duration: 30, price: 40 },
  { id: 2, name: "Barba Completa", duration: 30, price: 30 },
  { id: 3, name: "Corte + Barba", duration: 60, price: 65 },
  { id: 4, name: "Corte Feminino / Escova", duration: 60, price: 90 }
];

let selectedService = SERVICES[0];
let selectedSlot = null;

// INICIALIZAÇÃO
document.addEventListener("DOMContentLoaded", () => {
  renderServices();
  const today = new Date().toISOString().split('T')[0];
  const bookingDateInput = document.getElementById("booking-date");
  const adminDateInput = document.getElementById("admin-date");

  if (bookingDateInput) {
    bookingDateInput.min = today;
    bookingDateInput.value = today;
  }
  if (adminDateInput) {
    adminDateInput.value = today;
  }

  renderSlots();
});

function switchTab(tabName) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(el => el.classList.remove("active"));
  
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) targetTab.classList.add("active");
  if (event && event.target) event.target.classList.add("active");

  if (tabName === 'admin') renderAdminSchedule();
}

function renderServices() {
  const container = document.getElementById("services-container");
  if (!container) return;

  container.innerHTML = SERVICES.map(s => `
    <div class="service-card ${s.id === selectedService.id ? 'selected' : ''}" onclick="selectService(${s.id})">
      <div class="service-info">
        <strong>${s.name}</strong>
        <span>⏳ ${s.duration} min</span>
      </div>
      <div class="service-price">R$ ${s.price}</div>
    </div>
  `).join('');
}

function selectService(id) {
  selectedService = SERVICES.find(s => s.id === id);
  renderServices();
  renderSlots();
}

// BUSCAR HORÁRIOS E CHECAR SOBREPOSIÇÕES VIA SUPABASE
async function renderSlots() {
  const dateVal = document.getElementById("booking-date").value;
  const container = document.getElementById("slots-container");
  if (!dateVal || !container) return;

  container.innerHTML = '<p style="grid-column: span 3; font-size:0.85rem; color: var(--text-muted);">Consultando horários...</p>';

  // Busca todos os agendamentos do dia no Supabase
  const { data: dbBookings, error } = await _supabase
    .from('agendamentos')
    .select('*')
    .eq('data', dateVal);

  if (error) {
    console.error("Erro ao buscar horários:", error.message);
    container.innerHTML = '<p style="grid-column: span 3; color: red;">Erro ao carregar horários.</p>';
    return;
  }

  // Mapeia a duração de cada serviço para cálculo de ocupação
  const bookings = dbBookings.map(b => {
    const s = SERVICES.find(serv => serv.name === b.servico);
    return {
      time: b.horario,
      duration: s ? s.duration : 30
    };
  });

  const slots = [];
  for (let h = CONFIG.startHour; h < CONFIG.endHour; h++) {
    for (let m = 0; m < 60; m += CONFIG.slotInterval) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push(timeStr);
    }
  }

  container.innerHTML = slots.map(time => {
    const isOccupied = bookings.some(b => {
      const bStart = b.time;
      const bEnd = addMinutes(b.time, b.duration);
      const currentEnd = addMinutes(time, selectedService.duration);
      return (time >= bStart && time < bEnd) || (currentEnd > bStart && currentEnd <= bEnd);
    });

    const isSelected = selectedSlot === time;
    return `
      <button class="slot-btn ${isSelected ? 'selected' : ''}" 
              ${isOccupied ? 'disabled' : ''} 
              onclick="selectSlot('${time}')">
        ${time}
      </button>
    `;
  }).join('');
}

function selectSlot(time) {
  selectedSlot = time;
  renderSlots();
}

// SALVAR AGENDAMENTO NO SUPABASE
async function confirmBooking() {
  const date = document.getElementById("booking-date").value;
  const name = document.getElementById("client-name").value.trim();
  const phone = document.getElementById("client-phone").value.trim();

  if (!selectedSlot) return alert("Por favor, selecione um horário.");
  if (!name) return alert("Por favor, informe seu nome.");
  if (!phone) return alert("Por favor, informe seu telefone.");

  // Verifica se o horário ainda está livre
  const { data: ocupado } = await _supabase
    .from('agendamentos')
    .select('id')
    .eq('data', date)
    .eq('horario', selectedSlot);

  if (ocupado && ocupado.length > 0) {
    alert("Este horário acabou de ser reservado por outro cliente. Escolha outro horário.");
    renderSlots();
    return;
  }

  // Inserção no Supabase
  const { error } = await _supabase
    .from('agendamentos')
    .insert([
      {
        cliente: name,
        telefone: phone,
        data: date,
        horario: selectedSlot,
        servico: selectedService.name
      }
    ]);

  if (error) {
    alert("Erro ao realizar agendamento: " + error.message);
    return;
  }

  alert("Agendamento realizado com sucesso!");

  // Envia confirmação via WhatsApp
  const msg = encodeURIComponent(`Olá! Fiz um agendamento no salão:\n\n✂️ *Serviço:* ${selectedService.name}\n📅 *Data:* ${date}\n⏰ *Horário:* ${selectedSlot}\n👤 *Cliente:* ${name}`);
  window.open(`https://wa.me/${CONFIG.salonPhone}?text=${msg}`, "_blank");

  // Reset de campos
  selectedSlot = null;
  document.getElementById("client-name").value = "";
  document.getElementById("client-phone").value = "";
  renderSlots();
}

// CONSULTAR MEUS AGENDAMENTOS NO SUPABASE
async function searchClientBookings() {
  const phone = document.getElementById("search-phone").value.trim();
  const resultsDiv = document.getElementById("client-results");
  if (!phone) return alert("Digite o telefone para pesquisar.");

  resultsDiv.innerHTML = '<p style="text-align:center; padding:15px;">Buscando agendamentos...</p>';

  const { data: bookings, error } = await _supabase
    .from('agendamentos')
    .select('*')
    .ilike('telefone', `%${phone}%`)
    .order('data', { ascending: true });

  if (error) {
    resultsDiv.innerHTML = `<p style="text-align:center; color: red;">Erro na busca.</p>`;
    return;
  }

  if (!bookings || bookings.length === 0) {
    resultsDiv.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin-top:20px;">Nenhum agendamento encontrado.</p>`;
    return;
  }

  resultsDiv.innerHTML = bookings.map(b => {
    const s = SERVICES.find(serv => serv.name === b.servico);
    const price = s ? s.price : 0;

    return `
      <div class="card appointment-item" style="margin-bottom: 10px;">
        <div>
          <strong>${b.servico}</strong><br>
          <small>📅 ${b.data} às ⏰ ${b.horario} - R$ ${price}</small>
        </div>
        <button class="btn-cancel" onclick="cancelBooking('${b.id}')">Cancelar</button>
      </div>
    `;
  }).join('');
}

// CANCELAR AGENDAMENTO
async function cancelBooking(id) {
  if (!confirm("Tem certeza que deseja cancelar este agendamento?")) return;

  const { error } = await _supabase
    .from('agendamentos')
    .delete()
    .eq('id', id);

  if (error) {
    alert("Erro ao cancelar: " + error.message);
  } else {
    alert("Agendamento cancelado.");
    searchClientBookings();
    renderAdminSchedule();
    renderSlots();
  }
}

// ÁREA DO PROFISSIONAL
function unlockAdmin() {
  const pin = document.getElementById("admin-pin").value;
  if (pin === CONFIG.adminPIN) {
    document.getElementById("admin-login-card").style.display = "none";
    document.getElementById("admin-panel").style.display = "block";
    renderAdminSchedule();
  } else {
    alert("PIN incorreto!");
  }
}

async function renderAdminSchedule() {
  const date = document.getElementById("admin-date").value;
  const listDiv = document.getElementById("admin-schedule-list");
  if (!date || !listDiv) return;

  listDiv.innerHTML = '<p style="text-align:center; padding:15px;">Carregando agenda...</p>';

  const { data: bookings, error } = await _supabase
    .from('agendamentos')
    .select('*')
    .eq('data', date)
    .order('horario', { ascending: true });

  if (error) {
    listDiv.innerHTML = `<p style="text-align:center; color: red;">Erro ao carregar a agenda.</p>`;
    return;
  }

  // Cálculo do faturamento diário com base nos serviços agendados
  let totalRevenue = 0;
  bookings.forEach(b => {
    const s = SERVICES.find(serv => serv.name === b.servico);
    if (s) totalRevenue += s.price;
  });

  const revenueEl = document.getElementById("admin-revenue");
  if (revenueEl) revenueEl.innerText = `R$ ${totalRevenue.toFixed(2)}`;

  if (bookings.length === 0) {
    listDiv.innerHTML = `<div class="card"><p style="color:var(--text-muted); text-align:center;">Nenhum agendamento para esta data.</p></div>`;
    return;
  }

  listDiv.innerHTML = bookings.map(b => {
    const s = SERVICES.find(serv => serv.name === b.servico);
    const price = s ? s.price : 0;
    const cleanPhone = b.telefone.replace(/\D/g, '');

    return `
      <div class="card appointment-item" style="margin-bottom:10px; display:flex; justify-between; align-center;">
        <div>
          <strong>⏰ ${b.horario} - ${b.cliente}</strong><br>
          <small>${b.servico} (R$ ${price})</small><br>
          <small>📞 ${b.telefone}</small>
        </div>
        <div style="display:flex; gap:6px; flex-direction:column;">
          <a class="btn-whatsapp" href="https://wa.me/55${cleanPhone}" target="_blank">WhatsApp</a>
          <button class="btn-cancel" onclick="cancelBooking('${b.id}')">Cancelar</button>
        </div>
      </div>
    `;
  }).join('');
}

// Função auxiliar para cálculo de sobreposição
function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const date = new Date(2000, 0, 1, h, m + mins);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}