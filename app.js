
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const UPA_ID = "UPA_TEST_001";
const $ = id => document.getElementById(id);

let currentProfile = null;
let profileValid = false;
let loadingProfile = false;

function show(el, visible) {
  if (el) el.classList.toggle("hidden", !visible);
}

function say(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

function errText(error) {
  const code = error?.code || "";

  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  ) {
    return "Email atau kata sandi salah.";
  }

  if (code === "auth/too-many-requests") {
    return "Terlalu banyak percobaan login. Coba lagi nanti.";
  }

  if (
    code === "permission-denied" ||
    code === "firestore/permission-denied"
  ) {
    return "Akses ditolak Firestore Rules. Periksa izin akun dan jalur data.";
  }

  if (code === "auth/unauthorized-domain") {
    return "Domain aplikasi belum diizinkan di Firebase Authentication.";
  }

  if (code === "auth/network-request-failed") {
    return "Koneksi internet bermasalah.";
  }

  if (code === "auth/invalid-email") {
    return "Format email tidak valid.";
  }

  return `${error?.message || "Terjadi kesalahan."}${
    code ? ` (kode: ${code})` : ""
  }`;
}

function setBusy(id, busy) {
  const button = $(id);
  if (button) button.disabled = busy;
}

function hideResults() {
  show($("upaResult"), false);
  show($("binaanResult"), false);
  show($("mutabaahResult"), false);
}

function resetDashboard() {
  profileValid = false;
  currentProfile = null;

  show($("inputCard"), false);
  show($("mutabaahCard"), false);
  hideResults();

  say("saveStatus", "Formulir belum dikirim.");
  say("dataStatus", "Data belum diuji.");
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// MEMERIKSA PROFIL ADMIN ATAU PEMBINA
async function checkProfile(user) {
  profileValid = false;
  currentProfile = null;

  show($("inputCard"), false);
  show($("mutabaahCard"), false);

  say(
    "accountStatus",
    `Login sebagai: ${user.email || "(email tidak tersedia)"}\n` +
    `UID: ${user.uid}\nMemeriksa profil akun…`
  );

  const snap = await getDoc(
    doc(db, "upas", UPA_ID, "users", user.uid)
  );

  if (!snap.exists()) {
    say(
      "accountStatus",
      `Profil tidak ditemukan.\n` +
      `Jalur: upas/${UPA_ID}/users/${user.uid}`
    );
    return false;
  }

  const p = snap.data();

  if (
    p.upaId !== UPA_ID ||
    p.aktif !== true ||
    !["admin_upa", "pembina"].includes(p.role)
  ) {
    say(
      "accountStatus",
      `Profil ditemukan, tetapi peran/status tidak cocok.\n` +
      `Peran: ${p.role ?? "(kosong)"}\n` +
      `UPA: ${p.upaId ?? "(kosong)"}\n` +
      `Aktif: ${p.aktif ?? "(kosong)"}`
    );
    return false;
  }

  currentProfile = p;
  profileValid = true;

  if (p.role === "admin_upa") {
    show($("mutabaahCard"), true);
    show($("inputCard"), false);
  } else {
    show($("inputCard"), true);
    show($("mutabaahCard"), false);
  }

  say(
    "accountStatus",
    `Profil terverifikasi.\n` +
    `Email: ${user.email || "(email tidak tersedia)"}\n` +
    `UID: ${user.uid}\n` +
    `Peran: ${p.role}\n` +
    `UPA: ${p.upaId}\n` +
    `Aktif: ${p.aktif}`
  );

  return true;
}

// MEMUAT BINAAN SESUAI PERAN
async function loadBinaan() {
  const select = $("binaanSelect");
  if (!select) return;

  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Memuat binaan…";
  select.appendChild(placeholder);

  if (!auth.currentUser || !profileValid || !currentProfile) {
    select.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Login dan verifikasi akun terlebih dahulu";
    select.appendChild(option);
    return;
  }

  try {
    const binaanCollection = collection(db, "upas", UPA_ID, "binaan");
    let binaanQuery;

    if (currentProfile.role === "admin_upa") {
      binaanQuery = query(binaanCollection);
    } else {
      // Penugasan pembina memakai field pembinaUid pada dokumen binaan.
      binaanQuery = query(
        binaanCollection,
        where("pembinaUid", "==", auth.currentUser.uid)
      );
    }

    const snap = await getDocs(binaanQuery);

    select.replaceChildren();

    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Pilih binaan";
    select.appendChild(first);

    snap.forEach(d => {
      const data = d.data();

      if (data.aktif !== true) return;

      const option = document.createElement("option");
      option.value = d.id;
      option.textContent = data.nama || `Binaan ${d.id}`;
      select.appendChild(option);
    });

    if (select.options.length === 1) {
      first.textContent = "Belum ada binaan aktif yang ditugaskan";
      say(
        "saveStatus",
        "Tidak ada binaan aktif yang dapat dipilih. Periksa penugasan pembina."
      );
    } else {
      say("saveStatus", "Pilih binaan, lengkapi formulir, lalu simpan.");
    }
  } catch (error) {
    select.replaceChildren();

    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Gagal memuat binaan";
    select.appendChild(option);

    say("saveStatus", `Gagal memuat binaan: ${errText(error)}`);
  }
}

// LOGIN
$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  setBusy("loginBtn", true);
  say("loginStatus", "Sedang masuk…");

  try {
    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    if (!email || !password) {
      throw new Error("Masukkan email dan kata sandi.");
    }

    await signInWithEmailAndPassword(auth, email, password);
    say("loginStatus", "Login berhasil. Memeriksa profil akun…");
  } catch (error) {
    say("loginStatus", errText(error));
  } finally {
    setBusy("loginBtn", false);
  }
});

