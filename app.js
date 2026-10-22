
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
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

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let binaanList = [];

function showStatus(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

function showElement(id, visible) {
  const el = $(id);
  if (el) el.classList.toggle("hidden", !visible);
}

function errorMessage(error) {
  console.error(error);

  if (error.code === "permission-denied") {
    return "Akses ditolak oleh Firestore Rules. Pastikan Rules sesuai dengan fitur yang diuji.";
  }

  if (error.code === "auth/invalid-credential") {
    return "Email atau kata sandi salah.";
  }

  if (error.code === "auth/invalid-email") {
    return "Format email tidak valid.";
  }

  if (error.code === "auth/too-many-requests") {
    return "Terlalu banyak percobaan login. Coba lagi nanti.";
  }

  return error.message || "Terjadi kesalahan.";
}

// LOGIN
$("loginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  $("loginBtn").disabled = true;
  showStatus("loginStatus", "Sedang masuk...");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showStatus("loginStatus", "Login berhasil.");
  } catch (error) {
    showStatus("loginStatus", "Login gagal: " + errorMessage(error));
  } finally {
    $("loginBtn").disabled = false;
  }
});

// MEMERIKSA PROFIL AKUN
async function checkProfile(user) {
  currentUser = user;

  showElement("loginCard", false);
  showElement("dashboard", true);
  showElement("inputCard", false);
  showElement("mutabaahCard", false);

  showStatus("accountStatus", "Memeriksa profil akun...");
  showStatus("dataStatus", "Data belum diuji.");

  currentProfile = null;
  binaanList = [];

  try {
    const profileRef = doc(
      db,
      "upas", UPA_ID,
      "users", user.uid
    );

    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      throw new Error("Profil akun belum terdaftar di Firestore.");
    }

    const profile = profileSnap.data();

    if (profile.aktif !== true || profile.upaId !== UPA_ID) {
      throw new Error("Akun tidak aktif atau UPA tidak sesuai.");
    }

    if (!["admin_upa", "pembina"].includes(profile.role)) {
      throw new Error("Peran akun tidak dikenali.");
    }

    currentProfile = profile;

    showStatus(
      "accountStatus",
      "Login: " + user.email +
      "\nPeran: " + profile.role +
      "\nUPA: " + UPA_ID +
      "\nStatus: Aktif"
    );

    showElement("inputCard", true);

    await loadBinaan();

  } catch (error) {
    showStatus(
      "accountStatus",
      "Pemeriksaan profil gagal: " + errorMessage(error)
    );

    showElement("inputCard", false);
  }
}

// MEMBACA DAFTAR BINAAN
async function loadBinaan() {
  if (!currentUser || !currentProfile) return;

  showStatus("dataStatus", "Memuat daftar binaan...");

  try {
    const binaanRef = collection(db, "upas", UPA_ID, "binaan");

    let binaanQuery;

    if (currentProfile.role === "pembina") {
      binaanQuery = query(
        binaanRef,
        where("pembinaUid", "==", currentUser.uid)
      );
    } else {
      binaanQuery = binaanRef;
    }

    const snapshot = await getDocs(binaanQuery);

    binaanList = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    const select = $("binaanSelect");
    select.innerHTML = '<option value="">-- Pilih binaan --</option>';

    binaanList.forEach((binaan) => {
      if (binaan.aktif === false) return;

      const option = document.createElement("option");
      option.value = binaan.id;
      option.textContent = binaan.nama || binaan.id;
      select.appendChild(option);
    });

    showStatus(
      "dataStatus",
      "Berhasil memuat " + binaanList.length + " data binaan."
    );

    if (binaanList.length === 0) {
      showStatus(
        "dataStatus",
        "Belum ada binaan yang dapat diakses akun ini."
      );
    }

  } catch (error) {
    showStatus(
      "dataStatus",
      "Gagal memuat binaan: " + errorMessage(error)
    );
  }
}

// TOMBOL UJI BACA DATA UPA
$("loadBtn")?.addEventListener("click", async () => {
  if (!currentUser || !currentProfile) return;

  showStatus("dataStatus", "Menguji pembacaan data UPA...");

  try {
    const upaRef = doc(db, "upas", UPA_ID);
    const upaSnap = await getDoc(upaRef);

    if (upaSnap.exists()) {
      const upa = upaSnap.data();

      showElement("upaResult", true);
      showStatus(
        "upaResult",
        "Data UPA berhasil dibaca.\nNama: " +
        (upa.namaUPA || "-") +
        "\nID: " + UPA_ID
      );
    } else {
      showElement("upaResult", true);
      showStatus("upaResult", "Dokumen UPA tidak ditemukan.");
    }

    await loadBinaan();

  } catch (error) {
    showStatus(
      "dataStatus",
      "Uji baca gagal: " + errorMessage(error)
    );
  }
});

