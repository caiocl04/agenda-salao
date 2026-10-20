// CONFIGURAÇÕES DO SALÃO
const CONFIG = {
  salonPhone: "5511999999999", // Coloque o WhatsApp do Salão aqui com DDD
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
  // Define a data mínima para hoje
  const today = new Date().toISOString().split('T')[0];
  document.getElementById("booking-date").min = today;
  document.getElementById("booking-date").value = today;
  document.getElementById("admin-date").value = today;
  renderSlots();
});

function getBookings() {
  return JSON.parse(localStorage.getItem("salon_bookings") || "[]");
}

function saveBookings(bookings) {
  localStorage.setItem("salon_bookings", JSON.stringify(bookings));
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(el => el.classList.remove("active"));
  
  document.getElementById(`tab-${tabName}`).classList.add("active");
  event.target.classList.add("active");

  if(tabName === 'admin') renderAdminSchedule();
}

function renderServices() {
  const container = document.getElementById("services-container");
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

function renderSlots() {
  const dateVal = document.getElementById("booking-date").value;
  const container = document.getElementById("slots-container");
  if(!dateVal) return;

  const bookings = getBookings().filter(b => b.date === dateVal);
  const slots = [];

  for(let h = CONFIG.startHour; h < CONFIG.endHour; h++) {
    for(let m = 0; m < 60; m += CONFIG.slotInterval) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push(timeStr);
    }
  }

  container.innerHTML = slots.map(time => {
    const isOccupied = bookings.some(b => {
      // Checa sobreposição de horários
      const bStart = b.time;
      const bEnd = addMinutes(b.time, b.serviceDuration);
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

function confirmBooking() {
  const date = document.getElementById("booking-date").value;
  const name = document.getElementById("client-name").value.trim();
  const phone = document.getElementById("client-phone").value.trim();

  if(!selectedSlot) return alert("Por favor, selecione um horário.");
  if(!name) return alert("Por favor, informe seu nome.");
  if(!phone) return alert("Por favor, informe seu telefone.");

  const newBooking = {
    id: Date.now().toString(),
    serviceName: selectedService.name,
    serviceDuration: selectedService.duration,
    price: selectedService.price,
    date: date,
    time: selectedSlot,
    clientName: name,
    clientPhone: phone
  };

  const bookings = getBookings();
  bookings.push(newBooking);
  saveBookings(bookings);

  alert("Agendamento realizado com sucesso!");

  // Envia confirmação via WhatsApp
  const msg = encodeURIComponent(`Olá! Fiz um agendamento no salão:\n\n✂️ *Serviço:* ${selectedService.name}\n📅 *Data:* ${date}\n⏰ *Horário:* ${selectedSlot}\n👤 *Cliente:* ${name}`);
  window.open(`https://wa.me/${CONFIG.salonPhone}?text=${msg}`, "_blank");

  // Reset campos
  selectedSlot = null;
  document.getElementById("client-name").value = "";
  document.getElementById("client-phone").value = "";
  renderSlots();
}

function searchClientBookings() {
  const phone = document.getElementById("search-phone").value.trim();
  const resultsDiv = document.getElementById("client-results");
  if(!phone) return alert("Digite o telefone para pesquisar.");

  const bookings = getBookings().filter(b => b.clientPhone.includes(phone));

  if(bookings.length === 0) {
    resultsDiv.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin-top:20px;">Nenhum agendamento encontrado.</p>`;
    return;
  }

  resultsDiv.innerHTML = bookings.map(b => `
    <div class="card appointment-item">
      <div>
        <strong>${b.serviceName}</strong><br>
        <small>📅 ${b.date} às ⏰ ${b.time} - R$ ${b.price}</small>
      </div>
      <button class="btn-cancel" onclick="cancelBooking('${b.id}')">Cancelar</button>
    </div>
  `).join('');
}

function cancelBooking(id) {
  if(!confirm("Tem certeza que deseja cancelar este agendamento?")) return;
  let bookings = getBookings().filter(b => b.id !== id);
  saveBookings(bookings);
  alert("Agendamento cancelado.");
  searchClientBookings();
  renderAdminSchedule();
  renderSlots();
}

// ÁREA DO PROFISSIONAL
function unlockAdmin() {
  const pin = document.getElementById("admin-pin").value;
  if(pin === CONFIG.adminPIN) {
    document.getElementById("admin-login-card").style.display = "none";
    document.getElementById("admin-panel").style.display = "block";
    renderAdminSchedule();
  } else {
    alert("PIN incorreto!");
  }
}

function renderAdminSchedule() {
  const date = document.getElementById("admin-date").value;
  const bookings = getBookings().filter(b => b.date === date);
  
  // Ordena por horário
  bookings.sort((a,b) => a.time.localeCompare(b.time));

  const totalRevenue = bookings.reduce((sum, b) => sum + b.price, 0);
  document.getElementById("admin-revenue").innerText = `R$ ${totalRevenue.toFixed(2)}`;

  const listDiv = document.getElementById("admin-schedule-list");
  if(bookings.length === 0) {
    listDiv.innerHTML = `<div class="card"><p style="color:var(--text-muted); text-align:center;">Nenhum agendamento para esta data.</p></div>`;
    return;
  }

  listDiv.innerHTML = bookings.map(b => `
    <div class="card appointment-item">
      <div>
        <strong>⏰ ${b.time} - ${b.clientName}</strong><br>
        <small>${b.serviceName} (R$ ${b.price})</small><br>
        <small>📞 ${b.clientPhone}</small>
      </div>
      <div style="display:flex; gap:6px; flex-direction:column;">
        <a class="btn-whatsapp" href="https://wa.me/55${b.clientPhone.replace(/\D/g,'')}" target="_blank">WhatsApp</a>
        <button class="btn-cancel" onclick="cancelBooking('${b.id}')">Cancelar</button>
      </div>
    </div>
  `).join('');
}

// Função auxiliar para cálculo de sobreposição
function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const date = new Date(2000, 0, 1, h, m + mins);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}