// PERIKSA PROFIL ULANG
$("refreshBtn")?.addEventListener("click", async () => {
  if (!auth.currentUser) {
    say("accountStatus", "Silakan login terlebih dahulu.");
    return;
  }

  setBusy("refreshBtn", true);

  try {
    const valid = await checkProfile(auth.currentUser);

    if (valid && currentProfile?.role === "pembina") {
      await loadBinaan();
    }

    say(
      "dataStatus",
      valid ? "Profil lolos pemeriksaan." : "Profil belum lolos pemeriksaan."
    );
  } catch (error) {
    say("accountStatus", errText(error));
  } finally {
    setBusy("refreshBtn", false);
  }
});

// UJI BACA DATA UPA DAN BINAAN — ADMIN
$("loadBtn")?.addEventListener("click", async () => {
  setBusy("loadBtn", true);
  show($("upaResult"), false);
  show($("binaanResult"), false);
  say("dataStatus", "Menguji pembacaan data UPA dan binaan…");

  try {
    if (!auth.currentUser) throw new Error("Anda belum login.");

    const valid = await checkProfile(auth.currentUser);
    if (!valid) throw new Error("Profil akun belum lolos pemeriksaan.");

    if (currentProfile.role !== "admin_upa") {
      throw new Error("Pengujian seluruh data UPA hanya untuk admin.");
    }

    const upaSnap = await getDoc(doc(db, "upas", UPA_ID));

    if (!upaSnap.exists()) {
      throw new Error("Dokumen UPA tidak ditemukan.");
    }

    const upa = upaSnap.data();

    say(
      "upaResult",
      `UPA berhasil dibaca\n` +
      `ID: ${UPA_ID}\n` +
      `Nama: ${upa.namaUPA ?? "(tidak ada)"}\n` +
      `Aktif: ${upa.aktif ?? "(tidak ada)"}`
    );
    show($("upaResult"), true);

    const binaanSnap = await getDocs(
      collection(db, "upas", UPA_ID, "binaan")
    );

    const names = binaanSnap.docs.map(d => {
      const v = d.data();
      return `${v.nama ?? "(tanpa nama)"} — ID: ${d.id} — aktif: ${v.aktif ?? "(tidak ada)"}`;
    });

    say(
      "binaanResult",
      `Daftar binaan (${names.length})\n` +
      (names.length ? names.join("\n") : "Belum ada dokumen binaan.")
    );
    show($("binaanResult"), true);

    say("dataStatus", "BERHASIL: data UPA dan binaan dapat dibaca.");
  } catch (error) {
    say("dataStatus", `Pengujian gagal: ${errText(error)}`);
  } finally {
    setBusy("loadBtn", false);
  }
});

