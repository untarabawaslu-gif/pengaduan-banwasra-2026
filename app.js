// ============================================================
// BANWASRA UNTARA — Code.gs (Google Apps Script)
// Backend untuk sistem pelaporan PEMIRA 2026
// ============================================================

// ⚠️ WAJIB GANTI kedua ID ini sebelum deploy
var SPREADSHEET_ID = "GANTI_DENGAN_ID_SPREADSHEET_ANDA";
var DRIVE_FOLDER_ID = "GANTI_DENGAN_ID_FOLDER_DRIVE_ANDA";

// ============================================================
// doPost — entry point utama
// ============================================================
function doPost(e) {
  try {
    console.log("=== doPost START ===");

    if (!e || (!e.postData && !e.parameter)) {
      throw new Error("Tidak ada data yang masuk");
    }

    var data;
    if (e.postData && e.postData.type === "application/json") {
      console.log("Parse: JSON body");
      data = JSON.parse(e.postData.contents);
    } else if (e.postData && e.postData.contents) {
      console.log("Parse: plain body");
      try { data = JSON.parse(e.postData.contents); }
      catch (_) { data = e.parameter; }
    } else {
      data = e.parameter || {};
    }

    console.log("Fields diterima:", Object.keys(data).filter(function(k){ return k.indexOf("Base64") === -1; }).join(", "));

    // Upload KTM
    var ktmUrl = "";
    if (data.ktmBase64) {
      console.log("Upload KTM...");
      ktmUrl = uploadFile(data.ktmBase64, data.ktmMimeType || "image/jpeg", data.ktmFileName || "ktm", "KTM");
      console.log("KTM OK:", ktmUrl);
    }

    // Upload bukti pendukung
    var buktiUrls = [];
    if (data.buktiFiles) {
      var list;
      try { list = JSON.parse(data.buktiFiles); } catch(_) { list = []; }
      for (var i = 0; i < list.length; i++) {
        if (list[i].base64) {
          console.log("Upload bukti " + (i+1) + "/" + list.length + ":", list[i].name);
          var url = uploadFile(list[i].base64, list[i].mimeType || "application/octet-stream", list[i].name || ("bukti-"+(i+1)), "Bukti");
          buktiUrls.push(url);
        }
      }
    }

    // Generate ID laporan
    var reportId = generateId();
    var now = new Date();
    var timestamp = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");

    // Tulis ke Spreadsheet
    console.log("Tulis ke Spreadsheet. ID:", reportId);
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "ID Laporan","Timestamp","Nama Pelapor","NIM","Prodi/Fakultas","WhatsApp","URL KTM",
        "Nama Terlapor","Status Terlapor","Prodi Terlapor",
        "Jenis Pelanggaran","Tanggal Kejadian","Waktu Kejadian","Lokasi Kejadian","Kronologi",
        "Ada Saksi","Nama Saksi","Kontak Saksi","URL Bukti"
      ]);
    }

    sheet.appendRow([
      reportId, timestamp,
      data.namaPelapor || "", data.nim || "", data.prodiPelapor || "", data.kontak || "", ktmUrl,
      data.namaTerlapor || "", data.statusTerlapor || "", data.prodiTerlapor || "",
      data.jenisPelanggaran || "", data.tanggalKejadian || "", data.waktuKejadian || "",
      data.lokasiKejadian || "", data.kronologi || "",
      data.adaSaksi || "", data.namaSaksi || "", data.kontakSaksi || "",
      buktiUrls.join("\n")
    ]);

    console.log("=== doPost SUKSES ===");

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, reportId: reportId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error("doPost ERROR:", err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// doGet — untuk cek status & CORS preflight
// ============================================================
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", service: "BANWASRA PEMIRA 2026" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// Upload file ke Google Drive
// ============================================================
function uploadFile(base64Data, mimeType, fileName, prefix) {
  var clean = base64Data;
  if (base64Data.indexOf(",") !== -1) {
    clean = base64Data.split(",")[1];
  }
  var bytes = Utilities.base64Decode(clean);
  var blob  = Utilities.newBlob(bytes, mimeType, prefix + "_" + fileName);
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var file   = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ============================================================
// Generate ID laporan unik
// ============================================================
function generateId() {
  var now  = new Date();
  var ymd  = Utilities.formatDate(now, "Asia/Jakarta", "yyyyMMdd");
  var rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return "BWSR-" + ymd + "-" + rand;
}

// ============================================================
// TEST — jalankan dulu dari editor sebelum deploy!
// ============================================================
function testKoneksi() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
    Logger.log("✅ Spreadsheet OK: " + sheet.getName());
  } catch(e) {
    Logger.log("❌ Spreadsheet GAGAL: " + e.message);
  }
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    Logger.log("✅ Drive Folder OK: " + folder.getName());
  } catch(e) {
    Logger.log("❌ Drive Folder GAGAL: " + e.message);
  }
}

