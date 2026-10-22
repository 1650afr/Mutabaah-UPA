
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
  where
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const UPA_ID = "UPA_TEST_001";
const $ = id => document.getElementById(id);

let currentProfile = null;
let profileValid = false;

function show(el, yes) {
  if (el) el.classList.toggle("hidden", !yes);
}

function say(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
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
    return "Terlalu banyak percobaan. Coba lagi nanti.";
  }

  if (
    code === "permission-denied" ||
    code === "firestore/permission-denied"
  ) {
    return "Akses ditolak oleh Firestore Rules. Periksa Rules dan izin akun.";
  }

  if (code === "auth/unauthorized-domain") {
    return "Domain aplikasi belum diizinkan di Firebase Authentication.";
  }

  if (code === "auth/network-request-failed") {
    return "Koneksi jaringan bermasalah.";
  }

  return `${error?.message || "Terjadi kesalahan."}${
    code ? ` (kode: ${code})` : ""
  }`;
}

async function checkProfile(user) {
  profileValid = false;
  currentProfile = null;

  say(
    "accountStatus",
    `Login sebagai: ${user.email || "(email tidak tersedia)"}\n` +
    `UID: ${user.uid}\nMemeriksa profil…`
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
    !["admin_upa", "pembina"].includes(p.role) ||
    p.upaId !== UPA_ID ||
    p.aktif !== true
  ) {
    say(
      "accountStatus",
      `Peran atau status profil tidak cocok.\n` +
      `role: ${p.role}\nupaId: ${p.upaId}\naktif: ${p.aktif}`
    );
    return false;
  }

  currentProfile = p;
  profileValid = true;

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

// LOGIN
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginBtn").disabled = true;
  say("loginStatus", "Sedang masuk…");

  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );

    say("loginStatus", "Login berhasil. Memeriksa profil…");
  } catch (error) {
    say("loginStatus", errText(error));
  } finally {
    $("loginBtn").disabled = false;
  }
});

// PERIKSA PROFIL
$("refreshBtn").addEventListener("click", async () => {
  if (!auth.currentUser) return;

  try {
    const valid = await checkProfile(auth.currentUser);

    say(
      "dataStatus",
      valid
        ? "Profil terverifikasi. Silakan jalankan pengujian."
        : "Profil belum lolos pemeriksaan."
    );
  } catch (error) {
    say("accountStatus", errText(error));
  }
});

// BACA UPA DAN BINAAN
$("loadBtn").addEventListener("click", async () => {
  const button = $("loadBtn");
  button.disabled = true;

  show($("upaResult"), false);
  show($("binaanResult"), false);
  say("dataStatus", "Sedang membaca data UPA dan binaan…");

  try {
    if (!auth.currentUser) {
      throw new Error("Anda belum login.");
    }

    const valid = await checkProfile(auth.currentUser);

    if (!valid || !currentProfile) {
      throw new Error("Profil belum terverifikasi.");
    }

    const isAdmin = currentProfile.role === "admin_upa";

    if (isAdmin) {
      const upaSnap = await getDoc(
        doc(db, "upas", UPA_ID)
      );

      if (!upaSnap.exists()) {
        throw new Error("Dokumen UPA tidak ditemukan.");
      }

      const upa = upaSnap.data();

      $("upaResult").textContent =
        `UPA berhasil dibaca\n` +
        `ID: ${UPA_ID}\n` +
        `Nama: ${upa.namaUPA ?? "(tidak ada)"}\n` +
        `Aktif: ${upa.aktif ?? "(tidak ada)"}`;
    } else {
      $("upaResult").textContent =
        "Pembina: pembacaan dokumen utama UPA tidak dilakukan.";
    }

    show($("upaResult"), true);

    const binaanRef = collection(
      db, "upas", UPA_ID, "binaan"
    );

    const binaanQuery = isAdmin
      ? binaanRef
      : query(
          binaanRef,
          where("pembinaUid", "==", auth.currentUser.uid)
        );

    const binaanSnap = await getDocs(binaanQuery);

    const names = binaanSnap.docs.map(d => {
      const v = d.data();

      return (
        `${v.nama ?? "(tanpa nama)"} — ID: ${d.id}\n` +
        `Aktif: ${v.aktif ?? "(tidak ada)"}\n` +
        `Pembina UID: ${v.pembinaUid ?? "(belum ditetapkan)"}`
      );
    });

    $("binaanResult").textContent =
      `Binaan berhasil dibaca (${names.length})\n\n` +
      (names.length ? names.join("\n\n") : "Belum ada binaan yang dapat ditampilkan.");

    show($("binaanResult"), true);

    say(
      "dataStatus",
      isAdmin
        ? "Pembacaan UPA dan binaan selesai."
        : "Pembacaan binaan terfilter berdasarkan pembinaUid."
    );
  } catch (error) {
    say("dataStatus", `Pengujian gagal: ${errText(error)}`);
  } finally {
    button.disabled = false;
  }
});

