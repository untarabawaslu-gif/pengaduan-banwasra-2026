/* =================================================================
   BAWASRA UNTARA — Sistem Pengaduan PEMIRA 2026
   Logic formulir: validasi, konversi file, pengiriman ke backend
   ================================================================= */

// =====================================================================
// KONFIGURASI — ganti URL ini setelah Google Apps Script di-deploy
// Lihat PANDUAN-INSTALASI.md, langkah "Deploy Web App"
// =====================================================================
const CONFIG = {
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbwNOM1MmHTRofnKifo_pF0mTErac5vywSrdQwXrdVC7c-cac6upRIbFIwIPFUXJIfDB/exec",
  MAX_FILE_SIZE_MB: 10,
  MAX_TOTAL_SIZE_MB: 25,
};

// ---------------------------------------------------------------------
// State unggahan file (dipisah dari elemen <input> agar data tidak
// hilang ketika pengguna perlu mengirim ulang laporan yang gagal).
// ---------------------------------------------------------------------
let ktmFile = null;
let buktiFiles = [];

const form = document.getElementById("pengaduan-form");
const ktmInput = document.getElementById("ktmInput");
const ktmList = document.getElementById("ktm-list");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("file-list");
const fileHint = document.getElementById("file-hint");
const formError = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");
const loadingOverlay = document.getElementById("loading-overlay");
const formSection = document.getElementById("form-section");
const confirmationSection = document.getElementById("confirmation-section");
const reportIdEl = document.getElementById("report-id");
const reportTimeEl = document.getElementById("report-time");
const newReportBtn = document.getElementById("new-report-btn");
const saksiDetail = document.getElementById("saksi-detail");
const saksiYa = document.getElementById("saksiYa");
const saksiTidak = document.getElementById("saksiTidak");

// ---------------------------------------------------------------------
// Tampilkan/sembunyikan field saksi
// ---------------------------------------------------------------------
function updateSaksiVisibility() {
  saksiDetail.hidden = !saksiYa.checked;
}
saksiYa.addEventListener("change", updateSaksiVisibility);
saksiTidak.addEventListener("change", updateSaksiVisibility);

// ---------------------------------------------------------------------
// Unggah KTM (satu file)
// ---------------------------------------------------------------------
ktmInput.addEventListener("change", () => {
  const file = ktmInput.files[0];
  ktmInput.value = "";
  if (!file) return;

  if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
    showError(`File KTM melebihi ${CONFIG.MAX_FILE_SIZE_MB} MB. Silakan unggah file yang lebih kecil.`);
    return;
  }
  ktmFile = file;
  renderKtmList();
});

