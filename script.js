/* =============================================================
   TripMate — script.js  (versi gabungan + perbaikan lokasi)
   Aplikasi Smart Trip Planner (JavaScript murni, data di localStorage)
   ============================================================= */

/* ============ KUNCI LOCALSTORAGE ============ */
const LS_KEYS = {
  USER: "tm_user",
  ACCOUNTS: "tm_accounts",
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
    return raw === null ? fallback : JSON.parse(raw);
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
  return "Rp " + (Number(num) || 0).toLocaleString("id-ID");
}
function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function formatDistance(meters) {
  return meters < 1000
    ? Math.round(meters) + " m"
    : (meters / 1000).toFixed(1) + " km";
}
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  if (e.target.classList.contains("modal-overlay"))
    e.target.classList.add("hidden");
  if (e.target.dataset && e.target.dataset.close)
    closeModal(e.target.dataset.close);
});

/* =============================================================
   AUTENTIKASI
   1. Google Sign-In (OAuth resmi) — password Google tidak pernah masuk ke app.
   2. Akun TripMate — email + password lokal, disimpan sebagai hash.
   CATATAN: tanpa backend, hash tersimpan di browser. Cukup untuk tugas/demo,
   bukan keamanan produksi. Jangan pakai password asli Google/bank di sini.
   ============================================================= */
const GOOGLE_CLIENT_ID = ""; // <-- isi dengan OAuth Client ID milikmu

/* ---------- VALIDASI EMAIL ---------- */
const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.id",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "proton.me",
];
const DOMAIN_TYPOS = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.con": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.om": "gmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "hotmial.com": "hotmail.com",
};

function validateEmail(email) {
  email = (email || "").trim().toLowerCase();
  if (!email) return { valid: false, message: "Email wajib diisi." };

  const formatRegex =
    /^[a-z0-9]([a-z0-9._%+-]*[a-z0-9])?@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!formatRegex.test(email)) {
    return {
      valid: false,
      message: "Format email tidak valid. Contoh benar: nama@gmail.com",
    };
  }

  const domain = email.split("@")[1];
  if (DOMAIN_TYPOS[domain]) {
    return {
      valid: false,
      message: `Domain "${domain}" tidak valid. Maksud kamu "@${DOMAIN_TYPOS[domain]}"?`,
    };
  }
  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return {
      valid: false,
      message: `Domain "@${domain}" tidak didukung. Gunakan email seperti @gmail.com, @yahoo.com, atau @outlook.com.`,
    };
  }

  if (domain === "gmail.com" || domain === "googlemail.com") {
    const local = email.split("@")[0];
    if (local.length < 6)
      return {
        valid: false,
        message: "Alamat Gmail minimal 6 karakter sebelum tanda @.",
      };
    if (!/^[a-z0-9.]+$/.test(local))
      return {
        valid: false,
        message: "Alamat Gmail hanya boleh berisi huruf, angka, dan titik.",
      };
    if (local.startsWith(".") || local.endsWith(".") || local.includes(".."))
      return {
        valid: false,
        message:
          "Alamat Gmail tidak boleh diawali/diakhiri titik atau punya titik ganda.",
      };
  }
  return { valid: true, email };
}

/* ---------- VALIDASI PASSWORD ---------- */
const COMMON_PASSWORDS = [
  "password",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "abc12345",
  "admin123",
  "tripmate",
  "indonesia",
  "iloveyou",
];

function validatePassword(p) {
  const fail = (message) => ({ valid: false, message });
  if (!p) return fail("Password wajib diisi.");
  if (p.length < 8) return fail("Password minimal 8 karakter.");
  if (p.length > 64) return fail("Password maksimal 64 karakter.");
  if (!/[A-Z]/.test(p))
    return fail("Password harus mengandung minimal 1 huruf besar.");
  if (!/[a-z]/.test(p))
    return fail("Password harus mengandung minimal 1 huruf kecil.");
  if (!/[0-9]/.test(p))
    return fail("Password harus mengandung minimal 1 angka.");
  if (/\s/.test(p)) return fail("Password tidak boleh mengandung spasi.");
  if (COMMON_PASSWORDS.includes(p.toLowerCase()))
    return fail("Password terlalu umum dan mudah ditebak. Gunakan yang lain.");
  return { valid: true };
}

function passwordStrength(p) {
  let score = 0;
  if (p.length >= 8) score += 25;
  if (p.length >= 12) score += 15;
  if (/[A-Z]/.test(p)) score += 15;
  if (/[a-z]/.test(p)) score += 15;
  if (/[0-9]/.test(p)) score += 15;
  if (/[^A-Za-z0-9]/.test(p)) score += 15;
  return Math.min(100, score);
}

/* ---------- HASHING PASSWORD ---------- */
async function hashPassword(password) {
  const salted = "tripmate$" + password;
  if (window.crypto && window.crypto.subtle) {
    try {
      const digest = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(salted),
      );
      return (
        "sha256:" +
        Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      );
    } catch (e) {
      /* lanjut ke cadangan */
    }
  }
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  for (let i = 0; i < salted.length; i++) {
    h1 = ((h1 ^ salted.charCodeAt(i)) * 16777619) >>> 0;
    h2 = ((h2 + salted.charCodeAt(i) * (i + 7)) * 2654435761) >>> 0;
  }
  return "fb:" + h1.toString(16) + h2.toString(16);
}

/* ---------- PENYIMPANAN AKUN ---------- */
function getAccounts() {
  return lsGet(LS_KEYS.ACCOUNTS, []);
}
function saveAccounts(accounts) {
  lsSet(LS_KEYS.ACCOUNTS, accounts);
}
function findAccount(email) {
  const target = (email || "").trim().toLowerCase();
  return getAccounts().find((a) => a.email.toLowerCase() === target) || null;
}

/* ---------- HELPER TAMPILAN ERROR ---------- */
function showFieldError(errorId, inputId, message) {
  const err = document.getElementById(errorId);
  const input = document.getElementById(inputId);
  if (err) {
    err.textContent = message;
    err.classList.remove("hidden");
  }
  if (input) input.classList.add("invalid");
}
function clearFieldError(errorId, inputId) {
  const err = document.getElementById(errorId);
  const input = document.getElementById(inputId);
  if (err) err.classList.add("hidden");
  if (input) input.classList.remove("invalid");
}
function clearAllAuthErrors() {
  [
    "errLoginEmail:loginEmail",
    "errLoginPassword:loginPassword",
    "errRegName:regName",
    "errRegEmail:regEmail",
    "errRegPassword:regPassword",
    "errRegPassword2:regPassword2",
    "errRegPhone:regPhone",
    "errRegAddress:regAddress",
  ].forEach((pair) => {
    const [errId, inputId] = pair.split(":");
    clearFieldError(errId, inputId);
  });
}

/* ---------- MASUK KE APLIKASI SETELAH AUTENTIKASI ---------- */
function completeLogin(userProfile, welcomeMessage) {
  lsSet(LS_KEYS.USER, userProfile);
  lsSet(LS_KEYS.SESSION, userProfile.email);

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
  showToast(welcomeMessage, "success", "🎉");
  startApp();
}

/* =============================================================
   GOOGLE SIGN-IN
   ============================================================= */
function parseGoogleToken(credential) {
  try {
    const payload = credential
      .split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(payload)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function handleGoogleCredential(response) {
  const data = parseGoogleToken(response.credential);
  if (!data || !data.email) {
    showToast("Gagal membaca data akun Google.", "error");
    return;
  }
  if (data.email_verified === false) {
    showToast("Akun Google ini belum terverifikasi oleh Google.", "error");
    return;
  }

  const accounts = getAccounts();
  let account = accounts.find(
    (a) => a.email.toLowerCase() === data.email.toLowerCase(),
  );
  if (!account) {
    account = {
      name: data.name || data.email.split("@")[0],
      email: data.email,
      phone: "",
      address: "",
      provider: "google",
      passwordHash: null,
      createdAt: Date.now(),
    };
    accounts.push(account);
    saveAccounts(accounts);
  }

  completeLogin(
    {
      name: account.name,
      email: account.email,
      phone: account.phone,
      address: account.address,
      provider: "google",
    },
    `Login Google berhasil. Selamat datang, ${account.name.split(" ")[0]}!`,
  );
}

function initGoogleSignIn() {
  const container = document.getElementById("googleBtnContainer");
  const hint = document.getElementById("googleHint");
  if (!container) return;
  const warn = (html) => {
    hint.className = "google-hint warn";
    hint.innerHTML = html;
  };

  if (!GOOGLE_CLIENT_ID)
    return warn(
      "⚙️ <b>Login Google belum aktif.</b> Isi <code>GOOGLE_CLIENT_ID</code> di script.js dengan OAuth Client ID dari Google Cloud Console untuk mengaktifkannya. Sementara itu, gunakan akun TripMate di bawah.",
    );
  if (!(location.protocol === "http:" || location.protocol === "https:"))
    return warn(
      "⚙️ <b>Login Google butuh server.</b> Buka halaman ini lewat http:// (misalnya Live Server VS Code), bukan file://. Sementara itu, gunakan akun TripMate di bawah.",
    );
  if (!window.google || !window.google.accounts)
    return warn(
      "⚙️ Library Google gagal dimuat. Periksa koneksi internet kamu.",
    );

  try {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    });
    window.google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      width: 320,
      text: "signin_with",
      shape: "pill",
      locale: "id",
    });
  } catch (e) {
    warn(
      "⚙️ Gagal menampilkan tombol Google. Periksa Client ID dan Authorized JavaScript origins.",
    );
  }
}

