
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
  el.classList.toggle("hidden", !yes);
}

function say(id, text) {
  $(id).textContent = text;
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
    return "Domain aplikasi belum diizinkan di Firebase Authentication → Settings → Authorized domains.";
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
      `Login berhasil, tetapi profil admin tidak ditemukan.\n` +
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
      `Profil ditemukan, tetapi nilai peran/status tidak cocok.\n` +
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

    say(
      "loginStatus",
      "Login berhasil. Memeriksa profil admin…"
    );
  } catch (error) {
    say("loginStatus", errText(error));
  } finally {
    $("loginBtn").disabled = false;
  }
});

$("refreshBtn").addEventListener("click", async () => {
  if (!auth.currentUser) return;

  try {
    await checkProfile(auth.currentUser);

    say(
      "dataStatus",
      profileValid
        ? "Profil diperiksa ulang. Silakan pilih pengujian yang ingin dijalankan."
        : "Profil belum lolos pemeriksaan."
    );
  } catch (error) {
    say("accountStatus", errText(error));
  }
});

$("loadBtn").addEventListener("click", async () => {
  $("loadBtn").disabled = true;

  show($("upaResult"), false);
  show($("binaanResult"), false);

  say("dataStatus", "Sedang menguji pembacaan data UPA dan binaan…");

  try {
    if (!auth.currentUser) {
      throw new Error("Anda belum login.");
    }

    await checkProfile(auth.currentUser);

    if (!profileValid) {
      throw new Error(
        "Profil admin belum lolos pemeriksaan. Data tidak dibaca."
      );
    }

    const upaSnap = await getDoc(
      doc(db, "upas", UPA_ID)
    );

    if (!upaSnap.exists()) {
      throw new Error(
        "Dokumen UPA tidak ditemukan atau tidak dapat dibaca."
      );
    }

    const upa = upaSnap.data();

    $("upaResult").textContent =
      `UPA berhasil dibaca\n` +
      `ID: ${UPA_ID}\n` +
      `Nama: ${upa.namaUPA ?? "(tidak ada)"}\n` +
      `Aktif: ${upa.aktif ?? "(tidak ada)"}`;

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

    $("binaanResult").textContent =
      `Daftar binaan berhasil dibaca (${names.length})\n` +
      (
        names.length
          ? names.join("\n")
          : "Belum ada dokumen binaan."
      );

    show($("binaanResult"), true);

    say(
      "dataStatus",
      "BERHASIL: profil admin lolos pemeriksaan dan data UPA serta binaan dapat dibaca."
    );
  } catch (error) {
    say(
      "dataStatus",
      `Pengujian belum berhasil: ${errText(error)}`
    );
  } finally {
    $("loadBtn").disabled = false;
  }
});

// UJI BACA MUTABAAH — HANYA MEMBACA DATA
$("mutabaahBtn").addEventListener("click", async () => {
  const button = $("mutabaahBtn");

  button.disabled = true;
  show($("mutabaahResult"), false);

  say(
    "dataStatus",
    "Sedang menguji pembacaan data Mutabaah…"
  );

  try {
    if (!auth.currentUser) {
      throw new Error("Anda belum login.");
    }

    await checkProfile(auth.currentUser);

    if (!profileValid) {
      throw new Error(
        "Profil admin belum lolos pemeriksaan. Data Mutabaah tidak dibaca."
      );
    }

    const mutabaahSnap = await getDocs(
      collection(db, "upas", UPA_ID, "mutabaah")
    );

    if (mutabaahSnap.empty) {
      $("mutabaahResult").textContent =
        "Pembacaan berhasil, tetapi belum ada dokumen Mutabaah.";

      show($("mutabaahResult"), true);

      say(
        "dataStatus",
        "BERHASIL: koleksi Mutabaah dapat dibaca, tetapi masih kosong."
      );

      return;
    }

    const records = mutabaahSnap.docs.map(d => {
      const v = d.data();

      return (
        `ID catatan: ${d.id}\n` +
        `ID binaan: ${v.binaanId ?? "(tidak ada)"}\n` +
        `Tanggal: ${v.tanggal ?? "(tidak ada)"}\n` +
        `Jenis: ${v.jenis ?? "(tidak ada)"}\n` +
        `Catatan: ${v.catatan ?? "(tidak ada)"}\n` +
        `Status: ${v.status ?? "(tidak ada)"}`
      );
    });

    $("mutabaahResult").textContent =
      `Daftar Mutabaah berhasil dibaca (${records.length} catatan)\n\n` +
      records.join("\n\n--------------------\n\n");

    show($("mutabaahResult"), true);

    say(
      "dataStatus",
      `BERHASIL: profil admin terverifikasi dan ${records.length} catatan Mutabaah berhasil dibaca.`
    );
  } catch (error) {
    say(
      "dataStatus",
      `Uji baca Mutabaah belum berhasil: ${errText(error)}`
    );
  } finally {
    button.disabled = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    say("dataStatus", errText(error));
  }
});

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
    say(
      "accountStatus",
      `Gagal memeriksa profil: ${errText(error)}`
    );
  }
});