// SIMPAN MUTABAAH
$("mutabaahForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  setBusy("saveMutabaahBtn", true);
  say("saveStatus", "Memvalidasi data sebelum disimpan…");

  try {
    if (!auth.currentUser) throw new Error("Anda belum login.");

    const valid = await checkProfile(auth.currentUser);
    if (!valid) throw new Error("Profil akun belum terverifikasi.");

    const binaanId = $("binaanSelect")?.value;
    const tanggal = $("tanggalInput")?.value;
    const jenis = $("jenisInput")?.value;
    const catatan = $("catatanInput")?.value.trim();
    const status = $("statusInput")?.value;

    if (!binaanId || !tanggal || !jenis || !catatan || !status) {
      throw new Error("Lengkapi semua kolom formulir.");
    }

    if (!["hafalan", "tilawah", "murajaah", "ibadah", "lainnya"].includes(jenis)) {
      throw new Error("Jenis Mutabaah tidak valid.");
    }

    if (!["selesai", "proses"].includes(status)) {
      throw new Error("Status kegiatan tidak valid.");
    }

    if (catatan.length > 2000) {
      throw new Error("Catatan terlalu panjang.");
    }

    // Verifikasi binaan masih ada dan aktif.
    const binaanSnap = await getDoc(
      doc(db, "upas", UPA_ID, "binaan", binaanId)
    );

    if (!binaanSnap.exists() || binaanSnap.data().aktif !== true) {
      throw new Error("Binaan tidak ditemukan atau tidak aktif.");
    }

    const binaan = binaanSnap.data();

    if (
      currentProfile.role === "pembina" &&
      binaan.pembinaUid !== auth.currentUser.uid
    ) {
      throw new Error("Binaan ini bukan penugasan Anda.");
    }

    const payload = {
      upaId: UPA_ID,
      binaanId,
      tanggal,
      jenis,
      catatan,
      status,
      dibuatOleh: auth.currentUser.uid,
      dibuatPada: serverTimestamp()
    };

    await addDoc(
      collection(db, "upas", UPA_ID, "mutabaah"),
      payload
    );

    say(
      "saveStatus",
      `BERHASIL: Mutabaah tersimpan.\n` +
      `Binaan: ${binaan.nama || binaanId}\n` +
      `Tanggal: ${tanggal}\n` +
      `Jenis: ${jenis}\n` +
      `Status: ${status}`
    );

    $("mutabaahForm").reset();

    const dateInput = $("tanggalInput");
    if (dateInput) dateInput.value = todayString();

    await loadBinaan();
  } catch (error) {
    say("saveStatus", `Gagal menyimpan Mutabaah: ${errText(error)}`);
  } finally {
    setBusy("saveMutabaahBtn", false);
  }
});