/* =============================================================
   HALAMAN LOGIN / REGISTER (akun TripMate)
   ============================================================= */
function initAuthPage() {
  clearAllAuthErrors();

  // Library Google dimuat async, jadi dicoba beberapa kali
  let googleTries = 0;
  const googleTimer = setInterval(() => {
    googleTries++;
    if (
      (window.google && window.google.accounts) ||
      googleTries > 10 ||
      !GOOGLE_CLIENT_ID
    ) {
      clearInterval(googleTimer);
      initGoogleSignIn();
    }
  }, 300);

  // --- Tab Masuk / Daftar ---
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.onclick = () => {
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
      clearAllAuthErrors();
    };
  });
  document.querySelectorAll("[data-goto]").forEach((link) => {
    link.onclick = () =>
      document
        .querySelector(`.auth-tab[data-tab="${link.dataset.goto}"]`)
        .click();
  });

  // --- Lihat/sembunyikan password ---
  document.querySelectorAll(".toggle-pass").forEach((btn) => {
    btn.onclick = () => {
      const input = document.getElementById(btn.dataset.target);
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "👁️" : "🙈";
    };
  });

  // --- Indikator kekuatan password ---
  const regPassword = document.getElementById("regPassword");
  regPassword.oninput = () => {
    const score = passwordStrength(regPassword.value);
    const fill = document.getElementById("passStrengthFill");
    fill.style.width = score + "%";
    fill.style.background =
      score < 50 ? "#ef4444" : score < 75 ? "#f59e0b" : "#22c55e";
    clearFieldError("errRegPassword", "regPassword");
  };

  // Hapus tanda error saat isian diperbaiki
  [
    ["loginEmail", "errLoginEmail"],
    ["loginPassword", "errLoginPassword"],
    ["regName", "errRegName"],
    ["regEmail", "errRegEmail"],
    ["regPassword2", "errRegPassword2"],
    ["regPhone", "errRegPhone"],
    ["regAddress", "errRegAddress"],
  ].forEach(([inputId, errId]) => {
    const el = document.getElementById(inputId);
    if (el) el.addEventListener("input", () => clearFieldError(errId, inputId));
  });

  /* ---------- PROSES LOGIN ---------- */
  document.getElementById("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    clearAllAuthErrors();
    const emailInput = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    const emailCheck = validateEmail(emailInput);
    if (!emailCheck.valid) {
      showFieldError("errLoginEmail", "loginEmail", emailCheck.message);
      showToast("Email tidak valid.", "error");
      return;
    }
    const account = findAccount(emailCheck.email);
    if (!account) {
      showFieldError(
        "errLoginEmail",
        "loginEmail",
        "Email ini belum terdaftar. Silakan daftar terlebih dahulu.",
      );
      showToast("Akun tidak ditemukan.", "error");
      return;
    }
    if (account.provider === "google") {
      showFieldError(
        "errLoginEmail",
        "loginEmail",
        'Akun ini terdaftar via Google. Gunakan tombol "Masuk dengan Google" di atas.',
      );
      showToast("Gunakan login Google untuk akun ini.", "error");
      return;
    }
    if ((await hashPassword(password)) !== account.passwordHash) {
      showFieldError(
        "errLoginPassword",
        "loginPassword",
        "Password salah. Periksa kembali password kamu.",
      );
      showToast("Password salah.", "error", "🔒");
      return;
    }
    completeLogin(
      {
        name: account.name,
        email: account.email,
        phone: account.phone,
        address: account.address,
        provider: "local",
      },
      `Login berhasil. Selamat datang kembali, ${account.name.split(" ")[0]}!`,
    );
  };

  /* ---------- PROSES REGISTER ---------- */
  document.getElementById("registerForm").onsubmit = async (e) => {
    e.preventDefault();
    clearAllAuthErrors();
    const name = document.getElementById("regName").value.trim();
    const emailInput = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;
    const password2 = document.getElementById("regPassword2").value;
    const phone = document.getElementById("regPhone").value.trim();
    const address = document.getElementById("regAddress").value.trim();
    let hasError = false;
    const fail = (errId, inputId, msg) => {
      showFieldError(errId, inputId, msg);
      hasError = true;
    };

    if (name.length < 3)
      fail("errRegName", "regName", "Nama lengkap minimal 3 karakter.");

    const emailCheck = validateEmail(emailInput);
    if (!emailCheck.valid) fail("errRegEmail", "regEmail", emailCheck.message);
    else if (findAccount(emailCheck.email))
      fail(
        "errRegEmail",
        "regEmail",
        "Email ini sudah terdaftar. Silakan masuk.",
      );

    const passCheck = validatePassword(password);
    if (!passCheck.valid)
      fail("errRegPassword", "regPassword", passCheck.message);
    if (password !== password2)
      fail(
        "errRegPassword2",
        "regPassword2",
        "Konfirmasi password tidak cocok.",
      );

    // Nomor HP Indonesia: 08xxx / +628xxx / 628xxx
    const phoneClean = phone.replace(/[\s-]/g, "");
    if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(phoneClean))
      fail(
        "errRegPhone",
        "regPhone",
        "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.",
      );
    if (address.length < 10)
      fail(
        "errRegAddress",
        "regAddress",
        "Alamat terlalu singkat, minimal 10 karakter.",
      );

    if (hasError) {
      showToast(
        "Pendaftaran gagal. Periksa isian yang ditandai merah.",
        "error",
      );
      return;
    }

    const accounts = getAccounts();
    accounts.push({
      name,
      email: emailCheck.email,
      phone: phoneClean,
      address,
      provider: "local",
      passwordHash: await hashPassword(password),
      createdAt: Date.now(),
    });
    saveAccounts(accounts);
    e.target.reset();
    document.getElementById("passStrengthFill").style.width = "0%";

    completeLogin(
      {
        name,
        email: emailCheck.email,
        phone: phoneClean,
        address,
        provider: "local",
      },
      "Akun berhasil dibuat. Selamat datang di TripMate!",
    );
  };
}

function logout() {
  lsSet(LS_KEYS.SESSION, null);
  if (window.google && window.google.accounts && GOOGLE_CLIENT_ID) {
    try {
      window.google.accounts.id.disableAutoSelect();
    } catch (e) {}
  }
  showToast("Kamu telah logout. Sampai jumpa lagi!", "info", "🚪");
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("authPage").classList.remove("hidden");
  document.getElementById("loginForm").reset();
  document.getElementById("registerForm").reset();
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
  document.documentElement.setAttribute(
    "data-theme",
    lsGet(LS_KEYS.DARKMODE, false) ? "dark" : "light",
  );
}
function toggleDarkMode() {
  lsSet(LS_KEYS.DARKMODE, !lsGet(LS_KEYS.DARKMODE, false));
  applyDarkMode();
}

/* ============ NAV USER ============ */
function updateNavUser() {
  const user = lsGet(LS_KEYS.USER, { name: "Pengguna" });
  document.getElementById("navAvatar").textContent = user.name
    .charAt(0)
    .toUpperCase();
  document.getElementById("navUserName").textContent = user.name;
  document.getElementById("heroGreeting").textContent =
    `Halo, ${user.name.split(" ")[0]} 👋`;
}

/* ============ NAVIGASI ANTAR HALAMAN (tanpa reload) ============ */
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

  const badge = document.getElementById("profileProvider");
  if (badge) {
    const isGoogle = user.provider === "google";
    badge.textContent = isGoogle
      ? "🔐 Terhubung dengan Google"
      : "🔑 Akun TripMate";
    badge.className = "provider-badge " + (isGoogle ? "google" : "local");
  }
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

