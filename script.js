/* =============================================================
   TripMate — script.js
   Aplikasi Smart Trip Planner (murni JavaScript, tanpa framework)
   Semua data disimpan di localStorage (tidak ada backend/database)
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
   AUTENTIKASI
   -------------------------------------------------------------
   Dua cara masuk:
   1. GOOGLE SIGN-IN (OAuth resmi) — pengguna login di halaman Google.
      Password Google TIDAK PERNAH masuk ke aplikasi ini. Google mengirim
      balik token berisi nama + email yang sudah terverifikasi oleh Google.
   2. AKUN TRIPMATE — email + password milik aplikasi ini sendiri,
      divalidasi ketat dan disimpan sebagai hash di localStorage.

   CATATAN PENTING soal keamanan:
   Aplikasi ini tanpa backend, jadi hash password tersimpan di browser
   pengguna. Ini cukup untuk tugas/demo, TAPI bukan keamanan tingkat
   produksi. Jangan pernah memakai password asli Google/bank di sini.
   ============================================================= */

/* ---------- KONFIGURASI GOOGLE SIGN-IN ----------
   Isi CLIENT_ID dengan OAuth Client ID milikmu dari Google Cloud Console:
   1. Buka https://console.cloud.google.com/apis/credentials
   2. Create Credentials → OAuth client ID → Web application
   3. Tambahkan "Authorized JavaScript origins", misalnya http://localhost:5500
   4. Salin Client ID-nya ke bawah ini.
   Google Sign-In HANYA bekerja saat halaman dibuka lewat http/https
   (contoh: Live Server VS Code), tidak bisa lewat file:// */
const GOOGLE_CLIENT_ID = ""; // <-- isi dengan Client ID milikmu

/* ---------- VALIDASI EMAIL ---------- */
// Daftar domain email yang diterima. Salah ketik domain (gmial.com, gmail.co)
// akan langsung ditolak sebelum pengguna bisa mendaftar/login.
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

// Salah ketik domain yang umum → beri saran perbaikan, bukan sekadar ditolak
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

  // Format dasar email: ada nama, @, domain, dan ekstensi
  const formatRegex =
    /^[a-z0-9]([a-z0-9._%+-]*[a-z0-9])?@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!formatRegex.test(email)) {
    return {
      valid: false,
      message: "Format email tidak valid. Contoh benar: nama@gmail.com",
    };
  }

  const domain = email.split("@")[1];

  // Cek salah ketik domain yang umum
  if (DOMAIN_TYPOS[domain]) {
    return {
      valid: false,
      message: `Domain "${domain}" tidak valid. Maksud kamu "@${DOMAIN_TYPOS[domain]}"?`,
    };
  }

  // Hanya domain penyedia email yang dikenal yang diterima
  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return {
      valid: false,
      message: `Domain "@${domain}" tidak didukung. Gunakan email seperti @gmail.com, @yahoo.com, atau @outlook.com.`,
    };
  }

  // Aturan khusus Gmail: minimal 6 karakter sebelum @, hanya huruf/angka/titik
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const localPart = email.split("@")[0];
    if (localPart.length < 6) {
      return {
        valid: false,
        message: "Alamat Gmail minimal 6 karakter sebelum tanda @.",
      };
    }
    if (!/^[a-z0-9.]+$/.test(localPart)) {
      return {
        valid: false,
        message: "Alamat Gmail hanya boleh berisi huruf, angka, dan titik.",
      };
    }
    if (
      localPart.startsWith(".") ||
      localPart.endsWith(".") ||
      localPart.includes("..")
    ) {
      return {
        valid: false,
        message:
          "Alamat Gmail tidak boleh diawali/diakhiri titik atau punya titik ganda.",
      };
    }
  }

  return { valid: true, email };
}

/* ---------- VALIDASI PASSWORD ---------- */
// Password yang terlalu umum langsung ditolak
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

function validatePassword(password) {
  if (!password) return { valid: false, message: "Password wajib diisi." };
  if (password.length < 8)
    return { valid: false, message: "Password minimal 8 karakter." };
  if (password.length > 64)
    return { valid: false, message: "Password maksimal 64 karakter." };
  if (!/[A-Z]/.test(password))
    return {
      valid: false,
      message: "Password harus mengandung minimal 1 huruf besar.",
    };
  if (!/[a-z]/.test(password))
    return {
      valid: false,
      message: "Password harus mengandung minimal 1 huruf kecil.",
    };
  if (!/[0-9]/.test(password))
    return {
      valid: false,
      message: "Password harus mengandung minimal 1 angka.",
    };
  if (/\s/.test(password))
    return { valid: false, message: "Password tidak boleh mengandung spasi." };
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    return {
      valid: false,
      message: "Password terlalu umum dan mudah ditebak. Gunakan yang lain.",
    };
  }
  return { valid: true };
}