// PERIKSA PROFIL LAGI
$("refreshBtn")?.addEventListener("click", async () => {
  if (auth.currentUser) {
    await checkProfile(auth.currentUser);
  }
});

// MENYIMPAN CATATAN MUTABAAH
$("mutabaahForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !currentProfile) {
    showStatus("saveStatus", "Silakan login terlebih dahulu.");
    return;
  }

  const binaanId = $("binaanSelect").value;
  const tanggal = $("tanggalInput").value;
  const jenis = $("jenisInput").value;
  const catatan = $("catatanInput").value.trim();
  const status = $("statusInput").value;

  const binaanDipilih = binaanList.find(
    (item) => item.id === binaanId
  );

  if (!binaanDipilih || binaanDipilih.aktif === false) {
    showStatus("saveStatus", "Pilih binaan yang aktif dan dapat diakses.");
    return;
  }

  if (!tanggal || !jenis || !catatan || !status) {
    showStatus("saveStatus", "Lengkapi seluruh kolom terlebih dahulu.");
    return;
  }

  if (catatan.length > 2000) {
    showStatus("saveStatus", "Catatan maksimal 2.000 karakter.");
    return;
  }

  const saveButton = $("saveMutabaahBtn");
  saveButton.disabled = true;
  showStatus("saveStatus", "Menyimpan catatan...");

  try {
    const mutabaahRef = collection(
      db, "upas", UPA_ID, "mutabaah"
    );

    const docRef = await addDoc(mutabaahRef, {
      binaanId,
      tanggal,
      jenis,
      catatan,
      pencatatUid: currentUser.uid,
      status,
      dibuatPada: serverTimestamp()
    });

    showStatus(
      "saveStatus",
      "Catatan berhasil disimpan.\nID catatan: " + docRef.id
    );

    $("mutabaahForm").reset();

    // Tanggal kembali ke hari ini.
    $("tanggalInput").value =
      new Date().toLocaleDateString("en-CA");

    await loadMutabaah();

  } catch (error) {
    showStatus(
      "saveStatus",
      "Catatan belum berhasil disimpan: " + errorMessage(error)
    );
  } finally {
    saveButton.disabled = false;
  }
});

// MEMBACA RIWAYAT MUTABAAH
async function loadMutabaah() {
  if (!currentUser || !currentProfile) return;

  showStatus("mutabaahResult", "Memuat riwayat mutabaah...");
  showElement("mutabaahCard", true);

  try {
    const mutabaahRef = collection(
      db, "upas", UPA_ID, "mutabaah"
    );

    let hasil = [];

    if (currentProfile.role === "admin_upa") {
      const snapshot = await getDocs(mutabaahRef);

      hasil = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));
    } else {
      for (const binaan of binaanList) {
        const q = query(
          mutabaahRef,
          where("binaanId", "==", binaan.id)
        );

        const snapshot = await getDocs(q);

        snapshot.docs.forEach((item) => {
          hasil.push({
            id: item.id,
            ...item.data()
          });
        });
      }
    }

    hasil.sort((a, b) =>
      String(b.tanggal || "").localeCompare(String(a.tanggal || ""))
    );

    const container = $("mutabaahResult");
    container.replaceChildren();

    if (hasil.length === 0) {
      container.textContent = "Belum ada catatan mutabaah.";
      return;
    }

    hasil.forEach((item) => {
      const binaan = binaanList.find(
        (data) => data.id === item.binaanId
      );

      const card = document.createElement("div");
      card.className = "result";

      const judul = document.createElement("strong");
      judul.textContent =
        (binaan?.nama || item.binaanId || "Binaan") +
        " — " + (item.tanggal || "-");

      const rincian = document.createElement("p");
      rincian.textContent =
        "Jenis: " + (item.jenis || "-") +
        "\nStatus: " + (item.status || "-") +
        "\nCatatan: " + (item.catatan || "-");

      rincian.style.whiteSpace = "pre-wrap";

      card.append(judul, rincian);
      container.appendChild(card);
    });

  } catch (error) {
    showStatus(
      "mutabaahResult",
      "Gagal membaca riwayat: " + errorMessage(error)
    );
  }
}

// TOMBOL RIWAYAT
$("mutabaahBtn")?.addEventListener("click", loadMutabaah);

// LOGOUT
$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    showStatus("accountStatus", "Gagal keluar: " + errorMessage(error));
  }
});

// PEMANTAUAN STATUS LOGIN
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await checkProfile(user);
  } else {
    currentUser = null;
    currentProfile = null;
    binaanList = [];

    showElement("loginCard", true);
    showElement("dashboard", false);
    showElement("inputCard", false);
    showElement("mutabaahCard", false);

    showStatus("loginStatus", "Silakan login.");
  }
});

// Tanggal awal pada formulir.
if ($("tanggalInput")) {
  $("tanggalInput").value = new Date().toLocaleDateString("en-CA");
}
