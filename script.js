/* =============================================================
   TripMate — script.js
   Aplikasi Smart Trip Planner (murni JavaScript, tanpa framework)
   Semua data disimpan di localStorage (tidak ada backend/database)
   ============================================================= */

/* ============ KUNCI LOCALSTORAGE ============ */
const LS_KEYS = {
  USER: "tm_user",
  SESSION: "tm_session",
  TRIPS: "tm_trips",
  ITINERARY: "tm_itinerary",
  BUDGET: "tm_budget",
  PACKING: "tm_packing",
  NOTES: "tm_notes",
  DARKMODE: "tm_darkmode",
  LAST_LOCATION: "tm_last_location",
  LAST_CLEANUP: "tm_last_cleanup",
};

/* ============ HELPER: LOCALSTORAGE ============ */
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ============ HELPER: FORMAT ============ */
function formatRupiah(num) {
  num = Number(num) || 0;
  return "Rp " + num.toLocaleString("id-ID");
}
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function formatDistance(meters) {
  if (meters < 1000) return Math.round(meters) + " m";
  return (meters / 1000).toFixed(1) + " km";
}
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ============ TOAST NOTIFICATION ============ */
function showToast(message, type = "info", icon = null) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const defaultIcon =
    type === "success" ? "✅" : type === "error" ? "⚠️" : "ℹ️";
  toast.innerHTML = `<span class="toast-icon">${icon || defaultIcon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "fadeIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 280);
  }, 3800);
}

/* ============ MODAL HELPERS ============ */
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.add("hidden");
  }
  if (e.target.dataset && e.target.dataset.close) {
    closeModal(e.target.dataset.close);
  }
});

/* =============================================================
   AUTENTIKASI (LOGIN / REGISTER) — disimpan di localStorage
   ============================================================= */
function initAuthPage() {
  const user = lsGet(LS_KEYS.USER, null);
  const loginExisting = document.getElementById("loginExisting");
  const loginEmpty = document.getElementById("loginEmpty");

  if (user) {
    loginExisting.classList.remove("hidden");
    loginEmpty.classList.add("hidden");
    document.getElementById("loginAvatar").textContent = user.name
      .charAt(0)
      .toUpperCase();
    document.getElementById("loginExistingName").textContent = user.name;
    document.getElementById("loginExistingEmail").textContent = user.email;
  } else {
    loginExisting.classList.add("hidden");
    loginEmpty.classList.remove("hidden");
  }

  // Tab switching
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".auth-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document
        .getElementById("loginForm")
        .classList.toggle("hidden", target !== "login");
      document
        .getElementById("registerForm")
        .classList.toggle("hidden", target !== "register");
    });
  });

  document.getElementById("btnGoRegister").addEventListener("click", () => {
    document.querySelector('.auth-tab[data-tab="register"]').click();
  });

  document.getElementById("btnLoginExisting").addEventListener("click", () => {
    lsSet(LS_KEYS.SESSION, true);
    showToast("Login berhasil, selamat datang kembali!", "success", "🎉");
    startApp();
  });

  document.getElementById("registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const newUser = {
      name: document.getElementById("regName").value.trim(),
      email: document.getElementById("regEmail").value.trim(),
      phone: document.getElementById("regPhone").value.trim(),
      address: document.getElementById("regAddress").value.trim(),
    };
    lsSet(LS_KEYS.USER, newUser);
    lsSet(LS_KEYS.SESSION, true);

    // Seed default packing list untuk pengguna baru
    if (!lsGet(LS_KEYS.PACKING, null)) {
      const defaults = [
        "Pakaian",
        "Charger",
        "Powerbank",
        "Dokumen",
        "Obat Pribadi",
        "Kamera",
      ];
      lsSet(
        LS_KEYS.PACKING,
        defaults.map((name) => ({ id: uid(), name, checked: false })),
      );
    }

    showToast("Login berhasil! Akun kamu telah dibuat.", "success", "🎉");
    startApp();
  });
}

function logout() {
  lsSet(LS_KEYS.SESSION, false);
  showToast("Kamu telah logout. Sampai jumpa lagi!", "info", "🚪");
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("authPage").classList.remove("hidden");
  initAuthPage();
}

/* =============================================================
   INISIALISASI APLIKASI SETELAH LOGIN
   ============================================================= */
function startApp() {
  document.getElementById("authPage").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");

  applyDarkMode();
  cleanupOldTrips();
  renderProfile();
  renderDashboard();
  renderTripSelectOptions();
  renderItinerary();
  renderBudget();
  renderPacking();
  renderNotes();
  updateNavUser();
}

/* ============ DARK MODE ============ */
function applyDarkMode() {
  const isDark = lsGet(LS_KEYS.DARKMODE, false);
  document.documentElement.setAttribute(
    "data-theme",
    isDark ? "dark" : "light",
  );
}
function toggleDarkMode() {
  const isDark = lsGet(LS_KEYS.DARKMODE, false);
  lsSet(LS_KEYS.DARKMODE, !isDark);
  applyDarkMode();
}

/* ============ NAV USER (Navbar) ============ */
function updateNavUser() {
  const user = lsGet(LS_KEYS.USER, { name: "Pengguna" });
  const initial = user.name.charAt(0).toUpperCase();
  document.getElementById("navAvatar").textContent = initial;
  document.getElementById("navUserName").textContent = user.name;
  document.getElementById("heroGreeting").textContent =
    `Halo, ${user.name.split(" ")[0]} 👋`;
}

/* =============================================================
   NAVIGASI ANTAR HALAMAN (DOM manipulation, tanpa reload)
   ============================================================= */
function goToPage(pageName) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById("page-" + pageName).classList.add("active");
  document
    .querySelectorAll(".nav-item[data-page]")
    .forEach((n) => n.classList.remove("active"));
  const navBtn = document.querySelector(`.nav-item[data-page="${pageName}"]`);
  if (navBtn) navBtn.classList.add("active");
  // Tutup sidebar mobile setelah pindah halaman
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =============================================================
   PROFIL
   ============================================================= */
function renderProfile() {
  const user = lsGet(LS_KEYS.USER, {});
  document.getElementById("profileAvatar").textContent = (user.name || "T")
    .charAt(0)
    .toUpperCase();
  document.getElementById("profileName").textContent = user.name || "-";
  document.getElementById("profileEmail").textContent = user.email || "-";
  document.getElementById("profilePhone").textContent = user.phone || "-";
  document.getElementById("profileAddress").textContent = user.address || "-";
}

function openEditProfile() {
  const user = lsGet(LS_KEYS.USER, {});
  document.getElementById("editName").value = user.name || "";
  document.getElementById("editEmail").value = user.email || "";
  document.getElementById("editPhone").value = user.phone || "";
  document.getElementById("editAddress").value = user.address || "";
  openModal("modalEditProfile");
}

/* =============================================================
   TRIP (Perjalanan)
   ============================================================= */
function getTrips() {
  return lsGet(LS_KEYS.TRIPS, []);
}
function saveTrips(trips) {
  lsSet(LS_KEYS.TRIPS, trips);
}

function getTripStatus(trip) {
  const today = new Date().setHours(0, 0, 0, 0);
  const start = new Date(trip.start).setHours(0, 0, 0, 0);
  const end = new Date(trip.end).setHours(0, 0, 0, 0);
  if (today < start) return { label: "Akan Datang", cls: "upcoming" };
  if (today > end) return { label: "Selesai", cls: "past" };
  return { label: "Berlangsung", cls: "ongoing" };
}

// Hapus otomatis trip yang sudah selesai lebih dari 7 hari, beserta data terkait
function cleanupOldTrips() {
  const trips = getTrips();
  const today = new Date();
  const toRemove = [];
  const kept = trips.filter((trip) => {
    const end = new Date(trip.end);
    const diffDays = (today - end) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      toRemove.push(trip.id);
      return false;
    }
    return true;
  });

  if (toRemove.length > 0) {
    saveTrips(kept);
    // Bersihkan itinerary & budget yang terkait trip yang dihapus
    const itinerary = lsGet(LS_KEYS.ITINERARY, []).filter(
      (i) => !toRemove.includes(i.tripId),
    );
    lsSet(LS_KEYS.ITINERARY, itinerary);
    const budget = lsGet(LS_KEYS.BUDGET, []).filter(
      (b) => !toRemove.includes(b.tripId),
    );
    lsSet(LS_KEYS.BUDGET, budget);
    showToast(
      `${toRemove.length} trip lama otomatis dibersihkan.`,
      "info",
      "🧹",
    );
  }
}

function createTripCard(trip, options = {}) {
  const status = getTripStatus(trip);
  const div = document.createElement("div");
  div.className = "trip-card fade-in";
  div.innerHTML = `
    <div class="trip-card-top">
      <div>
        <p class="trip-card-name">${escapeHtml(trip.name)}</p>
        <p class="trip-card-dest">📍 ${escapeHtml(trip.destination)}</p>
      </div>
      <span class="trip-badge ${status.cls}">${status.label}</span>
    </div>
    <div class="trip-card-meta">
      <span>🗓️ ${formatDate(trip.start)} — ${formatDate(trip.end)}</span>
      <span>💰 ${formatRupiah(trip.budget)}</span>
    </div>
    <div class="trip-card-actions">
      <button class="btn btn-secondary btn-sm" data-action="view-itinerary" data-id="${trip.id}">Lihat Itinerary</button>
      <button class="btn btn-sm" style="color:#ef4444;" data-action="delete-trip" data-id="${trip.id}">Hapus</button>
    </div>
  `;
  div
    .querySelector('[data-action="view-itinerary"]')
    .addEventListener("click", () => {
      goToPage("itinerary");
      document.getElementById("itineraryTripSelect").value = trip.id;
      renderItinerary();
    });
  div
    .querySelector('[data-action="delete-trip"]')
    .addEventListener("click", () => {
      if (
        confirm(
          `Hapus trip "${trip.name}"? Itinerary & budget terkait juga akan terhapus.`,
        )
      ) {
        const trips = getTrips().filter((t) => t.id !== trip.id);
        saveTrips(trips);
        lsSet(
          LS_KEYS.ITINERARY,
          lsGet(LS_KEYS.ITINERARY, []).filter((i) => i.tripId !== trip.id),
        );
        lsSet(
          LS_KEYS.BUDGET,
          lsGet(LS_KEYS.BUDGET, []).filter((b) => b.tripId !== trip.id),
        );
        showToast("Trip berhasil dihapus.", "info", "🗑️");
        renderDashboard();
        renderTripSelectOptions();
        renderItinerary();
        renderBudget();
      }
    });
  return div;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* =============================================================
   DASHBOARD
   ============================================================= */
function renderDashboard() {
  const trips = getTrips();
  const budgetEntries = lsGet(LS_KEYS.BUDGET, []);
  const packing = lsGet(LS_KEYS.PACKING, []);
  const lastLocation = lsGet(LS_KEYS.LAST_LOCATION, null);

  // Statistik
  document.getElementById("statTotalTrip").textContent = trips.length;
  const totalExpense = budgetEntries.reduce(
    (sum, b) => sum + Number(b.amount),
    0,
  );
  document.getElementById("statTotalExpense").textContent =
    formatRupiah(totalExpense);
  const packingPct = packing.length
    ? Math.round(
        (packing.filter((p) => p.checked).length / packing.length) * 100,
      )
    : 0;
  document.getElementById("statPacking").textContent = packingPct + "%";
  document.getElementById("statGps").textContent = lastLocation
    ? "Aktif"
    : "Nonaktif";

  // Perjalanan aktif (list semua trip sebagai card menarik)
  const box = document.getElementById("activeTripBox");
  box.innerHTML = "";
  if (trips.length === 0) {
    box.innerHTML =
      '<p class="empty-text">Belum ada perjalanan aktif. Buat trip baru untuk memulai!</p>';
  } else {
    const sorted = [...trips].sort(
      (a, b) => new Date(a.start) - new Date(b.start),
    );
    sorted.slice(0, 3).forEach((trip) => box.appendChild(createTripCard(trip)));
  }

  // Lokasi pengguna
  const locBox = document.getElementById("userLocationBox");
  if (lastLocation) {
    locBox.innerHTML = `
      <div class="location-active">
        <span class="loc-badge">📡 Lokasi Aktif</span>
        <p class="location-coords">Lat: ${lastLocation.lat.toFixed(5)}, Lon: ${lastLocation.lon.toFixed(5)}</p>
        <button class="btn btn-secondary btn-sm" id="btnDetectLocationDash2">Perbarui Lokasi</button>
      </div>`;
    document
      .getElementById("btnDetectLocationDash2")
      .addEventListener("click", detectLocation);
  } else {
    locBox.innerHTML = `
      <p class="empty-text">Lokasi belum dideteksi.</p>
      <button class="btn btn-secondary btn-sm" id="btnDetectLocationDash">Deteksi Lokasi Saya</button>`;
    document
      .getElementById("btnDetectLocationDash")
      .addEventListener("click", detectLocation);
  }

  // Ringkasan Budget
  const budgetBox = document.getElementById("budgetSummaryBox");
  const totalPlan = trips.reduce((sum, t) => sum + Number(t.budget), 0);
  if (totalPlan === 0 && budgetEntries.length === 0) {
    budgetBox.innerHTML = '<p class="empty-text">Belum ada data budget.</p>';
  } else {
    const remaining = totalPlan - totalExpense;
    budgetBox.innerHTML = `
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">Total Budget: <b>${formatRupiah(totalPlan)}</b></p>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">Pengeluaran: <b style="color:#dc2626">${formatRupiah(totalExpense)}</b></p>
      <p style="font-size:13px;color:var(--text-muted);">Sisa: <b style="color:var(--accent-green-dark)">${formatRupiah(remaining)}</b></p>
    `;
  }

  // Ringkasan Packing
  const packingBox = document.getElementById("packingSummaryBox");
  if (packing.length === 0) {
    packingBox.innerHTML =
      '<p class="empty-text">Belum ada barang di packing list.</p>';
  } else {
    const done = packing.filter((p) => p.checked).length;
    packingBox.innerHTML = `
      <div class="progress-labels"><span>${done} dari ${packing.length} barang siap</span><span>${packingPct}%</span></div>
      <div class="progress-bar"><div class="progress-fill green" style="width:${packingPct}%"></div></div>
    `;
  }

  updateNavUser();
}

/* =============================================================
   ITINERARY
   ============================================================= */
function getItinerary() {
  return lsGet(LS_KEYS.ITINERARY, []);
}
function saveItinerary(list) {
  lsSet(LS_KEYS.ITINERARY, list);
}

function renderTripSelectOptions() {
  const trips = getTrips();
  const selects = [
    document.getElementById("itineraryTripSelect"),
    document.getElementById("chooseTripSelect"),
  ];
  selects.forEach((select) => {
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = "";
    if (trips.length === 0) {
      select.innerHTML = '<option value="">Belum ada trip</option>';
      return;
    }
    trips.forEach((trip) => {
      const opt = document.createElement("option");
      opt.value = trip.id;
      opt.textContent = `${trip.name} (${trip.destination})`;
      select.appendChild(opt);
    });
    if (prevValue && trips.some((t) => t.id === prevValue))
      select.value = prevValue;
  });
}

function renderItinerary() {
  const list = document.getElementById("itineraryList");
  const tripSelect = document.getElementById("itineraryTripSelect");
  const tripId = tripSelect.value;
  const items = getItinerary()
    .filter((i) => i.tripId === tripId)
    .sort((a, b) => a.time.localeCompare(b.time));

  list.innerHTML = "";
  if (!tripId) {
    list.innerHTML =
      '<p class="empty-text">Buat trip terlebih dahulu untuk menambahkan itinerary.</p>';
    return;
  }
  if (items.length === 0) {
    list.innerHTML =
      '<p class="empty-text">Belum ada aktivitas untuk trip ini.</p>';
    return;
  }
  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "itinerary-item fade-in";
    el.innerHTML = `
      <div class="itn-time">${item.time}</div>
      <div class="itn-body">
        <p class="itn-activity">${escapeHtml(item.activity)}</p>
        ${item.location ? `<p class="itn-location">📍 ${escapeHtml(item.location)}</p>` : ""}
      </div>
      <button class="itn-delete" title="Hapus">🗑️</button>
    `;
    el.querySelector(".itn-delete").addEventListener("click", () => {
      saveItinerary(getItinerary().filter((i) => i.id !== item.id));
      renderItinerary();
      showToast("Aktivitas itinerary dihapus.", "info");
    });
    list.appendChild(el);
  });
}

/* =============================================================
   TEMPAT SEKITAR (Geolocation + Overpass API / OpenStreetMap)
   ============================================================= */
let currentPlaces = [];
let currentPlaceFilter = "all";
let pendingPlaceForTrip = null;

// Kategori tempat terpadu — dipakai baik untuk hasil Overpass API maupun data kurasi Kota Probolinggo
const CATEGORY_INFO = {
  wisata: { filter: "wisata", icon: "🌴", label: "Wisata" },
  kuliner: { filter: "kuliner", icon: "🍜", label: "Kuliner" },
  cafe: { filter: "cafe", icon: "☕", label: "Cafe" },
  hotel: { filter: "hotel", icon: "🏨", label: "Hotel" },
  budaya: { filter: "budaya", icon: "🛕", label: "Budaya/Religi" },
  taman: { filter: "taman", icon: "🌳", label: "Taman" },
  mall: { filter: "mall", icon: "🛍️", label: "Mall" },
  penting: { filter: "penting", icon: "🚉", label: "Tempat Penting" },
};

/*
 * DATA KURASI: TEMPAT-TEMPAT DI KOTA PROBOLINGGO
 * Sumber: rangkuman informasi publik (Dispopar Kota Probolinggo & referensi lokal).
 * Catatan: koordinat (lat/lon) bersifat PERKIRAAN berdasarkan area/alamat yang diketahui,
 * disarankan untuk diverifikasi ulang lewat Google Maps sebelum dipakai secara presisi.
 */
const PROBOLINGGO_PLACES = [
  // ---------- Wisata & tempat rekreasi ----------
  {
    name: "BEE JAY BAKAU RESORT (BJBR)",
    category: "wisata",
    address: "Kawasan Pelabuhan PPP, Mayangan",
    lat: -7.728,
    lon: 113.234,
    description: "Wisata mangrove/bakau di kawasan pelabuhan.",
  },
  {
    name: "Taman Wisata Study Lingkungan",
    category: "wisata",
    address: "Mayangan, Kota Probolinggo",
    lat: -7.73,
    lon: 113.23,
    description: "Wisata edukasi lingkungan.",
  },
  {
    name: "Gembok Cinta BJBR",
    category: "wisata",
    address: "Kawasan BJBR, Mayangan",
    lat: -7.7282,
    lon: 113.2342,
    description: "Spot foto populer di kawasan BJBR.",
  },
  {
    name: "Bundaran GLASER (Gladak Serang)",
    category: "wisata",
    address: "Pusat Kota Probolinggo",
    lat: -7.75,
    lon: 113.213,
    description: "Area publik dan tempat bersantai.",
  },
  {
    name: "Alun-Alun Probolinggo",
    category: "wisata",
    address: "Jl. Suroyo, Pusat Kota Probolinggo",
    lat: -7.7546,
    lon: 113.2159,
    description: "Ruang publik di pusat kota.",
  },
  {
    name: "Taman Maramis",
    category: "wisata",
    address: "Pusat Kota Probolinggo",
    lat: -7.753,
    lon: 113.2145,
    description: "Taman kota untuk berbagai kegiatan dan event.",
  },
  {
    name: "Museum Probolinggo",
    category: "budaya",
    address: "Pusat Kota Probolinggo",
    lat: -7.755,
    lon: 113.217,
    description: "Wisata sejarah dan budaya.",
  },
  {
    name: "Museum Dr. Moh. Saleh",
    category: "budaya",
    address: "Jl. Dr. Moch Saleh, Kota Probolinggo",
    lat: -7.7555,
    lon: 113.2175,
    description: "Museum wisata sejarah.",
  },
  {
    name: "Klenteng Tri Dharma",
    category: "budaya",
    address: "Kawasan Pecinan, Kota Probolinggo",
    lat: -7.74,
    lon: 113.22,
    description: "Wisata religi dan budaya Tionghoa.",
  },
  {
    name: "Gereja Merah",
    category: "budaya",
    address: "Kawasan Pusat Kota Probolinggo",
    lat: -7.738,
    lon: 113.223,
    description: "Bangunan gereja bersejarah.",
  },

  // ---------- Cafe & tempat nongkrong ----------
  {
    name: "BARREL Coffee Garage",
    category: "cafe",
    address: "Jl. Mt. Haryono, Kota Probolinggo",
    lat: -7.757,
    lon: 113.219,
  },
  {
    name: "Daily Dose Coffee",
    category: "cafe",
    address: "Jl. D.I. Panjaitan, Kota Probolinggo",
    lat: -7.76,
    lon: 113.214,
  },
  {
    name: "Simposium Coffee (Headquarter)",
    category: "cafe",
    address: "Jl. Dr. Moch Saleh, Kota Probolinggo",
    lat: -7.7555,
    lon: 113.2178,
  },
  {
    name: "ALIBI CAFE",
    category: "cafe",
    address: "Jl. R.A. Kartini, Kota Probolinggo",
    lat: -7.753,
    lon: 113.21,
  },
  {
    name: "Mak Jleb Coffee & Kedai",
    category: "cafe",
    address: "Kanigaran, Kota Probolinggo",
    lat: -7.748,
    lon: 113.223,
  },
  {
    name: "Putri Lingga Coffee & Micro Roastery",
    category: "cafe",
    address: "Kademangan, Kota Probolinggo",
    lat: -7.765,
    lon: 113.205,
  },
  {
    name: "Altruist Coffee",
    category: "cafe",
    address: "Kawasan Mastrip, Kota Probolinggo",
    lat: -7.762,
    lon: 113.226,
  },
  {
    name: "RUMAH NENEK Coffee Shop",
    category: "cafe",
    address: "Kota Probolinggo",
    lat: -7.756,
    lon: 113.22,
  },
  {
    name: "Kedai27 Probolinggo",
    category: "cafe",
    address: "Kota Probolinggo",
    lat: -7.754,
    lon: 113.218,
  },

  // ---------- Kuliner ----------
  {
    name: "Bakso Probolinggo",
    category: "kuliner",
    address: "Kota Probolinggo",
    lat: -7.755,
    lon: 113.216,
  },
  {
    name: "Kupang Lontong Pahlawan",
    category: "kuliner",
    address: "Jl. Pahlawan, Kota Probolinggo",
    lat: -7.75,
    lon: 113.219,
  },
  {
    name: "Rawon Gunawan",
    category: "kuliner",
    address: "Kota Probolinggo",
    lat: -7.756,
    lon: 113.215,
  },
  {
    name: "Ikan Bakar Gatsu",
    category: "kuliner",
    address: "Jl. Gatot Subroto, Kota Probolinggo",
    lat: -7.748,
    lon: 113.228,
  },
  {
    name: "Nasi Pecel Pocong",
    category: "kuliner",
    address: "Kota Probolinggo",
    lat: -7.757,
    lon: 113.213,
  },
  {
    name: "Soto Ayam Pak Madjar",
    category: "kuliner",
    address: "Kota Probolinggo",
    lat: -7.754,
    lon: 113.22,
  },
  {
    name: "Bebek Goreng Bu Lely",
    category: "kuliner",
    address: "Kota Probolinggo",
    lat: -7.759,
    lon: 113.217,
  },
  {
    name: "Tahu Kikil Brak",
    category: "kuliner",
    address: "Kota Probolinggo",
    lat: -7.752,
    lon: 113.214,
  },
  {
    name: "Mie Jawa Guntur",
    category: "kuliner",
    address: "Kota Probolinggo",
    lat: -7.7555,
    lon: 113.219,
  },
  {
    name: "Rumah Makan Sari Laut SJDW",
    category: "kuliner",
    address: "Kawasan Pesisir, Kota Probolinggo",
    lat: -7.746,
    lon: 113.226,
  },

  // ---------- Hotel / penginapan ----------
  {
    name: "Bromo Park Hotel",
    category: "hotel",
    address: "Kota Probolinggo",
    lat: -7.754,
    lon: 113.2175,
  },
  {
    name: "Bromo View Hotel",
    category: "hotel",
    address: "Kota Probolinggo",
    lat: -7.756,
    lon: 113.2185,
  },
  {
    name: "Paseban Sena (Ballroom, Hotel & Restaurant)",
    category: "hotel",
    address: "Kota Probolinggo",
    lat: -7.75,
    lon: 113.21,
  },
  {
    name: "Caldera Park Homestay",
    category: "hotel",
    address: "Kota Probolinggo",
    lat: -7.76,
    lon: 113.22,
  },
  {
    name: "RedDoorz @ Hotel Tampiarto",
    category: "hotel",
    address: "Kota Probolinggo, Jawa Timur",
    lat: -7.757,
    lon: 113.216,
  },

  // ---------- Tempat penting ----------
  {
    name: "Stasiun Probolinggo",
    category: "penting",
    address: "Kota Probolinggo",
    lat: -7.7561,
    lon: 113.2166,
    description: "Stasiun kereta api.",
  },
  {
    name: "Terminal Bayuangga",
    category: "penting",
    address: "Kota Probolinggo",
    lat: -7.7386,
    lon: 113.1935,
    description: "Terminal bus utama.",
  },
  {
    name: "Pelabuhan Tanjung Tembaga",
    category: "penting",
    address: "Mayangan, Kota Probolinggo",
    lat: -7.728,
    lon: 113.238,
    description: "Pelabuhan utama Kota Probolinggo.",
  },
  {
    name: "Pelabuhan Perikanan Pantai Mayangan",
    category: "penting",
    address: "Mayangan, Kota Probolinggo",
    lat: -7.729,
    lon: 113.232,
    description: "Pelabuhan perikanan.",
  },
  {
    name: "GOR Ahmad Yani",
    category: "penting",
    address: "Kota Probolinggo",
    lat: -7.762,
    lon: 113.214,
    description: "Gedung olahraga.",
  },
].map((p) => ({ id: "probolinggo-" + uid(), source: "curated", ...p }));

// Batas koordinat wilayah Indonesia (bounding box, dengan sedikit toleransi)
// Lintang: -11.5 (selatan, Pulau Rote) s.d. 6.5 (utara, Pulau Weh)
// Bujur: 94.5 (barat, Sabang) s.d. 141.5 (timur, Merauke)
const INDONESIA_BOUNDS = {
  minLat: -11.5,
  maxLat: 6.5,
  minLon: 94.5,
  maxLon: 141.5,
};

function isInsideIndonesia(lat, lon) {
  return (
    lat >= INDONESIA_BOUNDS.minLat &&
    lat <= INDONESIA_BOUNDS.maxLat &&
    lon >= INDONESIA_BOUNDS.minLon &&
    lon <= INDONESIA_BOUNDS.maxLon
  );
}

function detectLocation() {
  if (!navigator.geolocation) {
    showToast("Browser kamu tidak mendukung fitur lokasi.", "error");
    return;
  }
  showToast("Meminta izin akses lokasi...", "info", "📡");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      // Fitur deteksi lokasi hanya berlaku untuk pengguna yang berada di wilayah Indonesia
      if (!isInsideIndonesia(lat, lon)) {
        showToast(
          "Fitur deteksi lokasi hanya tersedia untuk pengguna di Indonesia.",
          "error",
          "🇮🇩",
        );
        renderPlacesStatusOutsideIndonesia();
        return;
      }

      lsSet(LS_KEYS.LAST_LOCATION, { lat, lon, timestamp: Date.now() });
      showToast("Lokasi berhasil ditemukan!", "success", "📍");
      renderDashboard();
      renderPlacesStatus();
      fetchNearbyPlaces(lat, lon);
    },
    (error) => {
      showToast(
        "Izin lokasi ditolak atau gagal mendapatkan lokasi.",
        "error",
        "🚫",
      );
    },
    { enableHighAccuracy: true, timeout: 12000 },
  );
}

// Tampilkan pesan khusus di halaman Tempat Sekitar jika lokasi pengguna di luar Indonesia
function renderPlacesStatusOutsideIndonesia() {
  const box = document.getElementById("placesStatusBox");
  if (box) {
    box.innerHTML =
      '<p class="empty-text">📍 Lokasimu terdeteksi di luar Indonesia. Fitur Tempat Sekitar hanya tersedia untuk wilayah Indonesia.</p>';
  }
  const grid = document.getElementById("placesGrid");
  if (grid) grid.innerHTML = "";
}

function renderPlacesStatus() {
  const box = document.getElementById("placesStatusBox");
  const loc = lsGet(LS_KEYS.LAST_LOCATION, null);
  if (!loc) {
    box.innerHTML =
      '<p class="empty-text">Aktifkan lokasi untuk menemukan tempat menarik di sekitarmu.</p>';
    return;
  }
  box.innerHTML = `
    <div class="location-active">
      <span class="loc-badge">📡 Lokasi Aktif</span>
      <p class="location-coords">Lat: ${loc.lat.toFixed(5)}, Lon: ${loc.lon.toFixed(5)} · diperbarui ${new Date(loc.timestamp).toLocaleTimeString("id-ID")}</p>
    </div>
  `;
}

// Tampilkan data kurasi Kota Probolinggo secara default (tanpa perlu deteksi lokasi dulu)
function renderCuratedPlacesDefault() {
  currentPlaces = PROBOLINGGO_PLACES.map((p) => ({ ...p, distance: null }));
  renderPlacesGrid();
}

async function fetchNearbyPlaces(lat, lon) {
  const grid = document.getElementById("placesGrid");
  grid.innerHTML =
    '<p class="empty-text">🔎 Mencari tempat menarik di sekitarmu...</p>';

  // Data kurasi Kota Probolinggo selalu disertakan (dengan jarak dari lokasi pengguna)
  const curatedWithDistance = PROBOLINGGO_PLACES.map((p) => ({
    ...p,
    distance: haversineDistance(lat, lon, p.lat, p.lon),
  }));

  const radius = 2000; // 2 km
  const query = `
    [out:json][timeout:25];
    (
      node["tourism"="attraction"](around:${radius},${lat},${lon});
      node["amenity"="restaurant"](around:${radius},${lat},${lon});
      node["amenity"="cafe"](around:${radius},${lat},${lon});
      node["tourism"="hotel"](around:${radius},${lat},${lon});
      node["leisure"="park"](around:${radius},${lat},${lon});
      node["shop"="mall"](around:${radius},${lat},${lon});
    );
    out center 60;
  `;

  let apiPlaces = [];
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    });
    if (!response.ok) throw new Error("Overpass API error");
    const data = await response.json();

    apiPlaces = (data.elements || [])
      .filter((el) => el.tags && el.tags.name)
      .map((el) => {
        let category = "wisata";
        if (el.tags.amenity === "restaurant") category = "kuliner";
        else if (el.tags.amenity === "cafe") category = "cafe";
        else if (el.tags.tourism === "hotel") category = "hotel";
        else if (el.tags.leisure === "park") category = "taman";
        else if (el.tags.shop === "mall") category = "mall";

        const plat = el.lat || (el.center && el.center.lat);
        const plon = el.lon || (el.center && el.center.lon);
        return {
          id: "osm-" + el.id,
          source: "api",
          name: el.tags.name,
          category,
          lat: plat,
          lon: plon,
          distance: haversineDistance(lat, lon, plat, plon),
        };
      });
  } catch (err) {
    showToast(
      "Gagal mengambil data tempat sekitar dari OpenStreetMap.",
      "error",
    );
  }

  // Gabungkan data kurasi Kota Probolinggo dengan hasil live dari Overpass API, urutkan berdasarkan jarak
  currentPlaces = [...curatedWithDistance, ...apiPlaces]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 40);

  renderPlacesGrid();
}

function renderPlacesGrid() {
  const grid = document.getElementById("placesGrid");
  grid.innerHTML = "";
  const filtered =
    currentPlaceFilter === "all"
      ? currentPlaces
      : currentPlaces.filter(
          (p) => CATEGORY_INFO[p.category].filter === currentPlaceFilter,
        );

  if (filtered.length === 0) {
    grid.innerHTML =
      '<p class="empty-text">Tidak ada tempat ditemukan untuk kategori ini.</p>';
    return;
  }

  filtered.forEach((place) => {
    const info = CATEGORY_INFO[place.category];
    const isCurated = place.source === "curated";
    const distanceOrAddress =
      place.distance !== null && place.distance !== undefined
        ? `📏 ${formatDistance(place.distance)} dari lokasimu`
        : `📍 ${escapeHtml(place.address || "Kota Probolinggo")}`;

    const card = document.createElement("div");
    card.className = "place-card fade-in";
    card.innerHTML = `
      <div class="place-card-icon">${info.icon}</div>
      <p class="place-card-name">${escapeHtml(place.name)}</p>
      <p class="place-card-type">${info.label}${isCurated ? " · Kota Probolinggo" : ""}</p>
      <p class="place-card-dist">${distanceOrAddress}</p>
      <div class="place-card-actions">
        <button class="btn btn-secondary btn-sm" data-action="view-map">🗺️ Lihat Peta</button>
        <button class="btn btn-primary btn-sm" data-action="add-trip">+ Trip</button>
      </div>
    `;
    card
      .querySelector('[data-action="view-map"]')
      .addEventListener("click", () => {
        window.open(
          `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=18/${place.lat}/${place.lon}`,
          "_blank",
        );
      });
    card
      .querySelector('[data-action="add-trip"]')
      .addEventListener("click", () => {
        if (getTrips().length === 0) {
          showToast(
            "Buat trip terlebih dahulu sebelum menambahkan tempat.",
            "error",
          );
          return;
        }
        pendingPlaceForTrip = place;
        renderTripSelectOptions();
        openModal("modalChooseTrip");
      });
    grid.appendChild(card);
  });
}

/* =============================================================
   BUDGET
   ============================================================= */
const BUDGET_CATEGORY_ICON = {
  Transportasi: "🚗",
  Hotel: "🏨",
  Makanan: "🍜",
  Tiket: "🎫",
  Shopping: "🛍️",
  Lainnya: "📦",
};

function renderBudget() {
  const trips = getTrips();
  const entries = lsGet(LS_KEYS.BUDGET, []);
  const totalPlan = trips.reduce((sum, t) => sum + Number(t.budget), 0);
  const totalSpent = entries.reduce((sum, b) => sum + Number(b.amount), 0);
  const remaining = totalPlan - totalSpent;
  const pct =
    totalPlan > 0
      ? Math.min(100, Math.round((totalSpent / totalPlan) * 100))
      : 0;

  document.getElementById("budgetTotalPlan").textContent =
    formatRupiah(totalPlan);
  document.getElementById("budgetTotalSpent").textContent =
    formatRupiah(totalSpent);
  document.getElementById("budgetRemaining").textContent =
    formatRupiah(remaining);
  document.getElementById("budgetProgressText").textContent = pct + "%";
  document.getElementById("budgetProgressFill").style.width = pct + "%";

  const list = document.getElementById("budgetList");
  list.innerHTML = "";
  if (entries.length === 0) {
    list.innerHTML =
      '<p class="empty-text">Belum ada pengeluaran tercatat.</p>';
    return;
  }
  [...entries].reverse().forEach((entry) => {
    const el = document.createElement("div");
    el.className = "budget-item fade-in";
    el.innerHTML = `
      <div class="budget-item-left">
        <span class="budget-cat-badge">${BUDGET_CATEGORY_ICON[entry.category] || "📦"}</span>
        <div>
          <p class="budget-item-cat">${escapeHtml(entry.category)}</p>
          ${entry.note ? `<p class="budget-item-note">${escapeHtml(entry.note)}</p>` : ""}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="budget-item-amount">-${formatRupiah(entry.amount)}</span>
        <button class="budget-item-delete" title="Hapus">🗑️</button>
      </div>
    `;
    el.querySelector(".budget-item-delete").addEventListener("click", () => {
      lsSet(
        LS_KEYS.BUDGET,
        lsGet(LS_KEYS.BUDGET, []).filter((b) => b.id !== entry.id),
      );
      renderBudget();
      renderDashboard();
      showToast("Pengeluaran dihapus.", "info");
    });
    list.appendChild(el);
  });
}

/* =============================================================
   PACKING LIST
   ============================================================= */
function renderPacking() {
  const packing = lsGet(LS_KEYS.PACKING, []);
  const list = document.getElementById("packingList");
  list.innerHTML = "";

  const done = packing.filter((p) => p.checked).length;
  const pct = packing.length ? Math.round((done / packing.length) * 100) : 0;
  document.getElementById("packingProgressText").textContent = pct + "%";
  document.getElementById("packingProgressFill").style.width = pct + "%";

  if (packing.length === 0) {
    list.innerHTML =
      '<p class="empty-text">Belum ada barang. Tambahkan barang bawaanmu!</p>';
    return;
  }

  packing.forEach((item) => {
    const el = document.createElement("div");
    el.className = "packing-item fade-in" + (item.checked ? " checked" : "");
    el.innerHTML = `
      <div class="packing-checkbox ${item.checked ? "checked" : ""}">${item.checked ? "✓" : ""}</div>
      <span class="packing-item-name">${escapeHtml(item.name)}</span>
      <button class="packing-item-delete" title="Hapus">🗑️</button>
    `;
    el.querySelector(".packing-checkbox").addEventListener("click", () => {
      const items = lsGet(LS_KEYS.PACKING, []).map((p) =>
        p.id === item.id ? { ...p, checked: !p.checked } : p,
      );
      lsSet(LS_KEYS.PACKING, items);
      renderPacking();
      renderDashboard();
    });
    el.querySelector(".packing-item-delete").addEventListener("click", () => {
      lsSet(
        LS_KEYS.PACKING,
        lsGet(LS_KEYS.PACKING, []).filter((p) => p.id !== item.id),
      );
      renderPacking();
      renderDashboard();
      showToast("Barang dihapus dari packing list.", "info");
    });
    list.appendChild(el);
  });
}

/* =============================================================
   CATATAN (NOTES)
   ============================================================= */
function renderNotes() {
  const notes = lsGet(LS_KEYS.NOTES, []);
  const grid = document.getElementById("notesGrid");
  grid.innerHTML = "";
  if (notes.length === 0) {
    grid.innerHTML = '<p class="empty-text">Belum ada catatan perjalanan.</p>';
    return;
  }
  [...notes].reverse().forEach((note) => {
    const el = document.createElement("div");
    el.className = "note-card fade-in";
    el.innerHTML = `
      <button class="note-delete" title="Hapus">✕</button>
      <p class="note-title">${escapeHtml(note.title)}</p>
      <p class="note-content">${escapeHtml(note.content)}</p>
    `;
    el.querySelector(".note-delete").addEventListener("click", () => {
      lsSet(
        LS_KEYS.NOTES,
        lsGet(LS_KEYS.NOTES, []).filter((n) => n.id !== note.id),
      );
      renderNotes();
      showToast("Catatan dihapus.", "info");
    });
    grid.appendChild(el);
  });
}

/* =============================================================
   PENCARIAN GLOBAL (NAVBAR)
   ============================================================= */
function performGlobalSearch(query) {
  const resultsBox = document.getElementById("searchResults");
  query = query.trim().toLowerCase();
  if (!query) {
    resultsBox.classList.add("hidden");
    return;
  }

  const results = [];
  getTrips().forEach((trip) => {
    if (
      trip.name.toLowerCase().includes(query) ||
      trip.destination.toLowerCase().includes(query)
    ) {
      results.push({
        type: "Trip",
        title: `${trip.name} — ${trip.destination}`,
        page: "itinerary",
        tripId: trip.id,
      });
    }
  });
  getItinerary().forEach((item) => {
    if (
      item.activity.toLowerCase().includes(query) ||
      (item.location || "").toLowerCase().includes(query)
    ) {
      results.push({
        type: "Itinerary",
        title: item.activity,
        page: "itinerary",
        tripId: item.tripId,
      });
    }
  });
  lsGet(LS_KEYS.NOTES, []).forEach((note) => {
    if (
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    ) {
      results.push({ type: "Catatan", title: note.title, page: "notes" });
    }
  });

  resultsBox.innerHTML = "";
  if (results.length === 0) {
    resultsBox.innerHTML =
      '<div class="search-empty">Tidak ada hasil ditemukan.</div>';
  } else {
    results.slice(0, 10).forEach((r) => {
      const item = document.createElement("div");
      item.className = "search-result-item";
      item.innerHTML = `<p class="search-result-type">${r.type}</p><p class="search-result-title">${escapeHtml(r.title)}</p>`;
      item.addEventListener("click", () => {
        goToPage(r.page);
        if (r.page === "itinerary" && r.tripId) {
          document.getElementById("itineraryTripSelect").value = r.tripId;
          renderItinerary();
        }
        resultsBox.classList.add("hidden");
        document.getElementById("globalSearch").value = "";
      });
      resultsBox.appendChild(item);
    });
  }
  resultsBox.classList.remove("hidden");
}

/* =============================================================
   EVENT LISTENERS (dijalankan setelah DOM siap)
   ============================================================= */
document.addEventListener("DOMContentLoaded", () => {
  applyDarkMode();

  // Cek sesi login
  const user = lsGet(LS_KEYS.USER, null);
  const session = lsGet(LS_KEYS.SESSION, false);
  if (user && session) {
    startApp();
  } else {
    initAuthPage();
  }

  /* ---------- SIDEBAR NAVIGATION ---------- */
  document.querySelectorAll(".nav-item[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => goToPage(btn.dataset.page));
  });

  /* ---------- HAMBURGER / MOBILE SIDEBAR ---------- */
  document.getElementById("hamburgerBtn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("sidebarOverlay").classList.add("show");
  });
  document.getElementById("sidebarOverlay").addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("show");
  });

  /* ---------- DARK MODE ---------- */
  document
    .getElementById("darkModeToggleSidebar")
    .addEventListener("click", toggleDarkMode);
  document
    .getElementById("darkModeToggleTop")
    .addEventListener("click", toggleDarkMode);

  /* ---------- LOGOUT ---------- */
  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("Yakin ingin logout?")) logout();
  });

  /* ---------- PROFIL ---------- */
  document
    .getElementById("btnEditProfile")
    .addEventListener("click", openEditProfile);
  document.getElementById("formEditProfile").addEventListener("submit", (e) => {
    e.preventDefault();
    const updated = {
      name: document.getElementById("editName").value.trim(),
      email: document.getElementById("editEmail").value.trim(),
      phone: document.getElementById("editPhone").value.trim(),
      address: document.getElementById("editAddress").value.trim(),
    };
    lsSet(LS_KEYS.USER, updated);
    renderProfile();
    updateNavUser();
    closeModal("modalEditProfile");
    showToast("Data berhasil disimpan.", "success", "✅");
  });

  /* ---------- DASHBOARD SHORTCUTS ---------- */
  document
    .getElementById("btnCariSekitar")
    .addEventListener("click", () => goToPage("places"));
  document
    .getElementById("btnLihatItinerary")
    .addEventListener("click", () => goToPage("itinerary"));
  document
    .getElementById("btnNewTripDash")
    .addEventListener("click", () => openModal("modalTrip"));
  document
    .getElementById("btnDetectLocationDash")
    ?.addEventListener("click", detectLocation);

  /* ---------- MODAL: TRIP BARU ---------- */
  document.getElementById("formTrip").addEventListener("submit", (e) => {
    e.preventDefault();
    const start = document.getElementById("tripStart").value;
    const end = document.getElementById("tripEnd").value;
    if (new Date(end) < new Date(start)) {
      showToast("Tanggal selesai tidak boleh sebelum tanggal mulai.", "error");
      return;
    }
    const trip = {
      id: uid(),
      name: document.getElementById("tripName").value.trim(),
      destination: document.getElementById("tripDestination").value.trim(),
      start,
      end,
      budget: Number(document.getElementById("tripBudget").value),
      createdAt: Date.now(),
    };
    const trips = getTrips();
    trips.push(trip);
    saveTrips(trips);
    e.target.reset();
    closeModal("modalTrip");
    renderDashboard();
    renderTripSelectOptions();
    renderBudget();
    showToast("Trip berhasil dibuat!", "success", "✈️");
  });

  /* ---------- ITINERARY ---------- */
  document
    .getElementById("itineraryTripSelect")
    .addEventListener("change", renderItinerary);
  document.getElementById("btnAddItinerary").addEventListener("click", () => {
    if (!document.getElementById("itineraryTripSelect").value) {
      showToast("Buat trip terlebih dahulu.", "error");
      return;
    }
    openModal("modalItinerary");
  });
  document.getElementById("formItinerary").addEventListener("submit", (e) => {
    e.preventDefault();
    const tripId = document.getElementById("itineraryTripSelect").value;
    const item = {
      id: uid(),
      tripId,
      time: document.getElementById("itnTime").value,
      activity: document.getElementById("itnActivity").value.trim(),
      location: document.getElementById("itnLocation").value.trim(),
    };
    const list = getItinerary();
    list.push(item);
    saveItinerary(list);
    e.target.reset();
    closeModal("modalItinerary");
    renderItinerary();
    showToast("Data berhasil disimpan.", "success");
  });

  /* ---------- TEMPAT SEKITAR ---------- */
  document
    .getElementById("btnDetectLocationPlaces")
    .addEventListener("click", detectLocation);
  renderPlacesStatus();
  document.querySelectorAll("#placesFilter .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document
        .querySelectorAll("#placesFilter .chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentPlaceFilter = chip.dataset.filter;
      renderPlacesGrid();
    });
  });
  // Jika sudah pernah deteksi lokasi sebelumnya, muat ulang tempat sekitar (kurasi + live API).
  // Jika belum, tampilkan dulu data kurasi Kota Probolinggo sebagai rekomendasi awal.
  const savedLoc = lsGet(LS_KEYS.LAST_LOCATION, null);
  if (savedLoc) {
    fetchNearbyPlaces(savedLoc.lat, savedLoc.lon);
  } else {
    renderCuratedPlacesDefault();
  }

  document
    .getElementById("btnConfirmAddToTrip")
    .addEventListener("click", () => {
      const tripId = document.getElementById("chooseTripSelect").value;
      if (!tripId || !pendingPlaceForTrip) return;
      const info = CATEGORY_INFO[pendingPlaceForTrip.category];
      const list = getItinerary();
      list.push({
        id: uid(),
        tripId,
        time: document.getElementById("chooseTripTime").value || "08:00",
        activity: `Kunjungi ${pendingPlaceForTrip.name}`,
        location: `${info.label} — ${pendingPlaceForTrip.name}`,
      });
      saveItinerary(list);
      closeModal("modalChooseTrip");
      pendingPlaceForTrip = null;
      showToast("Tempat berhasil ditambahkan ke itinerary!", "success", "📌");
    });

  /* ---------- BUDGET ---------- */
  document
    .getElementById("btnAddBudget")
    .addEventListener("click", () => openModal("modalBudget"));
  document.getElementById("formBudget").addEventListener("submit", (e) => {
    e.preventDefault();
    const entry = {
      id: uid(),
      category: document.getElementById("budgetCategory").value,
      amount: Number(document.getElementById("budgetNominal").value),
      note: document.getElementById("budgetNote").value.trim(),
      date: Date.now(),
    };
    const list = lsGet(LS_KEYS.BUDGET, []);
    list.push(entry);
    lsSet(LS_KEYS.BUDGET, list);
    e.target.reset();
    closeModal("modalBudget");
    renderBudget();
    renderDashboard();
    showToast("Data berhasil disimpan.", "success");
  });

  /* ---------- PACKING LIST ---------- */
  document
    .getElementById("btnAddPacking")
    .addEventListener("click", () => openModal("modalPacking"));
  document.getElementById("formPacking").addEventListener("submit", (e) => {
    e.preventDefault();
    const list = lsGet(LS_KEYS.PACKING, []);
    list.push({
      id: uid(),
      name: document.getElementById("packingItemName").value.trim(),
      checked: false,
    });
    lsSet(LS_KEYS.PACKING, list);
    e.target.reset();
    closeModal("modalPacking");
    renderPacking();
    renderDashboard();
    showToast("Barang packing ditambahkan.", "success", "🎒");
  });

  /* ---------- NOTES ---------- */
  document
    .getElementById("btnAddNote")
    .addEventListener("click", () => openModal("modalNote"));
  document.getElementById("formNote").addEventListener("submit", (e) => {
    e.preventDefault();
    const list = lsGet(LS_KEYS.NOTES, []);
    list.push({
      id: uid(),
      title: document.getElementById("noteTitle").value.trim(),
      content: document.getElementById("noteContent").value.trim(),
      createdAt: Date.now(),
    });
    lsSet(LS_KEYS.NOTES, list);
    e.target.reset();
    closeModal("modalNote");
    renderNotes();
    showToast("Catatan berhasil disimpan.", "success");
  });

  /* ---------- GLOBAL SEARCH ---------- */
  const searchInput = document.getElementById("globalSearch");
  searchInput.addEventListener("input", () =>
    performGlobalSearch(searchInput.value),
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".topbar-search")) {
      document.getElementById("searchResults").classList.add("hidden");
    }
  });
});
