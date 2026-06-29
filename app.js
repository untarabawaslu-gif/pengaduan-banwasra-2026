// ============================================================
// BANWASRA UNTARA — app.js
// Frontend untuk GitHub Pages + Google Apps Script
// ============================================================

// ⚠️ WAJIB DIGANTI dengan URL Web App Google Apps Script Anda
// Format: https://script.google.com/macros/s/XXXX.../exec
const GAS_URL = "GANTI_DENGAN_URL_WEB_APP_ANDA";

// ============================================================
// INISIALISASI
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("[BANWASRA] app.js loaded ✓");

  // Saksi toggle
  document.querySelectorAll('input[name="adaSaksi"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const detail = document.getElementById("saksi-detail");
      if (detail) detail.hidden = radio.value !== "Ya";
    });
  });

  // KTM file preview
  const ktmInput = document.getElementById("ktmInput");
  if (ktmInput) {
    ktmInput.addEventListener("change", () => {
      updateFileList("ktm-list", ktmInput.files);
    });
  }

  // Bukti file preview
  const fileInput = document.getElementById("fileInput");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      updateFileList("file-list", fileInput.files);
      updateFileHint(fileInput.files);
    });
  }

  // Submit
  const form = document.getElementById("pengaduan-form");
  if (form) {
    form.addEventListener("submit", handleSubmit);
  } else {
    console.error("[BANWASRA] Form #pengaduan-form tidak ditemukan!");
  }

  // Tombol laporan baru
  const newReportBtn = document.getElementById("new-report-btn");
  if (newReportBtn) {
    newReportBtn.addEventListener("click", () => {
      document.getElementById("confirmation-section").hidden = true;
      document.getElementById("form-section").hidden = false;
      document.getElementById("pengaduan-form").reset();
      document.getElementById("ktm-list").innerHTML = "";
      document.getElementById("file-list").innerHTML = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
});

// ============================================================
// HANDLE SUBMIT
// ============================================================
async function handleSubmit(e) {
  e.preventDefault();
  console.log("[BANWASRA] Submit dipanggil");

  const form = e.target;
  const submitBtn = document.getElementById("submit-btn");
  const errorEl = document.getElementById("form-error");

  // Sembunyikan error lama
  errorEl.hidden = true;
  errorEl.textContent = "";

  // Validasi manual
  try {
    validasiForm(form);
  } catch (err) {
    tampilkanError(err.message);
    return;
  }

  // Tampilkan loading
  setLoading(true);

  try {
    // Kumpulkan semua data + konversi file ke base64
    const payload = await kumpulkanPayload(form);
    console.log("[BANWASRA] Payload siap, field:", Object.keys(payload).filter(k => !k.includes("Base64")));

    // Kirim ke GAS dengan timeout 45 detik
    const controller = new AbortController();
    const tid = setTimeout(() => {
      controller.abort();
      console.error("[BANWASRA] Timeout setelah 45 detik");
    }, 45000);

    let response;
    try {
      response = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(tid);
    }

    console.log("[BANWASRA] Response status:", response.status);
    const raw = await response.text();
    console.log("[BANWASRA] Response text:", raw.substring(0, 300));

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error("Server memberikan respons tidak valid. Cek koneksi dan coba lagi.");
    }

    if (result.success === true) {
      // Sukses — tampilkan halaman konfirmasi
      setLoading(false);
      document.getElementById("form-section").hidden = true;

      const confSection = document.getElementById("confirmation-section");
      confSection.hidden = false;
      document.getElementById("report-id").textContent = result.reportId || "—";
      document.getElementById("report-time").textContent = new Date().toLocaleString("id-ID", {
        dateStyle: "long", timeStyle: "short"
      });
      confSection.scrollIntoView({ behavior: "smooth" });
      console.log("[BANWASRA] Sukses! ID:", result.reportId);
    } else {
      throw new Error(result.message || "Terjadi kesalahan saat menyimpan laporan.");
    }

  } catch (err) {
    setLoading(false);
    console.error("[BANWASRA] Error:", err.message);

    let pesan;
    if (err.name === "AbortError") {
      pesan = "Koneksi timeout (45 detik). Periksa koneksi internet Anda dan coba lagi.";
    } else if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError") || err.message.includes("Load failed")) {
      pesan = "Gagal terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.";
    } else {
      pesan = err.message;
    }

    tampilkanError(pesan);
  }
}

