import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, where, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const UPA_ID = "UPA_TEST_001";
const $ = id => document.getElementById(id);
let currentProfile = null;
let profileValid = false;
let loadingProfile = false;
let binaanCache = [];

function show(el, visible) { if (el) el.classList.toggle("hidden", !visible); }
function say(id, message, kind = "info") {
  const el = $(id); if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.remove("status-success", "status-error", "status-info");
  el.classList.add(kind === "success" ? "status-success" : kind === "error" ? "status-error" : "status-info");
}
function errText(error) {
  const code = error?.code || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) return "Email atau kata sandi salah.";
  if (code === "auth/too-many-requests") return "Terlalu banyak percobaan login. Coba lagi nanti.";
  if (code.includes("permission-denied")) return "Akses ditolak Firestore Rules. Periksa profil, penugasan binaan, dan izin data.";
  if (code === "auth/unauthorized-domain") return "Domain aplikasi belum diizinkan di Firebase Authentication.";
  if (code === "auth/network-request-failed") return "Koneksi internet bermasalah.";
  if (code === "auth/invalid-email") return "Format email tidak valid.";
  if (code === "failed-precondition") return "Operasi gagal karena prasyarat Firestore belum terpenuhi.";
  return `${error?.message || "Terjadi kesalahan."}${code ? ` (kode: ${code})` : ""}`;
}
function setBusy(id, busy) { const b = $(id); if (b) b.disabled = busy; }
function todayString() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`; }
function hideResults() { show($("upaResult"), false); show($("binaanResult"), false); show($("mutabaahResult"), false); }
function resetDashboard() {
  profileValid = false; currentProfile = null; binaanCache = [];
  show($("inputCard"), false); show($("mutabaahCard"), false); show($("toolsCard"), false); hideResults();
  say("saveStatus", "Formulir belum dikirim."); say("dataStatus", "Data belum diuji.");
}

async function checkProfile(user) {
  profileValid = false; currentProfile = null;
  show($("inputCard"), false); show($("mutabaahCard"), false); show($("toolsCard"), false);
  say("accountStatus", `Login sebagai: ${user.email || "(email tidak tersedia)"}\nUID: ${user.uid}\nMemeriksa profil akun…`);
  const snap = await getDoc(doc(db, "upas", UPA_ID, "users", user.uid));
  if (!snap.exists()) { say("accountStatus", `Profil tidak ditemukan.\nJalur: upas/${UPA_ID}/users/${user.uid}`, "error"); return false; }
  const p = snap.data();
  if (p.upaId !== UPA_ID || p.aktif !== true || !["admin_upa", "pembina"].includes(p.role)) {
    say("accountStatus", `Profil ditemukan, tetapi peran/status tidak cocok.\nPeran: ${p.role ?? "(kosong)"}\nUPA: ${p.upaId ?? "(kosong)"}\nAktif: ${p.aktif ?? "(kosong)"}`, "error"); return false;
  }
  currentProfile = p; profileValid = true;
  show($("toolsCard"), true);
  show($("mutabaahCard"), p.role === "admin_upa");
  show($("inputCard"), p.role === "pembina");
  say("accountStatus", `Profil terverifikasi.\nEmail: ${user.email || "(email tidak tersedia)"}\nUID: ${user.uid}\nPeran: ${p.role}\nUPA: ${p.upaId}\nAktif: ${p.aktif}`, "success");
  return true;
}

async function loadBinaan() {
  const select = $("binaanSelect"); if (!select) return;
  select.replaceChildren();
  if (!auth.currentUser || !profileValid || !currentProfile) {
    select.add(new Option("Login dan verifikasi akun terlebih dahulu", "")); return;
  }
  try {
    say("saveStatus", "Memuat daftar binaan…");
    const ref = collection(db, "upas", UPA_ID, "binaan");
    const q = currentProfile.role === "admin_upa" ? query(ref) : query(ref, where("pembinaUid", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    binaanCache = snap.docs.filter(d => d.data().aktif === true).map(d => ({ id: d.id, nama: d.data().nama || d.data().namaBinaan || `Binaan ${d.id}`, ...d.data() }));
    select.add(new Option("Pilih binaan", ""));
    binaanCache.forEach(b => select.add(new Option(b.nama, b.id)));
    if (!binaanCache.length) {
      select.options[0].textContent = "Belum ada binaan aktif yang ditugaskan";
      say("saveStatus", "Tidak ada binaan aktif yang dapat dipilih. Periksa status aktif dan penugasan pembina.", "error");
    } else say("saveStatus", "Pilih binaan, lengkapi formulir, lalu simpan.");
  } catch (e) { select.replaceChildren(new Option("Gagal memuat binaan", "")); say("saveStatus", `Gagal memuat binaan: ${errText(e)}`, "error"); }
}

async function getAccessibleRecords() {
  if (!auth.currentUser || !profileValid || !currentProfile) throw new Error("Login dan verifikasi profil terlebih dahulu.");
  const records = [];
  if (currentProfile.role === "admin_upa") {
    const snap = await getDocs(collection(db, "upas", UPA_ID, "mutabaah"));
    snap.forEach(d => records.push({ id: d.id, ...d.data() }));
  } else {
    // Query terpisah per binaan milik pembina agar query sesuai Firestore Rules.
    const ref = collection(db, "upas", UPA_ID, "binaan");
    const bs = await getDocs(query(ref, where("pembinaUid", "==", auth.currentUser.uid)));
    for (const b of bs.docs) {
      if (b.data().aktif !== true) continue;
      const ms = await getDocs(query(collection(db, "upas", UPA_ID, "mutabaah"), where("binaanId", "==", b.id)));
      ms.forEach(d => records.push({ id: d.id, ...d.data() }));
    }
  }
  const names = new Map();
  const bsnap = currentProfile.role === "admin_upa"
    ? await getDocs(collection(db, "upas", UPA_ID, "binaan"))
    : await getDocs(query(collection(db, "upas", UPA_ID, "binaan"), where("pembinaUid", "==", auth.currentUser.uid)));
  bsnap.forEach(d => names.set(d.id, d.data().nama || d.data().namaBinaan || `Binaan ${d.id}`));
  return records.map(r => ({
    idCatatan: r.id,
    binaanId: r.binaanId || "",
    namaBinaan: names.get(r.binaanId) || "(nama binaan tidak ditemukan)",
    tanggal: r.tanggal || "",
    jenis: r.jenis || "",
    catatan: r.catatan || "",
    status: r.status || "",
    pencatatUid: r.pencatatUid || ""
  })).sort((a,b) => String(b.tanggal).localeCompare(String(a.tanggal)));
}
function fingerprint(r) { return [r.binaanId, r.tanggal, r.jenis, r.catatan, r.status].map(v => String(v ?? "").trim()).join("¦"); }
async function loadXlsx() { return await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm"); }
function filteredRecords(records) {
  const start = $("filterStart")?.value || ""; const end = $("filterEnd")?.value || ""; const binaan = $("filterBinaan")?.value || "";
  return records.filter(r => (!start || r.tanggal >= start) && (!end || r.tanggal <= end) && (!binaan || r.binaanId === binaan));
}
function updateFilterBinaan() {
  const s = $("filterBinaan"); if (!s) return;
  const old = s.value; s.replaceChildren(new Option("Semua binaan yang dapat diakses", ""));
  binaanCache.forEach(b => s.add(new Option(b.nama, b.id)));
  if ([...s.options].some(o => o.value === old)) s.value = old;
}

$("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault(); setBusy("loginBtn", true); say("loginStatus", "Sedang masuk…");
  try {
    const email = $("email")?.value.trim(); const password = $("password")?.value;
    if (!email || !password) throw new Error("Masukkan email dan kata sandi.");
    await signInWithEmailAndPassword(auth, email, password); say("loginStatus", "Login berhasil. Memeriksa profil akun…", "success");
  } catch (error) { say("loginStatus", errText(error), "error"); }
  finally { setBusy("loginBtn", false); }
});

$("refreshBtn")?.addEventListener("click", async () => {
  if (!auth.currentUser) { say("accountStatus", "Silakan login terlebih dahulu.", "error"); return; }
  setBusy("refreshBtn", true);
  try { const valid = await checkProfile(auth.currentUser); if (valid) { await loadBinaan(); updateFilterBinaan(); } say("dataStatus", valid ? "Profil berhasil diverifikasi." : "Profil belum lolos pemeriksaan.", valid ? "success" : "error"); }
  catch (e) { say("accountStatus", `Gagal memeriksa profil: ${errText(e)}`, "error"); }
  finally { setBusy("refreshBtn", false); }
});

$("loadBtn")?.addEventListener("click", async () => {
  setBusy("loadBtn", true); show($("upaResult"), false); show($("binaanResult"), false); say("dataStatus", "Menguji pembacaan data UPA dan binaan…");
  try {
    if (!auth.currentUser) throw new Error("Anda belum login.");
    if (!await checkProfile(auth.currentUser)) throw new Error("Profil akun belum lolos pemeriksaan.");
    if (currentProfile.role !== "admin_upa") throw new Error("Pengujian seluruh data UPA hanya untuk admin.");
    const upaSnap = await getDoc(doc(db, "upas", UPA_ID)); if (!upaSnap.exists()) throw new Error("Dokumen UPA tidak ditemukan.");
    const upa = upaSnap.data(); $("upaResult").textContent = `UPA berhasil dibaca\nID: ${UPA_ID}\nNama: ${upa.namaUPA ?? "(tidak ada)"}\nAktif: ${upa.aktif ?? "(tidak ada)"}`; show($("upaResult"), true);
    const bs = await getDocs(collection(db, "upas", UPA_ID, "binaan")); const lines = bs.docs.map(d => { const v=d.data(); return `${v.nama || v.namaBinaan || "(tanpa nama)"} — ID: ${d.id} — aktif: ${v.aktif ?? "(tidak ada)"}`; });
    $("binaanResult").textContent = `Daftar binaan (${lines.length})\n${lines.join("\n") || "Belum ada dokumen binaan."}`; show($("binaanResult"), true); say("dataStatus", "BERHASIL: data UPA dan binaan dapat dibaca.", "success");
  } catch (e) { say("dataStatus", `Pengujian gagal: ${errText(e)}`, "error"); } finally { setBusy("loadBtn", false); }
});

$("mutabaahForm")?.addEventListener("submit", async e => {
  e.preventDefault(); setBusy("saveMutabaahBtn", true); say("saveStatus", "Memvalidasi data sebelum disimpan…");
  try {
    if (!auth.currentUser) throw new Error("Anda belum login.");
    if (!await checkProfile(auth.currentUser)) throw new Error("Profil akun belum terverifikasi.");
    const binaanId = $("binaanSelect")?.value; const tanggal = $("tanggalInput")?.value; const jenis = $("jenisInput")?.value; const catatan = $("catatanInput")?.value.trim(); const status = $("statusInput")?.value;
    if (!binaanId || !tanggal || !jenis || !catatan || !status) throw new Error("Lengkapi semua kolom formulir.");
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(tanggal)) throw new Error("Format tanggal tidak valid.");
    if (!["hafalan","tilawah","murajaah","ibadah","lainnya"].includes(jenis)) throw new Error("Jenis Mutabaah tidak valid.");
    if (!["selesai","proses"].includes(status)) throw new Error("Status kegiatan tidak valid.");
    if (catatan.length > 2000) throw new Error("Catatan terlalu panjang.");
    const bs = await getDoc(doc(db,"upas",UPA_ID,"binaan",binaanId)); if (!bs.exists()) throw new Error("Dokumen binaan tidak ditemukan.");
    const b = bs.data(); if (b.aktif !== true) throw new Error("Binaan tidak aktif.");
    if (currentProfile.role === "pembina" && b.pembinaUid !== auth.currentUser.uid) throw new Error("Binaan ini bukan penugasan Anda.");
    await addDoc(collection(db,"upas",UPA_ID,"mutabaah"), { binaanId, tanggal, jenis, catatan, pencatatUid: auth.currentUser.uid, status, dibuatPada: serverTimestamp() });
    say("saveStatus", `✓ SIMPAN DATA BERHASIL\nBinaan: ${b.nama || b.namaBinaan || binaanId}\nTanggal: ${tanggal}\nJenis: ${jenis}\nStatus: ${status}`, "success");
    $("mutabaahForm").reset(); if ($("tanggalInput")) $("tanggalInput").value = todayString(); await loadBinaan(); updateFilterBinaan();
  } catch (e) { say("saveStatus", `✕ SIMPAN DATA GAGAL\n${errText(e)}`, "error"); if (e?.code) say("dataStatus", `Kode error: ${e.code}\n${e.message || ""}`, "error"); }
  finally { setBusy("saveMutabaahBtn", false); }
});

$("mutabaahBtn")?.addEventListener("click", async () => {
  setBusy("mutabaahBtn", true); show($("mutabaahResult"), false); say("dataStatus", "Membaca Mutabaah…");
  try {
    if (!auth.currentUser || !await checkProfile(auth.currentUser)) throw new Error("Login atau profil belum valid.");
    if (currentProfile.role !== "admin_upa") throw new Error("Pembacaan seluruh Mutabaah hanya untuk admin.");
    const rows = await getAccessibleRecords();
    $("mutabaahResult").textContent = rows.length ? `Daftar Mutabaah (${rows.length} catatan)\n\n` + rows.map(r => `Binaan: ${r.namaBinaan}\nTanggal: ${r.tanggal}\nJenis: ${r.jenis}\nCatatan: ${r.catatan}\nStatus: ${r.status}\nPencatat UID: ${r.pencatatUid}`).join("\n\n--------------------\n\n") : "Pembacaan berhasil, tetapi belum ada catatan Mutabaah.";
    show($("mutabaahResult"), true); say("dataStatus", `BERHASIL: ${rows.length} catatan Mutabaah dibaca.`, "success");
  } catch (e) { say("dataStatus", `Uji baca Mutabaah gagal: ${errText(e)}`, "error"); }
  finally { setBusy("mutabaahBtn", false); }
});

$("exportBtn")?.addEventListener("click", async () => {
  setBusy("exportBtn", true); say("fileStatus", "Sedang menyiapkan file Excel…");
  try {
    const records = filteredRecords(await getAccessibleRecords());
    if (!records.length) throw new Error("Tidak ada data pada filter yang dipilih. Ubah periode atau binaan.");
    const XLSX = await loadXlsx();
    const data = records.map(r => ({ "ID Catatan": r.idCatatan, "ID Binaan": r.binaanId, "Nama Binaan": r.namaBinaan, "Tanggal": r.tanggal, "Jenis": r.jenis, "Catatan": r.catatan, "Status": r.status, "Pencatat UID": r.pencatatUid }));
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(data); ws["!cols"] = [{wch:24},{wch:18},{wch:26},{wch:14},{wch:16},{wch:48},{wch:14},{wch:32}];
    XLSX.utils.book_append_sheet(wb, ws, "Mutabaah");
    const stamp = todayString(); XLSX.writeFile(wb, `Mutabaah_UPA_${stamp}.xlsx`);
    say("fileStatus", `✓ EKSPOR EXCEL BERHASIL\nJumlah data: ${records.length}\nFile: Mutabaah_UPA_${stamp}.xlsx`, "success");
  } catch (e) { say("fileStatus", `✕ EKSPOR GAGAL\n${errText(e)}`, "error"); }
  finally { setBusy("exportBtn", false); }
});

$("importBtn")?.addEventListener("click", async () => {
  const file = $("importFile")?.files?.[0];
  if (!file) { say("fileStatus", "Pilih file Excel (.xlsx atau .xls) terlebih dahulu.", "error"); return; }
  setBusy("importBtn", true); say("fileStatus", "Membaca dan memvalidasi file Excel…");
  try {
    if (!auth.currentUser || !profileValid || !currentProfile) throw new Error("Login dan verifikasi profil terlebih dahulu.");
    const XLSX = await loadXlsx(); const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: "array" });
    const first = wb.SheetNames[0]; if (!first) throw new Error("File Excel tidak memiliki lembar kerja.");
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: "", raw: false });
    if (!rows.length) throw new Error("Lembar Excel kosong.");
    const key = s => String(s ?? "").trim().toLowerCase().replace(/[ _-]+/g, "");
    const normalize = row => { const out={}; for (const [k,v] of Object.entries(row)) out[key(k)] = v; return {
      binaanId: String(out.binaanid || out.idbinaan || "").trim(),
      tanggal: String(out.tanggal || "").trim().slice(0,10),
      jenis: String(out.jenis || out.jenismutabaah || "").trim().toLowerCase(),
      catatan: String(out.catatan || out.catatanperkembangan || "").trim(),
      status: String(out.status || "").trim().toLowerCase()
    }; };
    const normalized = rows.map(normalize); const errors=[]; const valid=[];
    const allowedBinaan = new Map();
    const bref = collection(db,"upas",UPA_ID,"binaan");
    const bquery = currentProfile.role === "admin_upa" ? query(bref) : query(bref, where("pembinaUid","==",auth.currentUser.uid));
    const bsn = await getDocs(bquery);
    bsn.forEach(d => { if (d.data().aktif === true && (currentProfile.role === "admin_upa" || d.data().pembinaUid === auth.currentUser.uid)) allowedBinaan.set(d.id, d.data()); });
    normalized.forEach((r,i) => {
      const line = i+2; const issues=[];
      if (!r.binaanId || !allowedBinaan.has(r.binaanId)) issues.push("ID binaan tidak valid atau bukan penugasan akun ini");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.tanggal)) issues.push("tanggal harus YYYY-MM-DD");
      if (!["hafalan","tilawah","murajaah","ibadah","lainnya"].includes(r.jenis)) issues.push("jenis tidak valid");
      if (!r.catatan || r.catatan.length > 2000) issues.push("catatan kosong atau lebih dari 2000 karakter");
      if (!["selesai","proses"].includes(r.status)) issues.push("status harus selesai atau proses");
      if (issues.length) errors.push(`Baris ${line}: ${issues.join("; ")}`); else valid.push(r);
    });
    if (!valid.length) throw new Error(`Tidak ada baris valid. ${errors.slice(0,8).join(" | ")}`);
    const existing = await getAccessibleRecords(); const seen = new Set(existing.map(fingerprint));
    const unique=[]; let duplicateCount=0;
    for (const r of valid) { const fp=fingerprint(r); if (seen.has(fp)) { duplicateCount++; continue; } seen.add(fp); unique.push(r); }
    if (!unique.length) throw new Error(`Tidak ada data baru untuk diimpor. ${duplicateCount} baris terdeteksi sebagai duplikat.`);
    const confirmText = `Pratinjau impor:\nBaris Excel: ${rows.length}\nValid: ${valid.length}\nDuplikat dilewati: ${duplicateCount}\nBermasalah: ${errors.length}\nAkan ditambahkan: ${unique.length}\n\nLanjutkan menyimpan ${unique.length} data ke Firestore?`;
    if (!window.confirm(confirmText)) { say("fileStatus", "Impor dibatalkan. Tidak ada data baru yang ditambahkan."); return; }
    let added=0; const failures=[];
    for (const r of unique) {
      try {
        const b = allowedBinaan.get(r.binaanId);
        await addDoc(collection(db,"upas",UPA_ID,"mutabaah"), { binaanId:r.binaanId, tanggal:r.tanggal, jenis:r.jenis, catatan:r.catatan, pencatatUid:auth.currentUser.uid, status:r.status, dibuatPada:serverTimestamp() });
        added++;
      } catch (e) { failures.push(`${r.binaanId} / ${r.tanggal}: ${errText(e)}`); }
    }
    let message = `HASIL IMPOR EXCEL\nBerhasil ditambahkan: ${added}\nDuplikat dilewati: ${duplicateCount}\nBaris tidak valid: ${errors.length}\nGagal disimpan: ${failures.length}`;
    if (errors.length) message += `\n\nContoh baris bermasalah:\n${errors.slice(0,5).join("\n")}`;
    if (failures.length) message += `\n\nContoh gagal simpan:\n${failures.slice(0,3).join("\n")}`;
    say("fileStatus", message, added && !failures.length ? "success" : "error");
    await loadBinaan(); updateFilterBinaan();
  } catch (e) { say("fileStatus", `✕ IMPOR GAGAL\n${errText(e)}`, "error"); }
  finally { setBusy("importBtn", false); }
});

$("logoutBtn")?.addEventListener("click", async () => {
  setBusy("logoutBtn", true); try { await signOut(auth); say("loginStatus", "Anda berhasil keluar.", "success"); }
  catch (e) { say("dataStatus", `Gagal keluar: ${errText(e)}`, "error"); } finally { setBusy("logoutBtn", false); }
});

onAuthStateChanged(auth, async user => {
  show($("loginCard"), !user); show($("dashboard"), !!user);
  if (!user) { resetDashboard(); say("loginStatus", "Belum masuk."); say("accountStatus", "Belum masuk."); say("dataStatus", "Data belum diuji."); say("fileStatus", "Silakan login untuk menggunakan impor dan ekspor."); return; }
  if (loadingProfile) return; loadingProfile = true;
  try {
    const valid = await checkProfile(user);
    if (valid) { await loadBinaan(); updateFilterBinaan(); say("dataStatus", `Profil ${currentProfile.role} terverifikasi.`, "success"); }
    else say("dataStatus", "Profil belum lolos pemeriksaan.", "error");
  } catch (e) { profileValid=false; currentProfile=null; show($("inputCard"),false); show($("mutabaahCard"),false); show($("toolsCard"),false); say("accountStatus", `Gagal memeriksa profil: ${errText(e)}`, "error"); }
  finally { loadingProfile=false; }
});
if ($("tanggalInput") && !$ ("tanggalInput").value) $("tanggalInput").value = todayString();