// UJI BACA MUTABAAH — ADMIN
$("mutabaahBtn")?.addEventListener("click", async () => {
  setBusy("mutabaahBtn", true);
  show($("mutabaahResult"), false);
  say("dataStatus", "Membaca Mutabaah dan mencocokkan nama binaan…");

  try {
    if (!auth.currentUser) throw new Error("Anda belum login.");

    const valid = await checkProfile(auth.currentUser);
    if (!valid) throw new Error("Profil akun belum terverifikasi.");

    if (currentProfile.role !== "admin_upa") {
      throw new Error("Pembacaan seluruh Mutabaah hanya untuk admin.");
    }

    const snap = await getDocs(
      collection(db, "upas", UPA_ID, "mutabaah")
    );

    if (snap.empty) {
      say("mutabaahResult", "Pembacaan berhasil, tetapi belum ada catatan Mutabaah.");
      show($("mutabaahResult"), true);
      say("dataStatus", "Koleksi Mutabaah berhasil dibaca dan masih kosong.");
      return;
    }

    const records = await Promise.all(
      snap.docs.map(async d => {
        const v = d.data();
        const binaanId = v.binaanId;

        let namaBinaan = "(tidak ditemukan)";
        let pencocokan = "Tidak ditemukan";

        if (binaanId) {
          try {
            const binaanSnap = await getDoc(
              doc(db, "upas", UPA_ID, "binaan", binaanId)
            );

            if (binaanSnap.exists()) {
              namaBinaan = binaanSnap.data().nama ?? "(nama tidak tersedia)";
              pencocokan = "Ditemukan";
            }
          } catch (error) {
            namaBinaan = "Gagal membaca data binaan";
            pencocokan = errText(error);
          }
        } else {
          namaBinaan = "(ID binaan tidak tersedia)";
        }

        return (
          `ID catatan: ${d.id}\n` +
          `ID binaan: ${binaanId ?? "(tidak ada)"}\n` +
          `Nama binaan: ${namaBinaan}\n` +
          `Pencocokan binaan: ${pencocokan}\n` +
          `Tanggal: ${v.tanggal ?? "(tidak ada)"}\n` +
          `Jenis: ${v.jenis ?? "(tidak ada)"}\n` +
          `Catatan: ${v.catatan ?? "(tidak ada)"}\n` +
          `Status: ${v.status ?? "(tidak ada)"}`
        );
      })
    );

    say(
      "mutabaahResult",
      `Daftar Mutabaah (${records.length} catatan)\n\n` +
      records.join("\n\n--------------------\n\n")
    );
    show($("mutabaahResult"), true);

    say(
      "dataStatus",
      `BERHASIL: ${records.length} catatan dibaca dan pencocokan binaan diperiksa.`
    );
  } catch (error) {
    say("dataStatus", `Uji baca Mutabaah gagal: ${errText(error)}`);
  } finally {
    setBusy("mutabaahBtn", false);
  }
});

// KELUAR
$("logoutBtn")?.addEventListener("click", async () => {
  setBusy("logoutBtn", true);

  try {
    await signOut(auth);
  } catch (error) {
    say("dataStatus", errText(error));
  } finally {
    setBusy("logoutBtn", false);
  }
});

// STATUS LOGIN
onAuthStateChanged(auth, async user => {
  show($("loginCard"), !user);
  show($("dashboard"), !!user);

  if (!user) {
    resetDashboard();
    say("loginStatus", "Belum masuk.");
    say("accountStatus", "Belum masuk.");
    say("dataStatus", "Data belum diuji.");
    return;
  }

  if (loadingProfile) return;
  loadingProfile = true;

  try {
    const valid = await checkProfile(user);

    if (valid && currentProfile?.role === "pembina") {
      await loadBinaan();
    }

    if (valid && currentProfile?.role === "admin_upa") {
      say("dataStatus", "Profil admin terverifikasi. Silakan pilih pengujian.");
    } else if (!valid) {
      say("dataStatus", "Profil belum lolos pemeriksaan.");
    }
  } catch (error) {
    profileValid = false;
    currentProfile = null;
    show($("inputCard"), false);
    show($("mutabaahCard"), false);
    say("accountStatus", `Gagal memeriksa profil: ${errText(error)}`);
  } finally {
    loadingProfile = false;
  }
});

// Isi tanggal awal formulir.
if ($("tanggalInput") && !$("tanggalInput").value) {
  $("tanggalInput").value = todayString();
}