// Hapus otomatis trip yang selesai lebih dari 7 hari, beserta itinerary & budget terkait
function cleanupOldTrips() {
  const toRemove = [];
  const kept = getTrips().filter((trip) => {
    const diffDays = (new Date() - new Date(trip.end)) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      toRemove.push(trip.id);
      return false;
    }
    return true;
  });
  if (toRemove.length === 0) return;

  saveTrips(kept);
  lsSet(
    LS_KEYS.ITINERARY,
    lsGet(LS_KEYS.ITINERARY, []).filter((i) => !toRemove.includes(i.tripId)),
  );
  lsSet(
    LS_KEYS.BUDGET,
    lsGet(LS_KEYS.BUDGET, []).filter((b) => !toRemove.includes(b.tripId)),
  );
  showToast(`${toRemove.length} trip lama otomatis dibersihkan.`, "info", "🧹");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function createTripCard(trip) {
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
        !confirm(
          `Hapus trip "${trip.name}"? Itinerary & budget terkait juga akan terhapus.`,
        )
      )
        return;
      saveTrips(getTrips().filter((t) => t.id !== trip.id));
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
    });
  return div;
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
    ? `Aktif (±${Math.round(lastLocation.accuracy || 0)}m)`
    : "Nonaktif";

  // Perjalanan aktif
  const box = document.getElementById("activeTripBox");
  box.innerHTML = "";
  if (trips.length === 0) {
    box.innerHTML =
      '<p class="empty-text">Belum ada perjalanan aktif. Buat trip baru untuk memulai!</p>';
  } else {
    [...trips]
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 3)
      .forEach((trip) => box.appendChild(createTripCard(trip)));
  }

  // Lokasi pengguna
  const locBox = document.getElementById("userLocationBox");
  if (lastLocation) {
    locBox.innerHTML = buildLocationStatusHTML(
      lastLocation,
      "btnDetectLocationDash2",
      "🔄 Perbarui Lokasi",
    );
    wireLocationStatusButtons(locBox, lastLocation, "btnDetectLocationDash2");
  } else {
    locBox.innerHTML = `
      <p class="empty-text">Lokasi belum dideteksi.</p>
      <button class="btn btn-secondary btn-sm btn-detect-location" id="btnDetectLocationDash">📍 Deteksi Lokasi Saya</button>`;
    document
      .getElementById("btnDetectLocationDash")
      .addEventListener("click", detectLocation);
  }

  // Ringkasan budget
  const budgetBox = document.getElementById("budgetSummaryBox");
  const totalPlan = trips.reduce((sum, t) => sum + Number(t.budget), 0);
  if (totalPlan === 0 && budgetEntries.length === 0) {
    budgetBox.innerHTML = '<p class="empty-text">Belum ada data budget.</p>';
  } else {
    budgetBox.innerHTML = `
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">Total Budget: <b>${formatRupiah(totalPlan)}</b></p>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">Pengeluaran: <b style="color:#dc2626">${formatRupiah(totalExpense)}</b></p>
      <p style="font-size:13px;color:var(--text-muted);">Sisa: <b style="color:var(--accent-green-dark)">${formatRupiah(totalPlan - totalExpense)}</b></p>
    `;
  }

  // Ringkasan packing
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
  [
    document.getElementById("itineraryTripSelect"),
    document.getElementById("chooseTripSelect"),
  ].forEach((select) => {
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
  const tripId = document.getElementById("itineraryTripSelect").value;
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
   TEMPAT SEKITAR — DATA KURASI PER KOTA
   Seluruh koordinat (lat/lon) bersifat PERKIRAAN. Karena itu tombol
   Google Maps untuk data kurasi mencari lewat nama + alamat, bukan koordinat.
   ============================================================= */
let currentPlaces = [];
let currentPlaceFilter = "all";
let currentCityFilter = "all";
let pendingPlaceForTrip = null;

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

// P(nama, kategori, alamat, lat, lon, deskripsi?) -> objek tempat
const P = (name, category, address, lat, lon, description) => ({
  name,
  category,
  address,
  lat,
  lon,
  ...(description ? { description } : {}),
});

const CURATED_CITIES = {
  "Kota Probolinggo": {
    center: { lat: -7.7546, lon: 113.2159 },
    places: [
      P(
        "BEE JAY BAKAU RESORT (BJBR)",
        "wisata",
        "Kawasan Pelabuhan PPP, Mayangan",
        -7.728,
        113.234,
        "Wisata mangrove/bakau di kawasan pelabuhan.",
      ),
      P(
        "Taman Wisata Study Lingkungan",
        "wisata",
        "Mayangan, Kota Probolinggo",
        -7.73,
        113.23,
        "Wisata edukasi lingkungan.",
      ),
      P(
        "Gembok Cinta BJBR",
        "wisata",
        "Kawasan BJBR, Mayangan",
        -7.7282,
        113.2342,
        "Spot foto populer di kawasan BJBR.",
      ),
      P(
        "Bundaran GLASER (Gladak Serang)",
        "wisata",
        "Pusat Kota Probolinggo",
        -7.75,
        113.213,
        "Area publik dan tempat bersantai.",
      ),
      P(
        "Alun-Alun Probolinggo",
        "wisata",
        "Jl. Suroyo, Pusat Kota Probolinggo",
        -7.7546,
        113.2159,
        "Ruang publik di pusat kota.",
      ),
      P(
        "Taman Maramis",
        "wisata",
        "Pusat Kota Probolinggo",
        -7.753,
        113.2145,
        "Taman kota untuk berbagai kegiatan dan event.",
      ),
      P(
        "Museum Probolinggo",
        "budaya",
        "Pusat Kota Probolinggo",
        -7.755,
        113.217,
        "Wisata sejarah dan budaya.",
      ),
      P(
        "Museum Dr. Moh. Saleh",
        "budaya",
        "Jl. Dr. Moch Saleh, Kota Probolinggo",
        -7.7555,
        113.2175,
        "Museum wisata sejarah.",
      ),
      P(
        "Klenteng Tri Dharma",
        "budaya",
        "Kawasan Pecinan, Kota Probolinggo",
        -7.74,
        113.22,
        "Wisata religi dan budaya Tionghoa.",
      ),
      P(
        "Gereja Merah",
        "budaya",
        "Kawasan Pusat Kota Probolinggo",
        -7.738,
        113.223,
        "Bangunan gereja bersejarah.",
      ),
      P(
        "BARREL Coffee Garage",
        "cafe",
        "Jl. Mt. Haryono, Kota Probolinggo",
        -7.757,
        113.219,
      ),
      P(
        "Daily Dose Coffee",
        "cafe",
        "Jl. D.I. Panjaitan, Kota Probolinggo",
        -7.76,
        113.214,
      ),
      P(
        "Simposium Coffee (Headquarter)",
        "cafe",
        "Jl. Dr. Moch Saleh, Kota Probolinggo",
        -7.7555,
        113.2178,
      ),
      P(
        "ALIBI CAFE",
        "cafe",
        "Jl. R.A. Kartini, Kota Probolinggo",
        -7.753,
        113.21,
      ),
      P(
        "Mak Jleb Coffee & Kedai",
        "cafe",
        "Kanigaran, Kota Probolinggo",
        -7.748,
        113.223,
      ),
      P(
        "Putri Lingga Coffee & Micro Roastery",
        "cafe",
        "Kademangan, Kota Probolinggo",
        -7.765,
        113.205,
      ),
      P(
        "Altruist Coffee",
        "cafe",
        "Kawasan Mastrip, Kota Probolinggo",
        -7.762,
        113.226,
      ),
      P("RUMAH NENEK Coffee Shop", "cafe", "Kota Probolinggo", -7.756, 113.22),
      P("Kedai27 Probolinggo", "cafe", "Kota Probolinggo", -7.754, 113.218),
      P("Bakso Probolinggo", "kuliner", "Kota Probolinggo", -7.755, 113.216),
      P(
        "Kupang Lontong Pahlawan",
        "kuliner",
        "Jl. Pahlawan, Kota Probolinggo",
        -7.75,
        113.219,
      ),
      P("Rawon Gunawan", "kuliner", "Kota Probolinggo", -7.756, 113.215),
      P(
        "Ikan Bakar Gatsu",
        "kuliner",
        "Jl. Gatot Subroto, Kota Probolinggo",
        -7.748,
        113.228,
      ),
      P("Nasi Pecel Pocong", "kuliner", "Kota Probolinggo", -7.757, 113.213),
      P("Soto Ayam Pak Madjar", "kuliner", "Kota Probolinggo", -7.754, 113.22),
      P("Bebek Goreng Bu Lely", "kuliner", "Kota Probolinggo", -7.759, 113.217),
      P("Tahu Kikil Brak", "kuliner", "Kota Probolinggo", -7.752, 113.214),
      P("Mie Jawa Guntur", "kuliner", "Kota Probolinggo", -7.7555, 113.219),
      P(
        "Rumah Makan Sari Laut SJDW",
        "kuliner",
        "Kawasan Pesisir, Kota Probolinggo",
        -7.746,
        113.226,
      ),
      P("Bromo Park Hotel", "hotel", "Kota Probolinggo", -7.754, 113.2175),
      P("Bromo View Hotel", "hotel", "Kota Probolinggo", -7.756, 113.2185),
      P(
        "Paseban Sena (Ballroom, Hotel & Restaurant)",
        "hotel",
        "Kota Probolinggo",
        -7.75,
        113.21,
      ),
      P("Caldera Park Homestay", "hotel", "Kota Probolinggo", -7.76, 113.22),
      P(
        "RedDoorz @ Hotel Tampiarto",
        "hotel",
        "Kota Probolinggo, Jawa Timur",
        -7.757,
        113.216,
      ),
      P(
        "Stasiun Probolinggo",
        "penting",
        "Kota Probolinggo",
        -7.7561,
        113.2166,
        "Stasiun kereta api.",
      ),
      P(
        "Terminal Bayuangga",
        "penting",
        "Kota Probolinggo",
        -7.7386,
        113.1935,
        "Terminal bus utama.",
      ),
      P(
        "Pelabuhan Tanjung Tembaga",
        "penting",
        "Mayangan, Kota Probolinggo",
        -7.728,
        113.238,
        "Pelabuhan utama Kota Probolinggo.",
      ),
      P(
        "Pelabuhan Perikanan Pantai Mayangan",
        "penting",
        "Mayangan, Kota Probolinggo",
        -7.729,
        113.232,
        "Pelabuhan perikanan.",
      ),
      P(
        "GOR Ahmad Yani",
        "penting",
        "Kota Probolinggo",
        -7.762,
        113.214,
        "Gedung olahraga.",
      ),
    ],
  },
  Surabaya: {
    center: { lat: -7.2575, lon: 112.7521 },
    places: [
      P(
        "Tugu Pahlawan",
        "budaya",
        "Jl. Pahlawan, Surabaya",
        -7.245808,
        112.737785,
        "Monumen ikon Kota Surabaya beserta Museum 10 Nopember.",
      ),
      P(
        "House of Sampoerna",
        "budaya",
        "Surabaya",
        -7.2323,
        112.7376,
        "Museum sejarah kretek Sampoerna di kawasan kota tua.",
      ),
      P(
        "Jembatan Merah",
        "budaya",
        "Surabaya",
        -7.2385,
        112.7368,
        "Kawasan bersejarah peninggalan kolonial.",
      ),
      P(
        "Museum Kapal Selam (Monkasel)",
        "wisata",
        "Surabaya",
        -7.2661,
        112.7439,
        "Museum kapal selam asli KRI Pasopati.",
      ),
      P(
        "Taman Bungkul",
        "taman",
        "Surabaya",
        -7.2925,
        112.7387,
        "Taman kota populer untuk bersantai dan olahraga.",
      ),
      P("Kebun Binatang Surabaya", "wisata", "Surabaya", -7.2917, 112.7379),
      P(
        "Jembatan Suramadu",
        "wisata",
        "Surabaya",
        -7.1725,
        112.7614,
        "Jembatan penghubung Surabaya–Madura.",
      ),
      P(
        "Masjid Al Akbar Surabaya",
        "budaya",
        "Surabaya",
        -7.3327,
        112.7166,
        "Masjid terbesar kedua di Indonesia.",
      ),
      P(
        "Klenteng Sanggar Agung",
        "budaya",
        "Kenjeran, Surabaya",
        -7.2265,
        112.7972,
        "Klenteng dengan patung Dewi Kwan Im menghadap laut.",
      ),
      P(
        "Tunjungan Plaza",
        "mall",
        "Jl. Basuki Rahmat, Surabaya",
        -7.2624,
        112.7396,
      ),
      P("Pakuwon Mall", "mall", "Surabaya Barat", -7.2793, 112.6725),
      P(
        "Sate Klopo Ondomohen",
        "kuliner",
        "Surabaya",
        -7.2665,
        112.7413,
        "Sate klopo (kelapa) khas Surabaya.",
      ),
      P(
        "Rawon Setan",
        "kuliner",
        "Jl. Embong Malang, Surabaya",
        -7.2635,
        112.7376,
      ),
      P(
        "Rujak Cingur Ahmad Jais",
        "kuliner",
        "Surabaya",
        -7.254,
        112.744,
        "Rujak cingur legendaris khas Surabaya.",
      ),
      P("Lontong Balap Pak Gendut", "kuliner", "Surabaya", -7.258, 112.742),
      P(
        "Zangrandi Ice Cream",
        "cafe",
        "Jl. Yos Sudarso, Surabaya",
        -7.2603,
        112.743,
        "Kedai es krim legendaris sejak era kolonial.",
      ),
      P(
        "Hotel Majapahit",
        "hotel",
        "Jl. Tunjungan, Surabaya",
        -7.2637,
        112.7396,
        "Hotel bersejarah peninggalan kolonial.",
      ),
      P("Bumi Surabaya City Resort", "hotel", "Surabaya", -7.266, 112.7392),
      P(
        "Stasiun Surabaya Gubeng",
        "penting",
        "Surabaya",
        -7.2646,
        112.7523,
        "Stasiun kereta api utama.",
      ),
      P(
        "Terminal Purabaya (Bungurasih)",
        "penting",
        "Surabaya",
        -7.3444,
        112.7186,
        "Terminal bus antar kota terbesar.",
      ),
      P(
        "Pelabuhan Tanjung Perak",
        "penting",
        "Surabaya",
        -7.1953,
        112.7328,
        "Pelabuhan utama Surabaya.",
      ),
    ],
  },
  Malang: {
    center: { lat: -7.9797, lon: 112.6304 },
    places: [
      P("Alun-Alun Kota Malang", "wisata", "Malang", -7.9797, 112.6304),
      P("Jatim Park 1", "wisata", "Batu, Malang", -7.8817, 112.5194),
      P(
        "Jatim Park 2",
        "wisata",
        "Batu, Malang",
        -7.8776,
        112.523,
        "Berisi Museum Satwa dan Batu Secret Zoo.",
      ),
      P("Museum Angkut", "wisata", "Batu, Malang", -7.8802, 112.5133),
      P(
        "Batu Night Spectacular (BNS)",
        "wisata",
        "Batu, Malang",
        -7.8721,
        112.5211,
        "Taman hiburan malam di Batu.",
      ),
      P(
        "Coban Rondo",
        "wisata",
        "Pujon, Malang",
        -7.8783,
        112.4636,
        "Air terjun populer di kawasan Pujon.",
      ),
      P(
        "Kampung Warna Warni Jodipan",
        "wisata",
        "Malang",
        -7.9847,
        112.6255,
        "Kampung tematik penuh warna.",
      ),
      P(
        "Alun-Alun Tugu Malang",
        "wisata",
        "Malang",
        -7.9758,
        112.6317,
        "Taman kota di depan Balai Kota Malang.",
      ),
      P(
        "Toko Oen",
        "kuliner",
        "Jl. Basuki Rahmat, Malang",
        -7.9812,
        112.6289,
        "Restoran & es krim legendaris sejak 1930.",
      ),
      P("Bakso President", "kuliner", "Malang", -7.978, 112.6335),
      P("Pecel Kawi", "kuliner", "Jl. Kawi, Malang", -7.9856, 112.6255),
      P(
        "Rumah Makan Inggil",
        "kuliner",
        "Malang",
        -7.9825,
        112.627,
        "Restoran dengan nuansa museum & seni.",
      ),
      P("Coffee Toffee Malang", "cafe", "Malang", -7.974, 112.618),
      P("Malang Town Square (MATOS)", "mall", "Malang", -7.9575, 112.6172),
      P(
        "Hotel Tugu Malang",
        "hotel",
        "Jl. Tugu, Malang",
        -7.9765,
        112.632,
        "Hotel bertema seni dan antik.",
      ),
      P(
        "Stasiun Malang Kota Baru",
        "penting",
        "Malang",
        -7.977,
        112.6357,
        "Stasiun kereta api utama Malang.",
      ),
      P(
        "Terminal Arjosari",
        "penting",
        "Malang",
        -7.943,
        112.644,
        "Terminal bus utama Malang.",
      ),
    ],
  },
  Yogyakarta: {
    center: { lat: -7.7956, lon: 110.3695 },
    places: [
      P(
        "Malioboro",
        "wisata",
        "Yogyakarta",
        -7.793,
        110.3658,
        "Kawasan jalan wisata dan belanja legendaris.",
      ),
      P("Keraton Yogyakarta", "budaya", "Yogyakarta", -7.8053, 110.3642),
      P(
        "Candi Prambanan",
        "wisata",
        "Yogyakarta",
        -7.752,
        110.4915,
        "Kompleks candi Hindu terbesar di Indonesia.",
      ),
      P(
        "Candi Borobudur",
        "wisata",
        "Magelang (dekat Yogyakarta)",
        -7.6079,
        110.2038,
        "Candi Buddha terbesar di dunia.",
      ),
      P(
        "Taman Sari",
        "budaya",
        "Yogyakarta",
        -7.81,
        110.3594,
        "Bekas taman air Keraton Yogyakarta.",
      ),
      P("Tugu Yogyakarta", "wisata", "Yogyakarta", -7.7828, 110.3671),
      P(
        "Alun-Alun Kidul",
        "wisata",
        "Yogyakarta",
        -7.8117,
        110.3636,
        "Alun-alun selatan dengan tradisi masangin.",
      ),
      P(
        "Pantai Parangtritis",
        "wisata",
        "Bantul, Yogyakarta",
        -8.0253,
        110.3316,
      ),
      P(
        "Tebing Breksi",
        "wisata",
        "Sleman, Yogyakarta",
        -7.7712,
        110.5111,
        "Bekas tambang batu dengan pahatan relief.",
      ),
      P("Gembira Loka Zoo", "wisata", "Yogyakarta", -7.8109, 110.3934),
      P(
        "Gudeg Yu Djum",
        "kuliner",
        "Yogyakarta",
        -7.7825,
        110.3776,
        "Gudeg legendaris khas Yogyakarta.",
      ),
      P(
        "Angkringan Lik Man (Kopi Joss)",
        "kuliner",
        "Jl. Wongsodirjan, Yogyakarta",
        -7.7906,
        110.3672,
        "Angkringan legendaris dengan kopi arang.",
      ),
      P("Bakpia Pathok 25", "kuliner", "Yogyakarta", -7.7973, 110.3556),
      P(
        "Sate Klathak Pak Pong",
        "kuliner",
        "Bantul, Yogyakarta",
        -7.8636,
        110.3689,
      ),
      P("Malioboro Mall", "mall", "Yogyakarta", -7.7924, 110.3659),
      P("Hotel Tentrem Yogyakarta", "hotel", "Yogyakarta", -7.7784, 110.3706),
      P(
        "Hotel Phoenix Yogyakarta",
        "hotel",
        "Jl. Jenderal Sudirman, Yogyakarta",
        -7.7823,
        110.3695,
      ),
      P(
        "Stasiun Yogyakarta (Tugu)",
        "penting",
        "Yogyakarta",
        -7.7896,
        110.363,
        "Stasiun kereta api utama Yogyakarta.",
      ),
      P(
        "Terminal Giwangan",
        "penting",
        "Yogyakarta",
        -7.828,
        110.3805,
        "Terminal bus utama Yogyakarta.",
      ),
    ],
  },
  Bandung: {
    center: { lat: -6.9175, lon: 107.6191 },
    places: [
      P(
        "Gedung Sate",
        "budaya",
        "Bandung",
        -6.9022,
        107.6186,
        "Ikon bangunan bersejarah Kota Bandung.",
      ),
      P(
        "Jalan Braga",
        "wisata",
        "Bandung",
        -6.9184,
        107.6098,
        "Kawasan bersejarah dengan arsitektur kolonial.",
      ),
      P("Kawah Putih", "wisata", "Ciwidey, Bandung", -7.1663, 107.4022),
      P(
        "Tangkuban Perahu",
        "wisata",
        "Lembang, Bandung",
        -6.7597,
        107.6098,
        "Gunung berapi dengan kawah ikonik.",
      ),
      P(
        "Farmhouse Lembang",
        "wisata",
        "Lembang, Bandung",
        -6.8226,
        107.6035,
        "Wisata bertema pedesaan Eropa.",
      ),
      P(
        "Floating Market Lembang",
        "wisata",
        "Lembang, Bandung",
        -6.8221,
        107.6373,
        "Pasar terapung dengan wahana keluarga.",
      ),
      P("Trans Studio Bandung", "wisata", "Bandung", -6.9254, 107.6382),
      P(
        "Masjid Raya Bandung",
        "budaya",
        "Alun-Alun Bandung",
        -6.9218,
        107.607,
        "Masjid ikonik di pusat Alun-Alun Bandung.",
      ),
      P("Batagor Kingsley", "kuliner", "Bandung", -6.911, 107.6098),
      P("Mie Kocok Mang Dadeng", "kuliner", "Bandung", -6.9147, 107.6023),
      P("Sate Hadori", "kuliner", "Bandung", -6.9037, 107.6193),
      P("Kopi Selasar", "cafe", "Bandung", -6.889, 107.6135),
      P("Cihampelas Walk", "mall", "Bandung", -6.8919, 107.6058),
      P("Paris Van Java Mall", "mall", "Bandung", -6.8926, 107.5885),
      P(
        "Hotel Savoy Homann",
        "hotel",
        "Jl. Asia Afrika, Bandung",
        -6.9179,
        107.6088,
        "Hotel bersejarah bergaya Art Deco.",
      ),
      P(
        "Stasiun Bandung",
        "penting",
        "Bandung",
        -6.9139,
        107.6023,
        "Stasiun kereta api utama Bandung.",
      ),
      P(
        "Terminal Leuwipanjang",
        "penting",
        "Bandung",
        -6.943,
        107.5892,
        "Terminal bus antar kota.",
      ),
    ],
  },
  Jakarta: {
    center: { lat: -6.2088, lon: 106.8456 },
    places: [
      P(
        "Monumen Nasional (Monas)",
        "wisata",
        "Jakarta Pusat",
        -6.1754,
        106.8272,
        "Ikon utama Kota Jakarta.",
      ),
      P(
        "Kota Tua Jakarta",
        "budaya",
        "Jakarta Barat",
        -6.1352,
        106.8133,
        "Kawasan bersejarah peninggalan Batavia.",
      ),
      P("Ancol Dreamland", "wisata", "Jakarta Utara", -6.1256, 106.8317),
      P(
        "Taman Mini Indonesia Indah (TMII)",
        "wisata",
        "Jakarta Timur",
        -6.3024,
        106.8951,
        "Taman rekreasi budaya nusantara.",
      ),
      P("Ragunan Zoo", "wisata", "Jakarta Selatan", -6.3125, 106.8203),
      P(
        "Pelabuhan Sunda Kelapa",
        "penting",
        "Jakarta Utara",
        -6.1252,
        106.8106,
        "Pelabuhan bersejarah era Batavia.",
      ),
      P(
        "Bundaran HI",
        "wisata",
        "Jakarta Pusat",
        -6.1948,
        106.823,
        "Landmark ikonik Jalan Thamrin.",
      ),
      P(
        "Masjid Istiqlal",
        "budaya",
        "Jakarta Pusat",
        -6.1702,
        106.8307,
        "Masjid nasional terbesar di Asia Tenggara.",
      ),
      P(
        "Gereja Katedral Jakarta",
        "budaya",
        "Jakarta Pusat",
        -6.1699,
        106.8317,
        "Gereja katolik bersejarah, tepat di seberang Istiqlal.",
      ),
      P("Soto Betawi H. Ma'ruf", "kuliner", "Jakarta", -6.1832, 106.8188),
      P(
        "Nasi Uduk Kebon Kacang",
        "kuliner",
        "Jakarta Pusat",
        -6.1897,
        106.8172,
      ),
      P(
        "Kerak Telor Pak Edi",
        "kuliner",
        "Jakarta",
        -6.1256,
        106.8317,
        "Kuliner khas Betawi, sering dijumpai di kawasan Ancol/PRJ.",
      ),
      P(
        "Sarinah",
        "mall",
        "Jakarta Pusat",
        -6.1896,
        106.8226,
        "Pusat perbelanjaan pertama di Indonesia.",
      ),
      P("Grand Indonesia Mall", "mall", "Jakarta Pusat", -6.1954, 106.8206),
      P("Plaza Indonesia", "mall", "Jakarta Pusat", -6.1934, 106.8222),
      P(
        "Hotel Indonesia Kempinski",
        "hotel",
        "Jl. M.H. Thamrin, Jakarta",
        -6.1947,
        106.8225,
      ),
      P(
        "Stasiun Gambir",
        "penting",
        "Jakarta Pusat",
        -6.1766,
        106.8306,
        "Stasiun kereta api utama Jakarta.",
      ),
      P(
        "Terminal Kampung Rambutan",
        "penting",
        "Jakarta Timur",
        -6.3123,
        106.8631,
        "Terminal bus antar kota.",
      ),
      P(
        "Bandara Soekarno-Hatta",
        "penting",
        "Tangerang (melayani Jakarta)",
        -6.1256,
        106.6559,
        "Bandara internasional utama.",
      ),
    ],
  },
};

// Ratakan data kurasi seluruh kota menjadi satu array
const ALL_CURATED_PLACES = Object.entries(CURATED_CITIES).flatMap(
  ([cityName, cityData]) =>
    cityData.places.map((p) => ({
      id: "curated-" + uid(),
      source: "curated",
      city: cityName,
      ...p,
    })),
);

// Batas koordinat wilayah Indonesia (bounding box dengan sedikit toleransi)
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

/* ============ WAKTU RELATIF ============ */
function formatRelativeTime(timestamp) {
  const s = Math.floor((Date.now() - timestamp) / 1000);
  if (s < 10) return "baru saja";
  if (s < 60) return `${s} detik yang lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit yang lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam yang lalu`;
  return `${Math.floor(h / 24)} hari yang lalu`;
}

/* ============ KUALITAS AKURASI GPS ============ */
function getAccuracyInfo(accuracy) {
  if (accuracy == null)
    return { label: "Akurasi tidak diketahui", cls: "unknown" };
  if (accuracy <= 20)
    return { label: `Sangat akurat (±${Math.round(accuracy)} m)`, cls: "good" };
  if (accuracy <= 100)
    return {
      label: `Cukup akurat (±${Math.round(accuracy)} m)`,
      cls: "medium",
    };
  return { label: `Akurasi rendah (±${Math.round(accuracy)} m)`, cls: "poor" };
}

/* ============ REVERSE GEOCODING (Nominatim / OpenStreetMap) ============ */
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&accept-language=id`,
    );
    if (!res.ok) throw new Error("reverse geocode failed");
    const data = await res.json();
    const a = data.address || {};
    const parts = [
      a.suburb || a.village || a.town || a.city_district,
      a.city || a.town || a.regency || a.county,
      a.state,
    ].filter(Boolean);
    const unique = parts.filter((p, i) => p !== parts[i - 1]);
    return unique.length ? unique.join(", ") : data.display_name || null;
  } catch (e) {
    return null;
  }
}

/* ============ STATUS TOMBOL DETEKSI LOKASI ============ */
let isDetectingLocation = false;
function setLocationButtonsLoading(loading) {
  isDetectingLocation = loading;
  document.querySelectorAll(".btn-detect-location").forEach((btn) => {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
      btn.innerHTML = '<span class="btn-spinner"></span> Mendeteksi lokasi...';
    } else if (btn.dataset.originalText) {
      btn.innerHTML = btn.dataset.originalText;
    }
  });
}

async function copyCoordinates(lat, lon) {
  try {
    await navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    showToast("Koordinat disalin ke clipboard.", "success", "📋");
  } catch (e) {
    showToast("Gagal menyalin koordinat.", "error");
  }
}

function renderPlacesStatusOutsideIndonesia() {
  const box = document.getElementById("placesStatusBox");
  if (box)
    box.innerHTML =
      '<p class="empty-text">📍 Lokasimu terdeteksi di luar Indonesia. Fitur Tempat Sekitar hanya tersedia untuk wilayah Indonesia.</p>';
  const grid = document.getElementById("placesGrid");
  if (grid) grid.innerHTML = "";
}

function buildLocationStatusHTML(loc, detectBtnId, detectBtnLabel) {
  const accInfo = getAccuracyInfo(loc.accuracy);
  return `
    <div class="location-active">
      <div class="location-radar"><span class="radar-dot"></span></div>
      <span class="loc-badge">📡 ${loc.manual ? "Lokasi Manual" : "Lokasi Aktif"}</span>
      ${loc.address ? `<p class="location-address">${escapeHtml(loc.address)}</p>` : '<p class="location-address muted">Mencari nama tempat...</p>'}
      <p class="location-coords">Lat: ${loc.lat.toFixed(5)}, Lon: ${loc.lon.toFixed(5)}</p>
      <span class="accuracy-badge ${accInfo.cls}">${accInfo.label}</span>
      <p class="location-updated">🕒 Diperbarui ${formatRelativeTime(loc.timestamp)}</p>
      <div class="location-actions">
        <button class="btn btn-secondary btn-sm btn-detect-location" id="${detectBtnId}">${detectBtnLabel}</button>
        <button class="btn btn-secondary btn-sm" data-action="copy-coords">📋 Salin</button>
        <button class="btn btn-secondary btn-sm" data-action="open-maps">🗺️ Google Maps</button>
      </div>
    </div>
  `;
}

function wireLocationStatusButtons(container, loc, detectBtnId) {
  const detectBtn = container.querySelector("#" + detectBtnId);
  if (detectBtn) detectBtn.addEventListener("click", detectLocation);
  const copyBtn = container.querySelector('[data-action="copy-coords"]');
  if (copyBtn)
    copyBtn.addEventListener("click", () => copyCoordinates(loc.lat, loc.lon));
  const mapsBtn = container.querySelector('[data-action="open-maps"]');
  if (mapsBtn)
    mapsBtn.addEventListener("click", () =>
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lon}`,
        "_blank",
        "noopener,noreferrer",
      ),
    );
}

