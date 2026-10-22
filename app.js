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
  getDocs
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const UPA_ID = "UPA_TEST_001";
const $ = id => document.getElementById(id);

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
    return "Akses ditolak oleh Firestore Rules. Periksa UID, jalur dokumen, dan Rules.";
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

  say(
    "accountStatus",
    `Login sebagai: ${user.email || "(email tidak tersedia)"}\n` +
    `UID: ${user.uid}\n` +
    "Memeriksa profil admin…"
  );

  const snap = await getDoc(
    doc(db, "upas", UPA_ID, "users", user.uid)
  );

  if (!snap.exists()) {
    say(
      "accountStatus",
      `Profil admin tidak ditemukan.\n` +
      `Jalur: upas/${UPA_ID}/users/${user.uid}`
    );
    return;
  }

  const p = snap.data();

  if (
    p.role !== "admin_upa" ||
    p.upaId !== UPA_ID ||
    p.aktif !== true
  ) {
    say(
      "accountStatus",
      `Profil ditemukan, tetapi peran/status tidak cocok.\n` +
      `role: ${p.role}\n` +
      `upaId: ${p.upaId}\n` +
      `aktif: ${p.aktif}`
    );
    return;
  }

  profileValid = true;

  say(
    "accountStatus",
    `Profil admin terverifikasi.\n` +
    `Email: ${user.email || "(email tidak tersedia)"}\n` +
    `UID: ${user.uid}\n` +
    `Peran: ${p.role}\n` +
    `UPA: ${p.upaId}\n` +
    `Aktif: ${p.aktif}`
  );
}

// LOGIN
$("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const btn = $("loginBtn");
  if (btn) btn.disabled = true;

  say("loginStatus", "Sedang masuk…");

  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );

    say("loginStatus", "Login berhasil. Memeriksa profil admin…");
  } catch (error) {
    say("loginStatus", errText(error));
  } finally {
    if (btn) btn.disabled = false;
  }
});

// PERIKSA PROFIL
$("refreshBtn")?.addEventListener("click", async () => {
  if (!auth.currentUser) {
    say("accountStatus", "Silakan login terlebih dahulu.");
    return;
  }

  try {
    await checkProfile(auth.currentUser);

    say(
      "dataStatus",
      profileValid
        ? "Profil lolos pemeriksaan."
        : "Profil belum lolos pemeriksaan."
    );
  } catch (error) {
    say("accountStatus", errText(error));
  }
});

// UJI BACA DATA UPA DAN BINAAN
$("loadBtn")?.addEventListener("click", async () => {
  const btn = $("loadBtn");
  if (btn) btn.disabled = true;

  show($("upaResult"), false);
  show($("binaanResult"), false);

  say("dataStatus", "Menguji pembacaan data UPA dan binaan…");

  try {
    if (!auth.currentUser) {
      throw new Error("Anda belum login.");
    }

    await checkProfile(auth.currentUser);

    if (!profileValid) {
      throw new Error("Profil admin belum lolos pemeriksaan.");
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

      return (
        `${v.nama ?? "(tanpa nama)"} — ID: ${d.id} — ` +
        `aktif: ${v.aktif ?? "(tidak ada)"}`
      );
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
    if (btn) btn.disabled = false;
  }
});

// UJI BACA MUTABAAH DAN COCOKKAN NAMA BINAAN
$("mutabaahBtn")?.addEventListener("click", async () => {
  const button = $("mutabaahBtn");
  if (button) button.disabled = true;

  show($("mutabaahResult"), false);
  say("dataStatus", "Membaca Mutabaah dan mencocokkan nama binaan…");

  try {
    if (!auth.currentUser) {
      throw new Error("Anda belum login.");
    }

    await checkProfile(auth.currentUser);

    if (!profileValid) {
      throw new Error("Profil admin belum lolos pemeriksaan.");
    }

    const mutabaahSnap = await getDocs(
      collection(db, "upas", UPA_ID, "mutabaah")
    );

    if (mutabaahSnap.empty) {
      say(
        "mutabaahResult",
        "Pembacaan berhasil, tetapi belum ada dokumen Mutabaah."
      );

      show($("mutabaahResult"), true);
      say("dataStatus", "Koleksi Mutabaah berhasil dibaca dan masih kosong.");
      return;
    }

    const records = await Promise.all(
      mutabaahSnap.docs.map(async d => {
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
              const binaan = binaanSnap.data();
              namaBinaan = binaan.nama ?? "(nama tidak tersedia)";
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
    if (button) button.disabled = false;
  }
});

// KELUAR
$("logoutBtn")?.addEventListener("click", async () => {
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