// Hitung kekuatan password untuk indikator visual (0–100)
function passwordStrength(password) {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (password.length >= 12) score += 15;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[a-z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 15;
  return Math.min(100, score);
}

/* ---------- HASHING PASSWORD ---------- */
// Password tidak disimpan apa adanya, melainkan sebagai hash.
// Memakai Web Crypto (SHA-256) bila tersedia; kalau halaman dibuka lewat
// file:// (Web Crypto dimatikan browser), pakai hash cadangan sederhana.
async function hashPassword(password) {
  const salted = "tripmate$" + password;
  if (window.crypto && window.crypto.subtle) {
    try {
      const data = new TextEncoder().encode(salted);
      const digest = await window.crypto.subtle.digest("SHA-256", data);
      return (
        "sha256:" +
        Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      );
    } catch (e) {
      /* lanjut ke cadangan di bawah */
    }
  }
  // Hash cadangan (bukan kriptografi kuat, hanya agar tidak tersimpan polos)
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
  return (
    getAccounts().find(
      (a) => a.email.toLowerCase() === (email || "").trim().toLowerCase(),
    ) || null
  );
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

/* ---------- MASUK KE APLIKASI SETELAH AUTENTIKASI BERHASIL ---------- */
function completeLogin(userProfile, welcomeMessage) {
  lsSet(LS_KEYS.USER, userProfile);
  lsSet(LS_KEYS.SESSION, userProfile.email);

  // Seed packing list default untuk pengguna baru
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
   GOOGLE SIGN-IN (OAuth resmi Google)
   ============================================================= */

// Membaca isi token JWT dari Google (bagian payload-nya saja, tanpa verifikasi
// tanda tangan — verifikasi penuh memerlukan server).
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

// Dipanggil otomatis oleh Google setelah pengguna berhasil login di Google
function handleGoogleCredential(response) {
  const data = parseGoogleToken(response.credential);

  if (!data || !data.email) {
    showToast("Gagal membaca data akun Google.", "error");
    return;
  }

  // Google menandai apakah email tersebut sudah terverifikasi kepemilikannya
  if (data.email_verified === false) {
    showToast("Akun Google ini belum terverifikasi oleh Google.", "error");
    return;
  }

  // Simpan/gabungkan sebagai akun bertipe Google (tanpa password lokal)
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

// Tampilkan tombol Google, atau pesan penjelasan bila belum dikonfigurasi
function initGoogleSignIn() {
  const container = document.getElementById("googleBtnContainer");
  const hint = document.getElementById("googleHint");
  if (!container) return;

  const isHttp =
    location.protocol === "http:" || location.protocol === "https:";

  if (!GOOGLE_CLIENT_ID) {
    hint.className = "google-hint warn";
    hint.innerHTML =
      "⚙️ <b>Login Google belum aktif.</b> Isi <code>GOOGLE_CLIENT_ID</code> di script.js dengan OAuth Client ID dari Google Cloud Console untuk mengaktifkannya. Sementara itu, gunakan akun TripMate di bawah.";
    return;
  }
  if (!isHttp) {
    hint.className = "google-hint warn";
    hint.innerHTML =
      "⚙️ <b>Login Google butuh server.</b> Buka halaman ini lewat http:// (misalnya Live Server VS Code), bukan file://. Sementara itu, gunakan akun TripMate di bawah.";
    return;
  }
  if (!window.google || !window.google.accounts) {
    hint.className = "google-hint warn";
    hint.textContent =
      "⚙️ Library Google gagal dimuat. Periksa koneksi internet kamu.";
    return;
  }

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
    hint.className = "google-hint warn";
    hint.textContent =
      "⚙️ Gagal menampilkan tombol Google. Periksa Client ID dan Authorized JavaScript origins.";
  }
}

/* =============================================================
   HALAMAN LOGIN / REGISTER (akun TripMate)
   ============================================================= */
function initAuthPage() {
  clearAllAuthErrors();

  // Coba tampilkan tombol Google (library dimuat async, jadi dicoba beberapa kali)
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

  // --- Perpindahan tab Masuk / Daftar ---
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

  // --- Tombol lihat/sembunyikan password ---
  document.querySelectorAll(".toggle-pass").forEach((btn) => {
    btn.onclick = () => {
      const input = document.getElementById(btn.dataset.target);
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "👁️" : "🙈";
    };
  });

  // --- Indikator kekuatan password saat mengetik ---
  const regPassword = document.getElementById("regPassword");
  regPassword.oninput = () => {
    const score = passwordStrength(regPassword.value);
    const fill = document.getElementById("passStrengthFill");
    fill.style.width = score + "%";
    fill.style.background =
      score < 50 ? "#ef4444" : score < 75 ? "#f59e0b" : "#22c55e";
    clearFieldError("errRegPassword", "regPassword");
  };

  // Hapus tanda error begitu pengguna memperbaiki isian
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

    // 1. Email harus valid formatnya — kalau salah, tidak bisa login
    const emailCheck = validateEmail(emailInput);
    if (!emailCheck.valid) {
      showFieldError("errLoginEmail", "loginEmail", emailCheck.message);
      showToast("Email tidak valid.", "error");
      return;
    }

    // 2. Akun harus sudah terdaftar
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

    // 3. Akun Google harus masuk lewat tombol Google
    if (account.provider === "google") {
      showFieldError(
        "errLoginEmail",
        "loginEmail",
        'Akun ini terdaftar via Google. Gunakan tombol "Masuk dengan Google" di atas.',
      );
      showToast("Gunakan login Google untuk akun ini.", "error");
      return;
    }

    // 4. Password harus cocok — kalau salah, tidak bisa login
    const inputHash = await hashPassword(password);
    if (inputHash !== account.passwordHash) {
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

    // 1. Nama minimal 3 karakter
    if (name.length < 3) {
      showFieldError(
        "errRegName",
        "regName",
        "Nama lengkap minimal 3 karakter.",
      );
      hasError = true;
    }

    // 2. Email harus valid — salah format/domain langsung ditolak
    const emailCheck = validateEmail(emailInput);
    if (!emailCheck.valid) {
      showFieldError("errRegEmail", "regEmail", emailCheck.message);
      hasError = true;
    } else if (findAccount(emailCheck.email)) {
      showFieldError(
        "errRegEmail",
        "regEmail",
        "Email ini sudah terdaftar. Silakan masuk.",
      );
      hasError = true;
    }

    // 3. Password harus memenuhi syarat keamanan
    const passCheck = validatePassword(password);
    if (!passCheck.valid) {
      showFieldError("errRegPassword", "regPassword", passCheck.message);
      hasError = true;
    }

    // 4. Konfirmasi password harus sama
    if (password !== password2) {
      showFieldError(
        "errRegPassword2",
        "regPassword2",
        "Konfirmasi password tidak cocok.",
      );
      hasError = true;
    }

    // 5. Nomor HP Indonesia: 08xxx / +628xxx / 628xxx, 10–15 digit
    const phoneClean = phone.replace(/[\s-]/g, "");
    if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(phoneClean)) {
      showFieldError(
        "errRegPhone",
        "regPhone",
        "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.",
      );
      hasError = true;
    }

    // 6. Alamat minimal 10 karakter
    if (address.length < 10) {
      showFieldError(
        "errRegAddress",
        "regAddress",
        "Alamat terlalu singkat, minimal 10 karakter.",
      );
      hasError = true;
    }

    if (hasError) {
      showToast(
        "Pendaftaran gagal. Periksa isian yang ditandai merah.",
        "error",
      );
      return;
    }

    // Semua valid → simpan akun beserta hash password-nya
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

  // Putus sesi otomatis Google agar tidak langsung login ulang
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

  // Tandai apakah akun berasal dari Google atau akun TripMate biasa
  const badge = document.getElementById("profileProvider");
  if (badge) {
    badge.textContent =
      user.provider === "google"
        ? "🔐 Terhubung dengan Google"
        : "🔑 Akun TripMate";
    badge.className =
      "provider-badge " + (user.provider === "google" ? "google" : "local");
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
let currentCityFilter = "all";
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
 * DATA KURASI TEMPAT PER KOTA
 * - Kota Probolinggo: rangkuman informasi publik (Dispopar Kota Probolinggo & referensi lokal), cukup detail
 *   hingga tingkat cafe/kuliner/hotel per jalan.
 * - Kota-kota lain: berisi landmark/tempat paling terkenal sebagai titik awal, belum sedetail Probolinggo.
 * Catatan: seluruh koordinat (lat/lon) bersifat PERKIRAAN, disarankan diverifikasi ulang lewat Google Maps
 * sebelum dipakai secara presisi.
 */
const CURATED_CITIES = {
  "Kota Probolinggo": {
    center: { lat: -7.7546, lon: 113.2159 },
    places: [
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
    ],
  },

  Surabaya: {
    center: { lat: -7.2575, lon: 112.7521 },
    places: [
      {
        name: "Tugu Pahlawan",
        category: "budaya",
        address: "Jl. Pahlawan, Surabaya",
        lat: -7.245808,
        lon: 112.737785,
        description: "Monumen ikon Kota Surabaya beserta Museum 10 Nopember.",
      },
      {
        name: "House of Sampoerna",
        category: "budaya",
        address: "Surabaya",
        lat: -7.2323,
        lon: 112.7376,
        description: "Museum sejarah kretek Sampoerna di kawasan kota tua.",
      },
      {
        name: "Jembatan Merah",
        category: "budaya",
        address: "Surabaya",
        lat: -7.2385,
        lon: 112.7368,
        description: "Kawasan bersejarah peninggalan kolonial.",
      },
      {
        name: "Museum Kapal Selam (Monkasel)",
        category: "wisata",
        address: "Surabaya",
        lat: -7.2661,
        lon: 112.7439,
        description: "Museum kapal selam asli KRI Pasopati.",
      },
      {
        name: "Taman Bungkul",
        category: "taman",
        address: "Surabaya",
        lat: -7.2925,
        lon: 112.7387,
        description: "Taman kota populer untuk bersantai dan olahraga.",
      },
      {
        name: "Kebun Binatang Surabaya",
        category: "wisata",
        address: "Surabaya",
        lat: -7.2917,
        lon: 112.7379,
      },
      {
        name: "Jembatan Suramadu",
        category: "wisata",
        address: "Surabaya",
        lat: -7.1725,
        lon: 112.7614,
        description: "Jembatan penghubung Surabaya–Madura.",
      },
      {
        name: "Masjid Al Akbar Surabaya",
        category: "budaya",
        address: "Surabaya",
        lat: -7.3327,
        lon: 112.7166,
        description: "Masjid terbesar kedua di Indonesia.",
      },
      {
        name: "Klenteng Sanggar Agung",
        category: "budaya",
        address: "Kenjeran, Surabaya",
        lat: -7.2265,
        lon: 112.7972,
        description: "Klenteng dengan patung Dewi Kwan Im menghadap laut.",
      },
      {
        name: "Tunjungan Plaza",
        category: "mall",
        address: "Jl. Basuki Rahmat, Surabaya",
        lat: -7.2624,
        lon: 112.7396,
      },
      {
        name: "Pakuwon Mall",
        category: "mall",
        address: "Surabaya Barat",
        lat: -7.2793,
        lon: 112.6725,
      },
      {
        name: "Sate Klopo Ondomohen",
        category: "kuliner",
        address: "Surabaya",
        lat: -7.2665,
        lon: 112.7413,
        description: "Sate klopo (kelapa) khas Surabaya.",
      },
      {
        name: "Rawon Setan",
        category: "kuliner",
        address: "Jl. Embong Malang, Surabaya",
        lat: -7.2635,
        lon: 112.7376,
      },
      {
        name: "Rujak Cingur Ahmad Jais",
        category: "kuliner",
        address: "Surabaya",
        lat: -7.254,
        lon: 112.744,
        description: "Rujak cingur legendaris khas Surabaya.",
      },
      {
        name: "Lontong Balap Pak Gendut",
        category: "kuliner",
        address: "Surabaya",
        lat: -7.258,
        lon: 112.742,
      },
      {
        name: "Zangrandi Ice Cream",
        category: "cafe",
        address: "Jl. Yos Sudarso, Surabaya",
        lat: -7.2603,
        lon: 112.743,
        description: "Kedai es krim legendaris sejak era kolonial.",
      },
      {
        name: "Hotel Majapahit",
        category: "hotel",
        address: "Jl. Tunjungan, Surabaya",
        lat: -7.2637,
        lon: 112.7396,
        description: "Hotel bersejarah peninggalan kolonial.",
      },
      {
        name: "Bumi Surabaya City Resort",
        category: "hotel",
        address: "Surabaya",
        lat: -7.266,
        lon: 112.7392,
      },
      {
        name: "Stasiun Surabaya Gubeng",
        category: "penting",
        address: "Surabaya",
        lat: -7.2646,
        lon: 112.7523,
        description: "Stasiun kereta api utama.",
      },
      {
        name: "Terminal Purabaya (Bungurasih)",
        category: "penting",
        address: "Surabaya",
        lat: -7.3444,
        lon: 112.7186,
        description: "Terminal bus antar kota terbesar.",
      },
      {
        name: "Pelabuhan Tanjung Perak",
        category: "penting",
        address: "Surabaya",
        lat: -7.1953,
        lon: 112.7328,
        description: "Pelabuhan utama Surabaya.",
      },
    ],
  },

  Malang: {
    center: { lat: -7.9797, lon: 112.6304 },
    places: [
      {
        name: "Alun-Alun Kota Malang",
        category: "wisata",
        address: "Malang",
        lat: -7.9797,
        lon: 112.6304,
      },
      {
        name: "Jatim Park 1",
        category: "wisata",
        address: "Batu, Malang",
        lat: -7.8817,
        lon: 112.5194,
      },
      {
        name: "Jatim Park 2",
        category: "wisata",
        address: "Batu, Malang",
        lat: -7.8776,
        lon: 112.523,
        description: "Berisi Museum Satwa dan Batu Secret Zoo.",
      },
      {
        name: "Museum Angkut",
        category: "wisata",
        address: "Batu, Malang",
        lat: -7.8802,
        lon: 112.5133,
      },
      {
        name: "Batu Night Spectacular (BNS)",
        category: "wisata",
        address: "Batu, Malang",
        lat: -7.8721,
        lon: 112.5211,
        description: "Taman hiburan malam di Batu.",
      },
      {
        name: "Coban Rondo",
        category: "wisata",
        address: "Pujon, Malang",
        lat: -7.8783,
        lon: 112.4636,
        description: "Air terjun populer di kawasan Pujon.",
      },
      {
        name: "Kampung Warna Warni Jodipan",
        category: "wisata",
        address: "Malang",
        lat: -7.9847,
        lon: 112.6255,
        description: "Kampung tematik penuh warna.",
      },
      {
        name: "Alun-Alun Tugu Malang",
        category: "wisata",
        address: "Malang",
        lat: -7.9758,
        lon: 112.6317,
        description: "Taman kota di depan Balai Kota Malang.",
      },
      {
        name: "Toko Oen",
        category: "kuliner",
        address: "Jl. Basuki Rahmat, Malang",
        lat: -7.9812,
        lon: 112.6289,
        description: "Restoran & es krim legendaris sejak 1930.",
      },
      {
        name: "Bakso President",
        category: "kuliner",
        address: "Malang",
        lat: -7.978,
        lon: 112.6335,
      },
      {
        name: "Pecel Kawi",
        category: "kuliner",
        address: "Jl. Kawi, Malang",
        lat: -7.9856,
        lon: 112.6255,
      },
      {
        name: "Rumah Makan Inggil",
        category: "kuliner",
        address: "Malang",
        lat: -7.9825,
        lon: 112.627,
        description: "Restoran dengan nuansa museum & seni.",
      },
      {
        name: "Coffee Toffee Malang",
        category: "cafe",
        address: "Malang",
        lat: -7.974,
        lon: 112.618,
      },
      {
        name: "Malang Town Square (MATOS)",
        category: "mall",
        address: "Malang",
        lat: -7.9575,
        lon: 112.6172,
      },
      {
        name: "Hotel Tugu Malang",
        category: "hotel",
        address: "Jl. Tugu, Malang",
        lat: -7.9765,
        lon: 112.632,
        description: "Hotel bertema seni dan antik.",
      },
      {
        name: "Stasiun Malang Kota Baru",
        category: "penting",
        address: "Malang",
        lat: -7.977,
        lon: 112.6357,
        description: "Stasiun kereta api utama Malang.",
      },
      {
        name: "Terminal Arjosari",
        category: "penting",
        address: "Malang",
        lat: -7.943,
        lon: 112.644,
        description: "Terminal bus utama Malang.",
      },
    ],
  },

  Yogyakarta: {
    center: { lat: -7.7956, lon: 110.3695 },
    places: [
      {
        name: "Malioboro",
        category: "wisata",
        address: "Yogyakarta",
        lat: -7.793,
        lon: 110.3658,
        description: "Kawasan jalan wisata dan belanja legendaris.",
      },
      {
        name: "Keraton Yogyakarta",
        category: "budaya",
        address: "Yogyakarta",
        lat: -7.8053,
        lon: 110.3642,
      },
      {
        name: "Candi Prambanan",
        category: "wisata",
        address: "Yogyakarta",
        lat: -7.752,
        lon: 110.4915,
        description: "Kompleks candi Hindu terbesar di Indonesia.",
      },
      {
        name: "Candi Borobudur",
        category: "wisata",
        address: "Magelang (dekat Yogyakarta)",
        lat: -7.6079,
        lon: 110.2038,
        description: "Candi Buddha terbesar di dunia.",
      },
      {
        name: "Taman Sari",
        category: "budaya",
        address: "Yogyakarta",
        lat: -7.81,
        lon: 110.3594,
        description: "Bekas taman air Keraton Yogyakarta.",
      },
      {
        name: "Tugu Yogyakarta",
        category: "wisata",
        address: "Yogyakarta",
        lat: -7.7828,
        lon: 110.3671,
      },
      {
        name: "Alun-Alun Kidul",
        category: "wisata",
        address: "Yogyakarta",
        lat: -7.8117,
        lon: 110.3636,
        description: "Alun-alun selatan dengan tradisi masangin.",
      },
      {
        name: "Pantai Parangtritis",
        category: "wisata",
        address: "Bantul, Yogyakarta",
        lat: -8.0253,
        lon: 110.3316,
      },
      {
        name: "Tebing Breksi",
        category: "wisata",
        address: "Sleman, Yogyakarta",
        lat: -7.7712,
        lon: 110.5111,
        description: "Bekas tambang batu dengan pahatan relief.",
      },
      {
        name: "Gembira Loka Zoo",
        category: "wisata",
        address: "Yogyakarta",
        lat: -7.8109,
        lon: 110.3934,
      },
      {
        name: "Gudeg Yu Djum",
        category: "kuliner",
        address: "Yogyakarta",
        lat: -7.7825,
        lon: 110.3776,
        description: "Gudeg legendaris khas Yogyakarta.",
      },
      {
        name: "Angkringan Lik Man (Kopi Joss)",
        category: "kuliner",
        address: "Jl. Wongsodirjan, Yogyakarta",
        lat: -7.7906,
        lon: 110.3672,
        description: "Angkringan legendaris dengan kopi arang.",
      },
      {
        name: "Bakpia Pathok 25",
        category: "kuliner",
        address: "Yogyakarta",
        lat: -7.7973,
        lon: 110.3556,
      },
      {
        name: "Sate Klathak Pak Pong",
        category: "kuliner",
        address: "Bantul, Yogyakarta",
        lat: -7.8636,
        lon: 110.3689,
      },
      {
        name: "Malioboro Mall",
        category: "mall",
        address: "Yogyakarta",
        lat: -7.7924,
        lon: 110.3659,
      },
      {
        name: "Hotel Tentrem Yogyakarta",
        category: "hotel",
        address: "Yogyakarta",
        lat: -7.7784,
        lon: 110.3706,
      },
      {
        name: "Hotel Phoenix Yogyakarta",
        category: "hotel",
        address: "Jl. Jenderal Sudirman, Yogyakarta",
        lat: -7.7823,
        lon: 110.3695,
      },
      {
        name: "Stasiun Yogyakarta (Tugu)",
        category: "penting",
        address: "Yogyakarta",
        lat: -7.7896,
        lon: 110.363,
        description: "Stasiun kereta api utama Yogyakarta.",
      },
      {
        name: "Terminal Giwangan",
        category: "penting",
        address: "Yogyakarta",
        lat: -7.828,
        lon: 110.3805,
        description: "Terminal bus utama Yogyakarta.",
      },
    ],
  },

  Bandung: {
    center: { lat: -6.9175, lon: 107.6191 },
    places: [
      {
        name: "Gedung Sate",
        category: "budaya",
        address: "Bandung",
        lat: -6.9022,
        lon: 107.6186,
        description: "Ikon bangunan bersejarah Kota Bandung.",
      },
      {
        name: "Jalan Braga",
        category: "wisata",
        address: "Bandung",
        lat: -6.9184,
        lon: 107.6098,
        description: "Kawasan bersejarah dengan arsitektur kolonial.",
      },
      {
        name: "Kawah Putih",
        category: "wisata",
        address: "Ciwidey, Bandung",
        lat: -7.1663,
        lon: 107.4022,
      },
      {
        name: "Tangkuban Perahu",
        category: "wisata",
        address: "Lembang, Bandung",
        lat: -6.7597,
        lon: 107.6098,
        description: "Gunung berapi dengan kawah ikonik.",
      },
      {
        name: "Farmhouse Lembang",
        category: "wisata",
        address: "Lembang, Bandung",
        lat: -6.8226,
        lon: 107.6035,
        description: "Wisata bertema pedesaan Eropa.",
      },
      {
        name: "Floating Market Lembang",
        category: "wisata",
        address: "Lembang, Bandung",
        lat: -6.8221,
        lon: 107.6373,
        description: "Pasar terapung dengan wahana keluarga.",
      },
      {
        name: "Trans Studio Bandung",
        category: "wisata",
        address: "Bandung",
        lat: -6.9254,
        lon: 107.6382,
      },
      {
        name: "Masjid Raya Bandung",
        category: "budaya",
        address: "Alun-Alun Bandung",
        lat: -6.9218,
        lon: 107.607,
        description: "Masjid ikonik di pusat Alun-Alun Bandung.",
      },
      {
        name: "Batagor Kingsley",
        category: "kuliner",
        address: "Bandung",
        lat: -6.911,
        lon: 107.6098,
      },
      {
        name: "Mie Kocok Mang Dadeng",
        category: "kuliner",
        address: "Bandung",
        lat: -6.9147,
        lon: 107.6023,
      },
      {
        name: "Sate Hadori",
        category: "kuliner",
        address: "Bandung",
        lat: -6.9037,
        lon: 107.6193,
      },
      {
        name: "Kopi Selasar",
        category: "cafe",
        address: "Bandung",
        lat: -6.889,
        lon: 107.6135,
      },
      {
        name: "Cihampelas Walk",
        category: "mall",
        address: "Bandung",
        lat: -6.8919,
        lon: 107.6058,
      },
      {
        name: "Paris Van Java Mall",
        category: "mall",
        address: "Bandung",
        lat: -6.8926,
        lon: 107.5885,
      },
      {
        name: "Hotel Savoy Homann",
        category: "hotel",
        address: "Jl. Asia Afrika, Bandung",
        lat: -6.9179,
        lon: 107.6088,
        description: "Hotel bersejarah bergaya Art Deco.",
      },
      {
        name: "Stasiun Bandung",
        category: "penting",
        address: "Bandung",
        lat: -6.9139,
        lon: 107.6023,
        description: "Stasiun kereta api utama Bandung.",
      },
      {
        name: "Terminal Leuwipanjang",
        category: "penting",
        address: "Bandung",
        lat: -6.943,
        lon: 107.5892,
        description: "Terminal bus antar kota.",
      },
    ],
  },

  Jakarta: {
    center: { lat: -6.2088, lon: 106.8456 },
    places: [
      {
        name: "Monumen Nasional (Monas)",
        category: "wisata",
        address: "Jakarta Pusat",
        lat: -6.1754,
        lon: 106.8272,
        description: "Ikon utama Kota Jakarta.",
      },
      {
        name: "Kota Tua Jakarta",
        category: "budaya",
        address: "Jakarta Barat",
        lat: -6.1352,
        lon: 106.8133,
        description: "Kawasan bersejarah peninggalan Batavia.",
      },
      {
        name: "Ancol Dreamland",
        category: "wisata",
        address: "Jakarta Utara",
        lat: -6.1256,
        lon: 106.8317,
      },
      {
        name: "Taman Mini Indonesia Indah (TMII)",
        category: "wisata",
        address: "Jakarta Timur",
        lat: -6.3024,
        lon: 106.8951,
        description: "Taman rekreasi budaya nusantara.",
      },
      {
        name: "Ragunan Zoo",
        category: "wisata",
        address: "Jakarta Selatan",
        lat: -6.3125,
        lon: 106.8203,
      },
      {
        name: "Pelabuhan Sunda Kelapa",
        category: "penting",
        address: "Jakarta Utara",
        lat: -6.1252,
        lon: 106.8106,
        description: "Pelabuhan bersejarah era Batavia.",
      },
      {
        name: "Bundaran HI",
        category: "wisata",
        address: "Jakarta Pusat",
        lat: -6.1948,
        lon: 106.823,
        description: "Landmark ikonik Jalan Thamrin.",
      },
      {
        name: "Masjid Istiqlal",
        category: "budaya",
        address: "Jakarta Pusat",
        lat: -6.1702,
        lon: 106.8307,
        description: "Masjid nasional terbesar di Asia Tenggara.",
      },
      {
        name: "Gereja Katedral Jakarta",
        category: "budaya",
        address: "Jakarta Pusat",
        lat: -6.1699,
        lon: 106.8317,
        description: "Gereja katolik bersejarah, tepat di seberang Istiqlal.",
      },
      {
        name: "Soto Betawi H. Ma'ruf",
        category: "kuliner",
        address: "Jakarta",
        lat: -6.1832,
        lon: 106.8188,
      },
      {
        name: "Nasi Uduk Kebon Kacang",
        category: "kuliner",
        address: "Jakarta Pusat",
        lat: -6.1897,
        lon: 106.8172,
      },
      {
        name: "Kerak Telor Pak Edi",
        category: "kuliner",
        address: "Jakarta",
        lat: -6.1256,
        lon: 106.8317,
        description:
          "Kuliner khas Betawi, sering dijumpai di kawasan Ancol/PRJ.",
      },
      {
        name: "Sarinah",
        category: "mall",
        address: "Jakarta Pusat",
        lat: -6.1896,
        lon: 106.8226,
        description: "Pusat perbelanjaan pertama di Indonesia.",
      },
      {
        name: "Grand Indonesia Mall",
        category: "mall",
        address: "Jakarta Pusat",
        lat: -6.1954,
        lon: 106.8206,
      },
      {
        name: "Plaza Indonesia",
        category: "mall",
        address: "Jakarta Pusat",
        lat: -6.1934,
        lon: 106.8222,
      },
      {
        name: "Hotel Indonesia Kempinski",
        category: "hotel",
        address: "Jl. M.H. Thamrin, Jakarta",
        lat: -6.1947,
        lon: 106.8225,
      },
      {
        name: "Stasiun Gambir",
        category: "penting",
        address: "Jakarta Pusat",
        lat: -6.1766,
        lon: 106.8306,
        description: "Stasiun kereta api utama Jakarta.",
      },
      {
        name: "Terminal Kampung Rambutan",
        category: "penting",
        address: "Jakarta Timur",
        lat: -6.3123,
        lon: 106.8631,
        description: "Terminal bus antar kota.",
      },
      {
        name: "Bandara Soekarno-Hatta",
        category: "penting",
        address: "Tangerang (melayani Jakarta)",
        lat: -6.1256,
        lon: 106.6559,
        description: "Bandara internasional utama.",
      },
    ],
  },
};

// Ratakan seluruh data kurasi kota menjadi satu array, masing-masing tempat diberi label kota asalnya
const ALL_CURATED_PLACES = Object.entries(CURATED_CITIES).flatMap(
  ([cityName, cityData]) =>
    cityData.places.map((p) => ({
      id: "curated-" + uid(),
      source: "curated",
      city: cityName,
      ...p,
    })),
);

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

// Tampilkan data kurasi kota (semua kota atau kota terpilih) secara default, tanpa perlu deteksi lokasi dulu
function renderCuratedPlacesDefault() {
  currentPlaces = ALL_CURATED_PLACES.map((p) => ({ ...p, distance: null }));
  renderPlacesGrid();
}

async function fetchNearbyPlaces(lat, lon) {
  const grid = document.getElementById("placesGrid");
  grid.innerHTML =
    '<p class="empty-text">🔎 Mencari tempat menarik di sekitarmu...</p>';

  // Data kurasi seluruh kota selalu disertakan (dengan jarak dari lokasi pengguna)
  const curatedWithDistance = ALL_CURATED_PLACES.map((p) => ({
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

  let filtered = currentPlaces;
  if (currentPlaceFilter !== "all") {
    filtered = filtered.filter(
      (p) => CATEGORY_INFO[p.category].filter === currentPlaceFilter,
    );
  }
  if (currentCityFilter !== "all") {
    // Filter kota hanya berlaku untuk data kurasi; hasil live dari OpenStreetMap tetap ditampilkan
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
    const distanceOrAddress =
      place.distance !== null && place.distance !== undefined
        ? `📏 ${formatDistance(place.distance)} dari lokasimu`
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
    // Tombol "Lihat Peta" otomatis membuka Google Maps pada koordinat tempat tersebut
    card
      .querySelector('[data-action="view-map"]')
      .addEventListener("click", () => {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
        window.open(mapsUrl, "_blank");
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

  // Cek sesi login: sesi kini berisi email pengguna yang sedang masuk
  const user = lsGet(LS_KEYS.USER, null);
  const session = lsGet(LS_KEYS.SESSION, null);
  if (user && session && typeof session === "string" && findAccount(session)) {
    startApp();
  } else {
    lsSet(LS_KEYS.SESSION, null);
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
    const name = document.getElementById("editName").value.trim();
    const emailInput = document.getElementById("editEmail").value;
    const phone = document.getElementById("editPhone").value.trim();
    const address = document.getElementById("editAddress").value.trim();
    const currentUser = lsGet(LS_KEYS.USER, {});

    // Validasi sama ketatnya dengan saat mendaftar
    if (name.length < 3) {
      showToast("Nama lengkap minimal 3 karakter.", "error");
      return;
    }
    const emailCheck = validateEmail(emailInput);
    if (!emailCheck.valid) {
      showToast(emailCheck.message, "error");
      return;
    }
    // Email baru tidak boleh bentrok dengan akun lain
    if (
      emailCheck.email !== currentUser.email.toLowerCase() &&
      findAccount(emailCheck.email)
    ) {
      showToast("Email tersebut sudah dipakai akun lain.", "error");
      return;
    }
    const phoneClean = phone.replace(/[\s-]/g, "");
    if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(phoneClean)) {
      showToast("Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.", "error");
      return;
    }
    if (address.length < 10) {
      showToast("Alamat terlalu singkat, minimal 10 karakter.", "error");
      return;
    }

    // Perbarui data akun yang tersimpan (password tetap tidak berubah)
    const accounts = getAccounts().map((a) =>
      a.email.toLowerCase() === currentUser.email.toLowerCase()
        ? { ...a, name, email: emailCheck.email, phone: phoneClean, address }
        : a,
    );
    saveAccounts(accounts);

    const updated = {
      ...currentUser,
      name,
      email: emailCheck.email,
      phone: phoneClean,
      address,
    };
    lsSet(LS_KEYS.USER, updated);
    lsSet(LS_KEYS.SESSION, emailCheck.email);

    renderProfile();
    updateNavUser();
    closeModal("modalEditProfile");
    showToast("Data profil berhasil disimpan.", "success", "✅");
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

  // Isi dropdown pilihan kota (Semua Kota + tiap kota yang ada di data kurasi)
  const citySelect = document.getElementById("placesCitySelect");
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
  // Jika sudah pernah deteksi lokasi sebelumnya, muat ulang tempat sekitar (kurasi seluruh kota + live API).
  // Jika belum, tampilkan dulu data kurasi seluruh kota sebagai rekomendasi awal.
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