// ============================================================
// KUMPULKAN PAYLOAD (teks + file base64)
// ============================================================
async function kumpulkanPayload(form) {
  const g = id => (document.getElementById(id)?.value || "").trim();

  const payload = {
    namaPelapor:     g("namaPelapor"),
    nim:             g("nim"),
    prodiPelapor:    g("prodiPelapor"),
    kontak:          g("kontak"),
    namaTerlapor:    g("namaTerlapor"),
    statusTerlapor:  g("statusTerlapor"),
    prodiTerlapor:   g("prodiTerlapor"),
    jenisPelanggaran: g("jenisPelanggaran"),
    tanggalKejadian: g("tanggalKejadian"),
    waktuKejadian:   g("waktuKejadian"),
    lokasiKejadian:  g("lokasiKejadian"),
    kronologi:       g("kronologi"),
    adaSaksi:        form.querySelector('input[name="adaSaksi"]:checked')?.value || "",
    namaSaksi:       g("namaSaksi"),
    kontakSaksi:     g("kontakSaksi"),
  };

  // KTM — wajib ada (sudah divalidasi sebelumnya)
  const ktmInput = document.getElementById("ktmInput");
  if (ktmInput?.files?.length > 0) {
    const ktmFile = ktmInput.files[0];
    if (ktmFile.size > 10 * 1024 * 1024) throw new Error("File KTM melebihi batas 10 MB.");
    payload.ktmBase64    = await toBase64(ktmFile);
    payload.ktmMimeType  = ktmFile.type || "image/jpeg";
    payload.ktmFileName  = ktmFile.name;
  }

  // Bukti pendukung (opsional, multi-file)
  const fileInput = document.getElementById("fileInput");
  if (fileInput?.files?.length > 0) {
    let total = 0;
    const list = [];
    for (const file of fileInput.files) {
      total += file.size;
      if (file.size > 10 * 1024 * 1024) throw new Error(`File "${file.name}" melebihi batas 10 MB.`);
      if (total > 25 * 1024 * 1024) throw new Error("Total ukuran file bukti melebihi batas 25 MB.");
      list.push({ base64: await toBase64(file), mimeType: file.type, name: file.name });
    }
    payload.buktiFiles = JSON.stringify(list);
  }

  return payload;
}

// ============================================================
// VALIDASI
// ============================================================
function validasiForm(form) {
  const required = {
    namaPelapor:     "Nama lengkap pelapor",
    nim:             "NIM",
    prodiPelapor:    "Program studi / Fakultas",
    kontak:          "Nomor WhatsApp",
    jenisPelanggaran:"Jenis dugaan pelanggaran",
    kronologi:       "Uraian / kronologi kejadian",
  };

  for (const [id, label] of Object.entries(required)) {
    if (!document.getElementById(id)?.value?.trim()) {
      document.getElementById(id)?.focus();
      throw new Error(`Field "${label}" wajib diisi.`);
    }
  }

  const ktmInput = document.getElementById("ktmInput");
  if (!ktmInput?.files?.length) {
    throw new Error("Mohon unggah file Kartu Tanda Mahasiswa (KTM).");
  }

  const cb1 = document.getElementById("pernyataanBenar");
  const cb2 = document.getElementById("pernyataanBersedia");
  if (!cb1?.checked || !cb2?.checked) {
    throw new Error("Mohon centang semua pernyataan di Bagian 5.");
  }
}

// ============================================================
// HELPERS
// ============================================================
function setLoading(on) {
  const overlay = document.getElementById("loading-overlay");
  const btn     = document.getElementById("submit-btn");
  if (overlay) overlay.hidden = !on;
  if (btn) {
    btn.disabled    = on;
    btn.textContent = on ? "Mengirim…" : "Kirim Laporan";
  }
}

function tampilkanError(pesan) {
  const el = document.getElementById("form-error");
  if (!el) return;
  el.textContent = "⚠ " + pesan;
  el.hidden = false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);   // termasuk prefix data:...;base64,
    r.onerror = () => rej(new Error("Gagal membaca file: " + file.name));
    r.readAsDataURL(file);
  });
}

function updateFileList(listId, files) {
  const ul = document.getElementById(listId);
  if (!ul) return;
  ul.innerHTML = "";
  for (const f of files) {
    const li = document.createElement("li");
    li.textContent = `${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`;
    ul.appendChild(li);
  }
}

function updateFileHint(files) {
  const hint = document.getElementById("file-hint");
  if (!hint) return;
  let total = 0;
  for (const f of files) total += f.size;
  const mb = (total / 1024 / 1024).toFixed(2);
  hint.textContent = `Total: ${mb} MB dari maks. 25 MB. Setiap file maks. 10 MB.`;
  hint.style.color = total > 25 * 1024 * 1024 ? "#c0392b" : "";
}