function renderKtmList() {
  ktmList.innerHTML = "";
  if (!ktmFile) return;
  const li = document.createElement("li");
  li.innerHTML = `<span>${escapeHtml(ktmFile.name)} (${formatSize(ktmFile.size)})</span>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Hapus";
  btn.addEventListener("click", () => {
    ktmFile = null;
    renderKtmList();
  });
  li.appendChild(btn);
  ktmList.appendChild(li);
}

// ---------------------------------------------------------------------
// Unggah bukti pendukung (banyak file)
// ---------------------------------------------------------------------
fileInput.addEventListener("change", () => {
  const newFiles = Array.from(fileInput.files);
  fileInput.value = "";

  for (const file of newFiles) {
    if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
      showError(`File "${file.name}" melebihi ${CONFIG.MAX_FILE_SIZE_MB} MB dan tidak ditambahkan.`);
      continue;
    }
    buktiFiles.push(file);
  }
  renderFileList();
});

function renderFileList() {
  fileList.innerHTML = "";
  let totalBytes = ktmFile ? ktmFile.size : 0;

  buktiFiles.forEach((file, index) => {
    totalBytes += file.size;
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(file.name)} (${formatSize(file.size)})</span>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Hapus";
    btn.addEventListener("click", () => {
      buktiFiles.splice(index, 1);
      renderFileList();
    });
    li.appendChild(btn);
    fileList.appendChild(li);
  });

  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
  fileHint.textContent = `Total ukuran file saat ini: ${totalMb} MB (maksimal ${CONFIG.MAX_TOTAL_SIZE_MB} MB).`;
}

function formatSize(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Konversi File -> base64 (tanpa prefix data URL)
// ---------------------------------------------------------------------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Gagal membaca file: " + file.name));
    reader.readAsDataURL(file);
  });
}

async function filesToPayload(files) {
  const result = [];
  for (const file of files) {
    const base64 = await fileToBase64(file);
    result.push({ fileName: file.name, mimeType: file.type || "application/octet-stream", base64 });
  }
  return result;
}

// ---------------------------------------------------------------------
// Validasi & pengiriman formulir
// ---------------------------------------------------------------------
function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
  formError.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideError() {
  formError.hidden = true;
  formError.textContent = "";
}

function validateForm() {
  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }
  if (!ktmFile) {
    showError("Mohon unggah foto/scan Kartu Tanda Mahasiswa (KTM) Anda.");
    return false;
  }
  let totalBytes = ktmFile.size + buktiFiles.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > CONFIG.MAX_TOTAL_SIZE_MB * 1024 * 1024) {
    showError(`Total ukuran file melebihi ${CONFIG.MAX_TOTAL_SIZE_MB} MB. Mohon kurangi jumlah/ukuran file.`);
    return false;
  }
  return true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  if (!validateForm()) return;

  if (CONFIG.WEB_APP_URL.startsWith("GANTI_DENGAN")) {
    showError("Sistem belum terhubung ke backend. Hubungi administrator BAWASRA (lihat PANDUAN-INSTALASI.md).");
    return;
  }

  submitBtn.disabled = true;
  loadingOverlay.hidden = false;

  try {
    const ktmPayload = await filesToPayload([ktmFile]);
    const buktiPayload = await filesToPayload(buktiFiles);

    const data = {
      namaPelapor: form.namaPelapor.value.trim(),
      nim: form.nim.value.trim(),
      prodiPelapor: form.prodiPelapor.value.trim(),
      kontak: form.kontak.value.trim(),
      ktmFile: ktmPayload[0],
      namaTerlapor: form.namaTerlapor.value.trim(),
      statusTerlapor: form.statusTerlapor.value,
      prodiTerlapor: form.prodiTerlapor.value.trim(),
      jenisPelanggaran: form.jenisPelanggaran.value,
      tanggalKejadian: form.tanggalKejadian.value,
      waktuKejadian: form.waktuKejadian.value,
      lokasiKejadian: form.lokasiKejadian.value.trim(),
      kronologi: form.kronologi.value.trim(),
      adaSaksi: form.adaSaksi.value || "Tidak diisi",
      namaSaksi: form.namaSaksi.value.trim(),
      kontakSaksi: form.kontakSaksi.value.trim(),
      files: buktiPayload,
    };

    // Catatan: Content-Type "text/plain" dipakai secara sengaja agar browser
    // tidak mengirim preflight OPTIONS, karena Google Apps Script Web App
    // tidak menangani preflight CORS. Isi body tetap berupa JSON.
    const response = await fetch(CONFIG.WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error("Status respons: " + response.status);

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Laporan belum berhasil diterima.");
    }

    showConfirmation(result.reportId, result.timestamp);

  } catch (err) {
    console.error(err);
    showError(
      "Laporan belum berhasil diterima oleh sistem. Periksa koneksi internet Anda dan kirim ulang laporan ini. " +
      "Data yang sudah Anda isi tidak hilang."
    );
  } finally {
    submitBtn.disabled = false;
    loadingOverlay.hidden = true;
  }
});

function showConfirmation(reportId, timestampIso) {
  reportIdEl.textContent = reportId;
  const date = timestampIso ? new Date(timestampIso) : new Date();
  reportTimeEl.textContent = date.toLocaleString("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
  });

  formSection.hidden = true;
  document.querySelector(".info-section").hidden = true;
  confirmationSection.hidden = false;
  confirmationSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

newReportBtn.addEventListener("click", () => {
  form.reset();
  ktmFile = null;
  buktiFiles = [];
  renderKtmList();
  renderFileList();
  updateSaksiVisibility();
  hideError();

  confirmationSection.hidden = true;
  document.querySelector(".info-section").hidden = false;
  formSection.hidden = false;
  formSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

// Inisialisasi tampilan awal
updateSaksiVisibility();
renderFileList();