function renderPlacesStatus() {
  const box = document.getElementById("placesStatusBox");
  const loc = lsGet(LS_KEYS.LAST_LOCATION, null);
  if (!loc) {
    box.innerHTML =
      '<p class="empty-text">Aktifkan lokasi untuk menemukan tempat menarik di sekitarmu.</p>';
    return;
  }
  box.innerHTML = buildLocationStatusHTML(
    loc,
    "btnRefreshLocationPlaces",
    "🔄 Perbarui Lokasi",
  );
  wireLocationStatusButtons(box, loc, "btnRefreshLocationPlaces");
}

// Tampilkan data kurasi seluruh kota sebagai rekomendasi awal (tanpa deteksi lokasi)
function renderCuratedPlacesDefault() {
  currentPlaces = ALL_CURATED_PLACES.map((p) => ({ ...p, distance: null }));
  renderPlacesGrid();
}

/* ---------- Ambil pembacaan GPS terbaik (akurasi terkecil) ---------- */
function getBestPosition(
  onSuccess,
  onError,
  { maxWaitMs = 12000, goodEnoughM = 30 } = {},
) {
  let best = null,
    done = false,
    watchId = null,
    timer = null;

  const finish = () => {
    if (done) return;
    done = true;
    navigator.geolocation.clearWatch(watchId);
    clearTimeout(timer);
    onSuccess(best);
  };

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
      if (pos.coords.accuracy <= goodEnoughM) finish();
    },
    (err) => {
      if (done) return;
      if (best) return finish();
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      onError(err);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
  timer = setTimeout(() => {
    if (best) finish();
  }, maxWaitMs);
}

