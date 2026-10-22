
async function loadMutabaah() {
  if (!currentUser || !currentProfile) {
    showStatus("mutabaahResult", "Silakan login terlebih dahulu.");
    showElement("mutabaahCard", true);
    showElement("mutabaahResult", true);
    return;
  }

  showElement("mutabaahCard", true);
  showElement("mutabaahResult", true);
  showStatus("mutabaahResult", "Sedang membaca data mutabaah...");

  const tombol = $("mutabaahBtn");
  if (tombol) tombol.disabled = true;

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
    } else if (currentProfile.role === "pembina") {
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
      String(b.tanggal || "").localeCompare(
        String(a.tanggal || "")
      )
    );

    const container = $("mutabaahResult");
    container.replaceChildren();

    if (hasil.length === 0) {
      container.textContent =
        "Pembacaan berhasil, tetapi belum ada catatan mutabaah.";
      return;
    }

    const judul = document.createElement("p");
    judul.textContent =
      "Berhasil membaca " + hasil.length + " catatan mutabaah.";
    container.appendChild(judul);

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

      const rincian = document.createElement("p");
      rincian.style.whiteSpace = "pre-wrap";
      rincian.textContent =
        "Jenis: " + (item.jenis || "-") +
        "\nStatus: " + (item.status || "-") +
        "\nCatatan: " + (item.catatan || "-");

      card.append(heading, rincian);
      container.appendChild(card);
    });

  } catch (error) {
    showStatus(
      "mutabaahResult",
      "Gagal membaca mutabaah: " + errorMessage(error)
    );
  } finally {
    if (tombol) tombol.disabled = false;
  }
}
