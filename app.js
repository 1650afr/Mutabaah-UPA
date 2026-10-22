
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
    return "Akses ditolak oleh Firestore Rules.";
  }

  if (error.code === "auth/invalid-credential") {
    return "Email atau kata sandi salah.";
  }

  if (error.code === "auth/invalid-email") {
    return "Format email tidak valid.";
  }

  if (error.code === "auth/too-many-requests") {
    return "Terlalu banyak percobaan. Coba lagi nanti.";
  }

  return error.message || "Terjadi kesalahan.";
}

// ================================
// LOGIN
// ================================

$("loginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;
  const button = $("loginBtn");

  button.disabled = true;
  showStatus("loginStatus", "Sedang masuk...");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showStatus("loginStatus", "Login berhasil.");
  } catch (error) {
    showStatus(
      "loginStatus",
      "Login gagal: " + errorMessage(error)
    );
  } finally {
    button.disabled = false;
  }
});

// ================================
// PEMERIKSAAN PROFIL
// ================================

async function checkProfile(user) {
  currentUser = user;
  currentProfile = null;
  binaanList = [];

  showElement("loginCard", false);
  showElement("dashboard", true);
  showElement("inputCard", false);
  showElement("mutabaahCard", false);

  showStatus("accountStatus", "Memeriksa profil akun...");
  showStatus("dataStatus", "Data belum diuji.");

  try {
    const profileRef = doc(
      db, "upas", UPA_ID, "users", user.uid
    );

    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      throw new Error("Profil akun belum terdaftar.");
    }

    const profile = profileSnap.data();

    if (
      profile.aktif !== true ||
      profile.upaId !== UPA_ID
    ) {
      throw new Error("Akun tidak aktif atau UPA tidak sesuai.");
    }

    if (!["admin_upa", "pembina"].includes(profile.role)) {
      throw new Error("Peran akun tidak dikenali.");
    }

    currentProfile = profile;

    showStatus(
      "accountStatus",
      "Login: " + (user.email || "-") +
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

// ================================
// MEMBACA BINAAN
// ================================

async function loadBinaan() {
  if (!currentUser || !currentProfile) return;

  showStatus("dataStatus", "Memuat daftar binaan...");

  try {
    const binaanRef = collection(
      db, "upas", UPA_ID, "binaan"
    );

    const binaanQuery =
      currentProfile.role === "pembina"
        ? query(
            binaanRef,
            where("pembinaUid", "==", currentUser.uid)
          )
        : binaanRef;

    const snapshot = await getDocs(binaanQuery);

    binaanList = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    const select = $("binaanSelect");

    if (select) {
      select.replaceChildren();

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Pilih binaan --";
      select.appendChild(placeholder);

      binaanList
        .filter((binaan) => binaan.aktif !== false)
        .forEach((binaan) => {
          const option = document.createElement("option");
          option.value = binaan.id;
          option.textContent = binaan.nama || binaan.id;
          select.appendChild(option);
        });
    }

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

// ================================
// UJI BACA DATA UPA
// ================================

$("loadBtn")?.addEventListener("click", async () => {
  if (!currentUser || !currentProfile) return;

  const button = $("loadBtn");
  button.disabled = true;

  showStatus("dataStatus", "Menguji pembacaan data UPA...");

  try {
    const upaSnap = await getDoc(
      doc(db, "upas", UPA_ID)
    );

    if (!upaSnap.exists()) {
      showElement("upaResult", true);
      showStatus("upaResult", "Dokumen UPA tidak ditemukan.");
    } else {
      const upa = upaSnap.data();

      showElement("upaResult", true);
      showStatus(
        "upaResult",
        "Data UPA berhasil dibaca." +
        "\nNama: " + (upa.namaUPA || "-") +
        "\nID: " + UPA_ID
      );
    }

    await loadBinaan();

  } catch (error) {
    showStatus(
      "dataStatus",
      "Uji baca gagal: " + errorMessage(error)
    );
  } finally {
    button.disabled = false;
  }
});

// ================================
// PERIKSA PROFIL LAGI
// ================================

$("refreshBtn")?.addEventListener("click", async () => {
  if (auth.currentUser) {
    await checkProfile(auth.currentUser);
  }
});

// ================================
// SIMPAN CATATAN MUTABAAH
// ================================

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

  const binaan = binaanList.find(
    (item) => item.id === binaanId
  );

  if (!binaan || binaan.aktif === false) {
    showStatus("saveStatus", "Pilih binaan yang aktif.");
    return;
  }

  if (!tanggal || !jenis || !catatan || !status) {
    showStatus("saveStatus", "Lengkapi seluruh kolom.");
    return;
  }

  if (catatan.length > 2000) {
    showStatus("saveStatus", "Catatan maksimal 2.000 karakter.");
    return;
  }

  const button = $("saveMutabaahBtn");
  button.disabled = true;
  showStatus("saveStatus", "Menyimpan catatan...");

  try {
    const ref = await addDoc(
      collection(db, "upas", UPA_ID, "mutabaah"),
      {
        binaanId,
        tanggal,
        jenis,
        catatan,
        pencatatUid: currentUser.uid,
        status,
        dibuatPada: serverTimestamp()
      }
    );

    showStatus(
      "saveStatus",
      "Catatan berhasil disimpan.\nID catatan: " + ref.id
    );

    $("mutabaahForm").reset();

    if ($("tanggalInput")) {
      $("tanggalInput").value =
        new Date().toLocaleDateString("en-CA");
    }

  } catch (error) {
    showStatus(
      "saveStatus",
      "Gagal menyimpan: " + errorMessage(error)
    );
  } finally {
    button.disabled = false;
  }
});

// ================================
// BACA RIWAYAT MUTABAAH
// ================================

async function loadMutabaah() {
  showElement("mutabaahCard", true);
  showElement("mutabaahResult", true);

  const container = $("mutabaahResult");

  if (!currentUser || !currentProfile) {
    showStatus("mutabaahResult", "Silakan login terlebih dahulu.");
    return;
  }

  showStatus("mutabaahResult", "Sedang membaca data mutabaah...");

  const button = $("mutabaahBtn");
  if (button) button.disabled = true;

  try {
    const ref = collection(
      db, "upas", UPA_ID, "mutabaah"
    );

    let hasil = [];

    if (currentProfile.role === "admin_upa") {
      const snapshot = await getDocs(ref);

      hasil = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

    } else if (currentProfile.role === "pembina") {
      for (const binaan of binaanList) {
        const q = query(
          ref,
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
      String(b.tanggal || "").localeCompare(
        String(a.tanggal || "")
      )
    );

    container.replaceChildren();

    if (hasil.length === 0) {
      container.textContent =
        "Pembacaan berhasil, tetapi belum ada catatan mutabaah.";
      return;
    }

    const ringkasan = document.createElement("p");
    ringkasan.textContent =
      "Berhasil membaca " + hasil.length + " catatan mutabaah.";
    container.appendChild(ringkasan);

    hasil.forEach((item) => {
      const binaan = binaanList.find(
        (data) => data.id === item.binaanId
      );

      const card = document.createElement("div");
      card.className = "result";

      const heading = document.createElement("strong");
      heading.textContent =
        (binaan?.nama || item.binaanId || "Binaan") +
        " — " + (item.tanggal || "-");

      const detail = document.createElement("p");
      detail.style.whiteSpace = "pre-wrap";
      detail.textContent =
        "Jenis: " + (item.jenis || "-") +
        "\nStatus: " + (item.status || "-") +
        "\nCatatan: " + (item.catatan || "-");

      card.append(heading, detail);
      container.appendChild(card);
    });

  } catch (error) {
    showStatus(
      "mutabaahResult",
      "Gagal membaca mutabaah: " + errorMessage(error)
    );
  } finally {
    if (button) button.disabled = false;
  }
}

// PENTING: penghubung tombol riwayat.
// Baris ini harus berada di luar fungsi loadMutabaah().
$("mutabaahBtn")?.addEventListener("click", loadMutabaah);

// ================================
// KELUAR
// ================================

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    showStatus(
      "accountStatus",
      "Gagal keluar: " + errorMessage(error)
    );
  }
});

// ================================
// STATUS LOGIN
// ================================

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

// Tanggal awal formulir.
if ($("tanggalInput")) {
  $("tanggalInput").value =
    new Date().toLocaleDateString("en-CA");
}