// BACA MUTABAAH DAN COCOKKAN BINAAN
$("mutabaahBtn").addEventListener("click", async () => {
  const button = $("mutabaahBtn");
  button.disabled = true;
  show($("mutabaahResult"), false);

  say("dataStatus", "Sedang membaca catatan Mutabaah…");

  try {
    if (!auth.currentUser) {
      throw new Error("Anda belum login.");
    }

    const valid = await checkProfile(auth.currentUser);

    if (!valid || !currentProfile) {
      throw new Error("Profil belum terverifikasi.");
    }

    const isAdmin = currentProfile.role === "admin_upa";
    const binaanRef = collection(db, "upas", UPA_ID, "binaan");

    // Admin membaca semua binaan; pembina hanya binaan tugasnya.
    const binaanQuery = isAdmin
      ? binaanRef
      : query(
          binaanRef,
          where("pembinaUid", "==", auth.currentUser.uid)
        );

    const binaanSnap = await getDocs(binaanQuery);

    const binaanMap = new Map(
      binaanSnap.docs.map(d => [
        d.id,
        d.data().nama ?? "(nama tidak tersedia)"
      ])
    );

    let mutabaahDocs = [];

    if (isAdmin) {
      const snap = await getDocs(
        collection(db, "upas", UPA_ID, "mutabaah")
      );
      mutabaahDocs = snap.docs;
    } else {
      // Pembina membaca catatan per binaan yang ditugaskan.
      const results = await Promise.all(
        [...binaanMap.keys()].map(binaanId =>
          getDocs(
            query(
              collection(db, "upas", UPA_ID, "mutabaah"),
              where("binaanId", "==", binaanId)
            )
          )
        )
      );

      const unique = new Map();

      results.forEach(snap => {
        snap.docs.forEach(d => unique.set(d.id, d));
      });

      mutabaahDocs = [...unique.values()];
    }

    if (mutabaahDocs.length === 0) {
      $("mutabaahResult").textContent =
        "Pembacaan berhasil, tetapi belum ada catatan Mutabaah yang dapat ditampilkan.";
      show($("mutabaahResult"), true);
      say("dataStatus", "Tidak ada catatan Mutabaah untuk ditampilkan.");
      return;
    }

    const records = mutabaahDocs.map(d => {
      const v = d.data();
      const binaanId = v.binaanId;
      const namaBinaan = binaanMap.get(binaanId) ?? "(binaan tidak ditemukan)";

      return (
        `ID catatan: ${d.id}\n` +
        `ID binaan: ${binaanId ?? "(tidak ada)"}\n` +
        `Nama binaan: ${namaBinaan}\n` +
        `Tanggal: ${v.tanggal ?? "(tidak ada)"}\n` +
        `Jenis: ${v.jenis ?? "(tidak ada)"}\n` +
        `Catatan: ${v.catatan ?? "(tidak ada)"}\n` +
        `Status: ${v.status ?? "(tidak ada)"}`
      );
    });

    $("mutabaahResult").textContent =
      `Mutabaah berhasil dibaca (${records.length} catatan)\n\n` +
      records.join("\n\n--------------------\n\n");

    show($("mutabaahResult"), true);

    say(
      "dataStatus",
      `Berhasil membaca ${records.length} catatan Mutabaah.`
    );
  } catch (error) {
    say("dataStatus", `Pembacaan Mutabaah gagal: ${errText(error)}`);
  } finally {
    button.disabled = false;
  }
});

// KELUAR
$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    say("dataStatus", errText(error));
  }
});

// STATUS LOGIN
onAuthStateChanged(auth, async user => {
  show($("loginCard"), !user);
  show($("dashboard"), !!user);

  if (!user) {
    profileValid = false;
    currentProfile = null;

    say("loginStatus", "Belum masuk.");
    say("accountStatus", "Belum masuk.");
    say("dataStatus", "Data belum diuji.");

    show($("upaResult"), false);
    show($("binaanResult"), false);
    show($("mutabaahResult"), false);
    return;
  }

  try {
    await checkProfile(user);
  } catch (error) {
    say("accountStatus", `Gagal memeriksa profil: ${errText(error)}`);
  }
});