/* ---------- Deteksi lokasi pengguna ---------- */
function detectLocation() {
  if (isDetectingLocation) return;

  if (!navigator.geolocation) {
    showToast("Browser kamu tidak mendukung fitur lokasi.", "error");
    return;
  }

  setLocationButtonsLoading(true);
  showToast("Mengambil lokasi paling akurat (maks. 12 detik)...", "info", "📡");

  getBestPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      if (!isInsideIndonesia(lat, lon)) {
        setLocationButtonsLoading(false);
        showToast(
          "Fitur deteksi lokasi hanya tersedia untuk pengguna di Indonesia.",
          "error",
          "🇮🇩",
        );
        renderPlacesStatusOutsideIndonesia();
        return;
      }

      lsSet(LS_KEYS.LAST_LOCATION, {
        lat,
        lon,
        accuracy,
        address: null,
        timestamp: Date.now(),
      });
      renderDashboard();
      renderPlacesStatus();
      fetchNearbyPlaces(lat, lon);

      if (accuracy > 1000) {
        showToast(
          `Akurasi lokasi rendah (±${Math.round(accuracy)} m). Kemungkinan lokasi dari jaringan/IP, coba di HP dengan GPS aktif.`,
          "error",
          "⚠️",
        );
      } else {
        showToast(
          `Lokasi berhasil ditemukan! ${getAccuracyInfo(accuracy).label}`,
          "success",
          "📍",
        );
      }
      setLocationButtonsLoading(false);

      const address = await reverseGeocode(lat, lon);
      if (address) {
        const current = lsGet(LS_KEYS.LAST_LOCATION, null);
        if (current) {
          lsSet(LS_KEYS.LAST_LOCATION, { ...current, address });
          renderDashboard();
          renderPlacesStatus();
        }
      }
    },
    (error) => {
      setLocationButtonsLoading(false);
      const pesan = {
        1: [
          "Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser.",
          "🚫",
        ],
        2: [
          "Lokasi tidak dapat ditentukan. Pastikan GPS/lokasi perangkat aktif.",
          "📵",
        ],
        3: [
          "Waktu deteksi lokasi habis. Periksa sinyal GPS dan coba lagi.",
          "⏱️",
        ],
      }[error.code] || ["Gagal mendapatkan lokasi. Silakan coba lagi.", "🚫"];
      showToast(pesan[0], "error", pesan[1]);
    },
  );
}

/* ---------- Tempat sekitar: kurasi + OpenStreetMap ---------- */
async function fetchNearbyPlaces(lat, lon) {
  const grid = document.getElementById("placesGrid");
  grid.innerHTML =
    '<p class="empty-text">🔎 Mencari tempat menarik di sekitarmu...</p>';

  const curatedWithDistance = ALL_CURATED_PLACES.map((p) => ({
    ...p,
    distance: haversineDistance(lat, lon, p.lat, p.lon),
  }));

  const radius = 2000;
  // nwr = node + way + relation, supaya taman/mall/hotel berbentuk area ikut terambil
  const query = `
    [out:json][timeout:25];
    (
      nwr["tourism"="attraction"](around:${radius},${lat},${lon});
      nwr["amenity"="restaurant"](around:${radius},${lat},${lon});
      nwr["amenity"="cafe"](around:${radius},${lat},${lon});
      nwr["tourism"="hotel"](around:${radius},${lat},${lon});
      nwr["leisure"="park"](around:${radius},${lat},${lon});
      nwr["shop"="mall"](around:${radius},${lat},${lon});
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

        const plat = el.lat ?? el.center?.lat;
        const plon = el.lon ?? el.center?.lon;
        return {
          id: "osm-" + el.type + "-" + el.id,
          source: "api",
          name: el.tags.name,
          category,
          lat: plat,
          lon: plon,
          distance:
            plat != null && plon != null
              ? haversineDistance(lat, lon, plat, plon)
              : null,
        };
      })
      .filter((p) => p.lat != null && p.lon != null);
  } catch (err) {
    showToast(
      "Gagal mengambil data tempat sekitar dari OpenStreetMap.",
      "error",
    );
  }

  currentPlaces = [...curatedWithDistance, ...apiPlaces]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 40);

  renderPlacesGrid();
}

/* ---------- Kartu tempat + tombol Google Maps ---------- */
function renderPlacesGrid() {
  const grid = document.getElementById("placesGrid");
  grid.innerHTML = "";

  let filtered = currentPlaces;
  if (currentPlaceFilter !== "all") {
    filtered = filtered.filter(
      (p) => CATEGORY_INFO[p.category].filter === currentPlaceFilter,
    );
  }
  if (currentCityFilter !== "all") {
    filtered = filtered.filter(
      (p) => p.source !== "curated" || p.city === currentCityFilter,
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML =
      '<p class="empty-text">Tidak ada tempat ditemukan untuk kategori/kota ini.</p>';
    return;
  }

  filtered.forEach((place) => {
    const info = CATEGORY_INFO[place.category];
    const isCurated = place.source === "curated";
    const hasDistance = place.distance !== null && place.distance !== undefined;
    const distanceOrAddress = hasDistance
      ? `📏 ${isCurated ? "≈ " : ""}${formatDistance(place.distance)} dari lokasimu${isCurated ? " (perkiraan)" : ""}`
      : `📍 ${escapeHtml(place.address || place.city || "-")}`;

    const card = document.createElement("div");
    card.className = "place-card fade-in";
    card.innerHTML = `
      <div class="place-card-icon">${info.icon}</div>
      <p class="place-card-name">${escapeHtml(place.name)}</p>
      <p class="place-card-type">${info.label}${isCurated ? " · " + escapeHtml(place.city) : ""}</p>
      <p class="place-card-dist">${distanceOrAddress}</p>
      <div class="place-card-actions">
        <button class="btn btn-secondary btn-sm" data-action="view-map">🗺️ Lihat di Google Maps</button>
        <button class="btn btn-primary btn-sm" data-action="add-trip">+ Trip</button>
      </div>
    `;

    // Data kurasi: koordinat hanya perkiraan -> cari lewat nama + alamat + kota.
    // Data OpenStreetMap: koordinat asli -> pakai lat,lon.
    card
      .querySelector('[data-action="view-map"]')
      .addEventListener("click", () => {
        const mapsQuery = isCurated
          ? [
              ...new Set(
                [place.name, place.address, place.city].filter(Boolean),
              ),
            ].join(", ")
          : `${place.lat},${place.lon}`;
        window.open(
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
          "_blank",
          "noopener,noreferrer",
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
  const pct =
    totalPlan > 0
      ? Math.min(100, Math.round((totalSpent / totalPlan) * 100))
      : 0;

  document.getElementById("budgetTotalPlan").textContent =
    formatRupiah(totalPlan);
  document.getElementById("budgetTotalSpent").textContent =
    formatRupiah(totalSpent);
  document.getElementById("budgetRemaining").textContent = formatRupiah(
    totalPlan - totalSpent,
  );
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
      lsSet(
        LS_KEYS.PACKING,
        lsGet(LS_KEYS.PACKING, []).map((p) =>
          p.id === item.id ? { ...p, checked: !p.checked } : p,
        ),
      );
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
   CATATAN
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
    )
      results.push({
        type: "Trip",
        title: `${trip.name} — ${trip.destination}`,
        page: "itinerary",
        tripId: trip.id,
      });
  });
  getItinerary().forEach((item) => {
    if (
      item.activity.toLowerCase().includes(query) ||
      (item.location || "").toLowerCase().includes(query)
    )
      results.push({
        type: "Itinerary",
        title: item.activity,
        page: "itinerary",
        tripId: item.tripId,
      });
  });
  lsGet(LS_KEYS.NOTES, []).forEach((note) => {
    if (
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    )
      results.push({ type: "Catatan", title: note.title, page: "notes" });
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
const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  applyDarkMode();

  // Sesi login berisi email pengguna yang sedang masuk
  const user = lsGet(LS_KEYS.USER, null);
  const session = lsGet(LS_KEYS.SESSION, null);
  if (user && session && typeof session === "string" && findAccount(session)) {
    startApp();
  } else {
    lsSet(LS_KEYS.SESSION, null);
    initAuthPage();
  }

  /* ---------- SIDEBAR & NAVIGASI ---------- */
  document
    .querySelectorAll(".nav-item[data-page]")
    .forEach((btn) =>
      btn.addEventListener("click", () => goToPage(btn.dataset.page)),
    );
  $("hamburgerBtn").addEventListener("click", () => {
    $("sidebar").classList.add("open");
    $("sidebarOverlay").classList.add("show");
  });
  $("sidebarOverlay").addEventListener("click", () => {
    $("sidebar").classList.remove("open");
    $("sidebarOverlay").classList.remove("show");
  });
  $("darkModeToggleSidebar").addEventListener("click", toggleDarkMode);
  $("darkModeToggleTop").addEventListener("click", toggleDarkMode);
  $("logoutBtn").addEventListener("click", () => {
    if (confirm("Yakin ingin logout?")) logout();
  });

  /* ---------- PROFIL ---------- */
  $("btnEditProfile").addEventListener("click", openEditProfile);
  $("formEditProfile").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("editName").value.trim();
    const phone = $("editPhone").value.trim();
    const address = $("editAddress").value.trim();
    const currentUser = lsGet(LS_KEYS.USER, {});

    if (name.length < 3)
      return showToast("Nama lengkap minimal 3 karakter.", "error");
    const emailCheck = validateEmail($("editEmail").value);
    if (!emailCheck.valid) return showToast(emailCheck.message, "error");
    if (
      emailCheck.email !== currentUser.email.toLowerCase() &&
      findAccount(emailCheck.email)
    )
      return showToast("Email tersebut sudah dipakai akun lain.", "error");
    const phoneClean = phone.replace(/[\s-]/g, "");
    if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(phoneClean))
      return showToast(
        "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.",
        "error",
      );
    if (address.length < 10)
      return showToast("Alamat terlalu singkat, minimal 10 karakter.", "error");

    saveAccounts(
      getAccounts().map((a) =>
        a.email.toLowerCase() === currentUser.email.toLowerCase()
          ? { ...a, name, email: emailCheck.email, phone: phoneClean, address }
          : a,
      ),
    );
    lsSet(LS_KEYS.USER, {
      ...currentUser,
      name,
      email: emailCheck.email,
      phone: phoneClean,
      address,
    });
    lsSet(LS_KEYS.SESSION, emailCheck.email);
    renderProfile();
    updateNavUser();
    closeModal("modalEditProfile");
    showToast("Data profil berhasil disimpan.", "success", "✅");
  });

  /* ---------- DASHBOARD SHORTCUTS ---------- */
  $("btnCariSekitar").addEventListener("click", () => goToPage("places"));
  $("btnLihatItinerary").addEventListener("click", () => goToPage("itinerary"));
  $("btnNewTripDash").addEventListener("click", () => openModal("modalTrip"));

  /* ---------- TRIP BARU ---------- */
  $("formTrip").addEventListener("submit", (e) => {
    e.preventDefault();
    const start = $("tripStart").value;
    const end = $("tripEnd").value;
    if (new Date(end) < new Date(start))
      return showToast(
        "Tanggal selesai tidak boleh sebelum tanggal mulai.",
        "error",
      );
    const trips = getTrips();
    trips.push({
      id: uid(),
      name: $("tripName").value.trim(),
      destination: $("tripDestination").value.trim(),
      start,
      end,
      budget: Number($("tripBudget").value),
      createdAt: Date.now(),
    });
    saveTrips(trips);
    e.target.reset();
    closeModal("modalTrip");
    renderDashboard();
    renderTripSelectOptions();
    renderBudget();
    showToast("Trip berhasil dibuat!", "success", "✈️");
  });

  /* ---------- ITINERARY ---------- */
  $("itineraryTripSelect").addEventListener("change", renderItinerary);
  $("btnAddItinerary").addEventListener("click", () => {
    if (!$("itineraryTripSelect").value)
      return showToast("Buat trip terlebih dahulu.", "error");
    openModal("modalItinerary");
  });
  $("formItinerary").addEventListener("submit", (e) => {
    e.preventDefault();
    const list = getItinerary();
    list.push({
      id: uid(),
      tripId: $("itineraryTripSelect").value,
      time: $("itnTime").value,
      activity: $("itnActivity").value.trim(),
      location: $("itnLocation").value.trim(),
    });
    saveItinerary(list);
    e.target.reset();
    closeModal("modalItinerary");
    renderItinerary();
    showToast("Data berhasil disimpan.", "success");
  });

  /* ---------- TEMPAT SEKITAR ---------- */
  $("btnDetectLocationPlaces").addEventListener("click", detectLocation);
  renderPlacesStatus();

  const citySelect = $("placesCitySelect");
  citySelect.innerHTML =
    '<option value="all">Semua Kota</option>' +
    Object.keys(CURATED_CITIES)
      .map((city) => `<option value="${city}">${city}</option>`)
      .join("");
  citySelect.addEventListener("change", () => {
    currentCityFilter = citySelect.value;
    renderPlacesGrid();
  });

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

  // Sudah pernah deteksi lokasi -> muat ulang tempat sekitar; kalau belum -> tampilkan data kurasi
  const savedLoc = lsGet(LS_KEYS.LAST_LOCATION, null);
  if (savedLoc) fetchNearbyPlaces(savedLoc.lat, savedLoc.lon);
  else renderCuratedPlacesDefault();

  $("btnConfirmAddToTrip").addEventListener("click", () => {
    const tripId = $("chooseTripSelect").value;
    if (!tripId || !pendingPlaceForTrip) return;
    const info = CATEGORY_INFO[pendingPlaceForTrip.category];
    const list = getItinerary();
    list.push({
      id: uid(),
      tripId,
      time: $("chooseTripTime").value || "08:00",
      activity: `Kunjungi ${pendingPlaceForTrip.name}`,
      location: `${info.label} — ${pendingPlaceForTrip.name}`,
    });
    saveItinerary(list);
    closeModal("modalChooseTrip");
    pendingPlaceForTrip = null;
    showToast("Tempat berhasil ditambahkan ke itinerary!", "success", "📌");
  });

  /* ---------- BUDGET ---------- */
  $("btnAddBudget").addEventListener("click", () => openModal("modalBudget"));
  $("formBudget").addEventListener("submit", (e) => {
    e.preventDefault();
    const list = lsGet(LS_KEYS.BUDGET, []);
    list.push({
      id: uid(),
      category: $("budgetCategory").value,
      amount: Number($("budgetNominal").value),
      note: $("budgetNote").value.trim(),
      date: Date.now(),
    });
    lsSet(LS_KEYS.BUDGET, list);
    e.target.reset();
    closeModal("modalBudget");
    renderBudget();
    renderDashboard();
    showToast("Data berhasil disimpan.", "success");
  });

  /* ---------- PACKING LIST ---------- */
  $("btnAddPacking").addEventListener("click", () => openModal("modalPacking"));
  $("formPacking").addEventListener("submit", (e) => {
    e.preventDefault();
    const list = lsGet(LS_KEYS.PACKING, []);
    list.push({
      id: uid(),
      name: $("packingItemName").value.trim(),
      checked: false,
    });
    lsSet(LS_KEYS.PACKING, list);
    e.target.reset();
    closeModal("modalPacking");
    renderPacking();
    renderDashboard();
    showToast("Barang packing ditambahkan.", "success", "🎒");
  });

  /* ---------- CATATAN ---------- */
  $("btnAddNote").addEventListener("click", () => openModal("modalNote"));
  $("formNote").addEventListener("submit", (e) => {
    e.preventDefault();
    const list = lsGet(LS_KEYS.NOTES, []);
    list.push({
      id: uid(),
      title: $("noteTitle").value.trim(),
      content: $("noteContent").value.trim(),
      createdAt: Date.now(),
    });
    lsSet(LS_KEYS.NOTES, list);
    e.target.reset();
    closeModal("modalNote");
    renderNotes();
    showToast("Catatan berhasil disimpan.", "success");
  });

  /* ---------- PENCARIAN GLOBAL ---------- */
  const searchInput = $("globalSearch");
  searchInput.addEventListener("input", () =>
    performGlobalSearch(searchInput.value),
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".topbar-search"))
      $("searchResults").classList.add("hidden");
  });
});

/* =============================================================
   TripMate — modul-peta.js  (Modul 1: Peta interaktif Leaflet)
   Dimuat SETELAH script.js, fix-lokasi.js, dan library Leaflet.
   Fitur: peta OpenStreetMap, marker tempat (kurasi vs OSM dibedakan),
   lingkaran akurasi GPS, rute mobil (OSRM) dari lokasimu ke tempat,
   dan "Atur lokasi manual" dengan mengetuk peta.
   ============================================================= */
(function () {
  let map = null;
  let layerPlaces = null;
  let layerUser = null;
  let layerRoute = null;
  let manualMode = false;

  /* ---------- Gaya khusus peta (disisipkan lewat JS) ---------- */
  function injectStyle() {
    const st = document.createElement("style");
    st.textContent = `
      #placesMap{height:380px;border-radius:14px;margin:0 0 16px;z-index:0}
      #placesMap.manual{cursor:crosshair}
      .tm-pin{font-size:20px;line-height:1;text-align:center;
        filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
      .tm-pin.approx{opacity:.75}
      .tm-map-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;
        margin-bottom:8px;font-size:13px}
      .tm-popup{min-width:170px}
      .tm-popup button{margin:6px 6px 0 0;cursor:pointer}
    `;
    document.head.appendChild(st);
  }

  /* ---------- Helper ---------- */
  function setInfo(text) {
    const el = document.getElementById("tmMapInfo");
    if (el) el.textContent = text || "";
  }

  // Aturan yang sama dengan tombol "Lihat di Google Maps" pada kartu tempat
  function googleMapsUrl(place) {
    const q =
      place.source === "curated"
        ? [
            ...new Set([place.name, place.address, place.city].filter(Boolean)),
          ].join(", ")
        : `${place.lat},${place.lon}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  // Tempat yang sedang tampil (mengikuti filter kategori & kota di halaman)
  function visiblePlaces() {
    let list = currentPlaces || [];
    if (currentPlaceFilter !== "all") {
      list = list.filter(
        (p) => CATEGORY_INFO[p.category].filter === currentPlaceFilter,
      );
    }
    if (currentCityFilter !== "all") {
      list = list.filter(
        (p) => p.source !== "curated" || p.city === currentCityFilter,
      );
    }
    return list;
  }

  /* ---------- Inisialisasi peta ---------- */
  function initMap() {
    const wrap = document.getElementById("placesMapWrap");
    if (!wrap) return;
    if (typeof L === "undefined") {
      wrap.innerHTML =
        '<p class="empty-text">Peta gagal dimuat. Periksa koneksi internet.</p>';
      return;
    }

    wrap.innerHTML = `
      <div class="tm-map-bar">
        <button class="btn btn-secondary btn-sm" id="tmBtnManual">📌 Atur lokasi manual</button>
        <button class="btn btn-secondary btn-sm" id="tmBtnClearRoute">✖ Hapus rute</button>
        <span id="tmMapInfo" style="color:var(--text-muted)"></span>
      </div>
      <div id="placesMap"></div>`;

    const saved = lsGet(LS_KEYS.LAST_LOCATION, null);
    const start = saved
      ? [saved.lat, saved.lon]
      : [
          CURATED_CITIES["Kota Probolinggo"].center.lat,
          CURATED_CITIES["Kota Probolinggo"].center.lon,
        ];

    map = L.map("placesMap").setView(start, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; kontributor OpenStreetMap",
    }).addTo(map);

    layerPlaces = L.layerGroup().addTo(map);
    layerUser = L.layerGroup().addTo(map);
    layerRoute = L.layerGroup().addTo(map);

    map.on("click", onMapClick);
    document
      .getElementById("tmBtnManual")
      .addEventListener("click", toggleManual);
    document.getElementById("tmBtnClearRoute").addEventListener("click", () => {
      layerRoute.clearLayers();
      setInfo("");
    });
  }

  /* ---------- Lokasi pengguna di peta ---------- */
  function drawUser() {
    if (!map) return;
    layerUser.clearLayers();
    const loc = lsGet(LS_KEYS.LAST_LOCATION, null);
    if (!loc) return;
    if (loc.accuracy > 0) {
      L.circle([loc.lat, loc.lon], {
        radius: loc.accuracy,
        color: "#2563eb",
        weight: 1,
        fillOpacity: 0.1,
      }).addTo(layerUser);
    }
    L.circleMarker([loc.lat, loc.lon], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: "#2563eb",
      fillOpacity: 1,
    })
      .bindTooltip(loc.manual ? "Lokasi manual" : "Lokasimu")
      .addTo(layerUser);
  }

  /* ---------- Marker tempat ---------- */
  function popupFor(place) {
    const isCurated = place.source === "curated";
    const el = document.createElement("div");
    el.className = "tm-popup";

    const title = document.createElement("b");
    title.textContent = place.name;
    const sub = document.createElement("div");
    sub.textContent =
      CATEGORY_INFO[place.category].label +
      (isCurated ? " · " + place.city : "");
    el.append(title, sub);

    if (isCurated) {
      const warn = document.createElement("div");
      warn.style.cssText = "color:#b45309;font-size:12px;margin-top:4px";
      warn.textContent = "⚠️ Koordinat perkiraan";
      el.append(warn);
    }

    const btnMaps = document.createElement("button");
    btnMaps.className = "btn btn-secondary btn-sm";
    btnMaps.textContent = "🗺️ Google Maps";
    btnMaps.addEventListener("click", () =>
      window.open(googleMapsUrl(place), "_blank", "noopener,noreferrer"),
    );

    const btnRoute = document.createElement("button");
    btnRoute.className = "btn btn-primary btn-sm";
    btnRoute.textContent = "🚗 Rute";
    btnRoute.addEventListener("click", () => drawRoute(place));

    el.append(btnMaps, btnRoute);
    return el;
  }

  function drawPlaces() {
    if (!map) return;
    layerPlaces.clearLayers();
    const list = visiblePlaces().filter((p) => p.lat != null && p.lon != null);

    list.slice(0, 150).forEach((place) => {
      const isCurated = place.source === "curated";
      const icon = L.divIcon({
        className: "",
        html: `<div class="tm-pin ${isCurated ? "approx" : ""}">${CATEGORY_INFO[place.category].icon}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -10],
      });
      L.marker([place.lat, place.lon], { icon })
        .bindPopup(() => popupFor(place))
        .addTo(layerPlaces);
    });

    // Sesuaikan tampilan: lokasimu + 12 tempat pertama (terdekat bila lokasi aktif)
    const pts = list.slice(0, 12).map((p) => [p.lat, p.lon]);
    const loc = lsGet(LS_KEYS.LAST_LOCATION, null);
    if (loc) pts.push([loc.lat, loc.lon]);
    if (pts.length)
      map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
  }

  /* ---------- Rute mobil (OSRM demo server) ---------- */
  async function drawRoute(place) {
    const loc = lsGet(LS_KEYS.LAST_LOCATION, null);
    if (!loc) {
      showToast("Deteksi lokasimu dulu untuk membuat rute.", "error", "📍");
      return;
    }
    map.closePopup();
    setInfo("Menghitung rute...");
    try {
      // OSRM memakai urutan lon,lat (kebalikan dari Leaflet)
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${loc.lon},${loc.lat};${place.lon},${place.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("OSRM error");
      const data = await res.json();
      const route = data.routes && data.routes[0];
      if (!route) throw new Error("Rute tidak ditemukan");

      layerRoute.clearLayers();
      const line = L.geoJSON(route.geometry, {
        style: { color: "#0ea5e9", weight: 5, opacity: 0.85 },
      }).addTo(layerRoute);
      map.fitBounds(line.getBounds().pad(0.15));

      const approx =
        place.source === "curated" ? " (titik tujuan perkiraan)" : "";
      setInfo(
        `🚗 ${formatDistance(route.distance)} · ± ${Math.max(1, Math.round(route.duration / 60))} menit ke ${place.name}${approx}`,
      );
    } catch (e) {
      setInfo("");
      showToast("Gagal membuat rute. Coba lagi nanti.", "error", "🚗");
    }
  }

  /* ---------- Atur lokasi manual (ketuk peta) ---------- */
  function toggleManual() {
    manualMode = !manualMode;
    document.getElementById("placesMap").classList.toggle("manual", manualMode);
    document.getElementById("tmBtnManual").textContent = manualMode
      ? "❌ Batal atur lokasi"
      : "📌 Atur lokasi manual";
    setInfo(manualMode ? "Ketuk titik di peta untuk menetapkan lokasimu." : "");
  }

  async function onMapClick(e) {
    if (!manualMode) return;
    const { lat, lng: lon } = e.latlng;
    if (!isInsideIndonesia(lat, lon)) {
      showToast("Titik di luar wilayah Indonesia.", "error", "🇮🇩");
      return;
    }
    lsSet(LS_KEYS.LAST_LOCATION, {
      lat,
      lon,
      accuracy: 10,
      manual: true,
      address: null,
      timestamp: Date.now(),
    });
    toggleManual();
    renderDashboard();
    renderPlacesStatus();
    fetchNearbyPlaces(lat, lon);
    showToast("Lokasi manual disimpan.", "success", "📌");

    const address = await reverseGeocode(lat, lon);
    const current = lsGet(LS_KEYS.LAST_LOCATION, null);
    if (address && current) {
      lsSet(LS_KEYS.LAST_LOCATION, { ...current, address });
      renderDashboard();
      renderPlacesStatus();
    }
  }

  /* ---------- Sambungkan ke fungsi yang sudah ada ---------- */
  const origGrid = window.renderPlacesGrid;
  window.renderPlacesGrid = function () {
    origGrid();
    drawPlaces();
  };
  const origStatus = window.renderPlacesStatus;
  window.renderPlacesStatus = function () {
    origStatus();
    drawUser();
  };
  const origGoTo = window.goToPage;
  window.goToPage = function (name) {
    origGoTo(name);
    if (name === "places" && map) {
      // Peta di dalam halaman tersembunyi perlu dihitung ulang ukurannya
      setTimeout(() => {
        map.invalidateSize();
        drawUser();
        drawPlaces();
      }, 150);
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectStyle();
    initMap();
    drawUser();
    drawPlaces();
  });
})();
