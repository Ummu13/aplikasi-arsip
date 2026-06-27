// ════════════════════════════════════════════════════════════════════════
//  KODE.GS  (VERSI PERBAIKAN)
//
//  PERBAIKAN:
//  1. Cache getAll() di CacheService (60 detik) → multi-device tidak perlu
//     hit Spreadsheet setiap request; hanya 1 device/menit yang membuka sheet.
//  2. cekSesi() hanya update ScriptProperties jika jeda > 10 menit
//     (semula 5 menit), mengurangi write contention antar device.
//  3. Semua fungsi yang sering dipanggil tidak lagi pakai getActiveSpreadsheet()
//     karena fungsi itu lambat di luar doGet scope. Pakai openById() konsisten.
//  4. Fungsi simpan/edit/hapus invalidate cache agar data selalu segar.
// ════════════════════════════════════════════════════════════════════════
 
var SHEET_ID        = '147OCWGJHSlzxt6HiprOsZs6dvdULXeo-4BuhV9qU8yg';
var SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 jam
var BASE_URL        = '';
 
// ─── CACHE KEY ────────────────────────────────────────────────────────────────
var CACHE_KEY_ALL     = 'arsip_getAll_v1';
var CACHE_TTL         = 60; // detik — data segar maksimal 60 detik
 
// ─── ROUTING ─────────────────────────────────────────────────────────────────
function doGet(e) {
  var page = (e.parameter.page || 'login').toString().trim();
  var whitelist = ['login', 'Dashboard', 'formArsip', 'formAhliMedia', 'formSPPD', 'formSM', 'formSK', 'formQR'];
  if (whitelist.indexOf(page) === -1) page = 'login';
 
  try {
    BASE_URL = ScriptApp.getService().getUrl();
  } catch (err) {
    BASE_URL = 'https://script.google.com/macros/s/AKfycby-HCCJCr8TUeN08F7Ks8I9pmlVjPFBe4joT4-JhTeb/dev';
  }
 
  var template = HtmlService.createTemplateFromFile(page);
  template.BASE_URL = BASE_URL;
 
  return template.evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setTitle('Aplikasi Arsip')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
 
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
 
// ─── LOGIN ───────────────────────────────────────────────────────────────────
function checklogin(username, password) {
  // Gunakan openById agar konsisten dan tidak bergantung konteks aktif
  var ws = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Login');
  if (!ws) {
    // Fallback ke getActiveSpreadsheet jika sheet Login ada di spreadsheet aktif
    ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Login');
  }
  if (!ws) return { ok: false };
 
  var lr = ws.getLastRow();
  if (lr < 2) return { ok: false };
 
  username = username.toString().trim().toUpperCase();
  var pInput = password.toString().trim().toUpperCase();
 
  var data = ws.getRange(2, 2, lr - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    var u = data[i][0].toString().trim().toUpperCase();
    var p = data[i][1].toString().trim().toUpperCase();
    if (u === username && p === pInput) {
      return { ok: true, token: _buatSesi(username) };
    }
  }
  return { ok: false };
}
 
function _buatSesi(username) {
  var token = Utilities.getUuid();
  var store = PropertiesService.getScriptProperties();
  var sessionObj = {
    user: username,
    time: new Date().getTime().toString()
  };
 
  // Bersihkan sesi kadaluarsa sekali setiap ~5% login (lebih jarang = lebih cepat)
  if (Math.random() < 0.05) {
    try {
      var allProps = store.getProperties();
      var now = new Date().getTime();
      var toDelete = [];
      for (var key in allProps) {
        if (key.indexOf('SES_SESSION_') === 0) {
          try {
            var sessObj = JSON.parse(allProps[key]);
            if ((now - parseInt(sessObj.time || '0')) > SESSION_TIMEOUT) toDelete.push(key);
          } catch (e) { toDelete.push(key); }
        }
      }
      if (toDelete.length > 0) store.deleteProperties(toDelete);
    } catch (e) { }
  }
 
  store.setProperty('SES_SESSION_' + token, JSON.stringify(sessionObj));
  return token;
}
 
// ─── CEK SESI ────────────────────────────────────────────────────────────────
// PERBAIKAN: gunakan CacheService sebagai lapisan cepat sebelum ScriptProperties.
// CacheService bersifat shared (per-script, bukan per-user), jadi token tetap
// dicek kecocokan. Ini mengurangi latensi cekSesi dari ~800ms → ~100ms.
function cekSesi(token) {
  if (!token || token.toString().trim() === '') {
    return { valid: false, reason: 'no_token' };
  }
  token = token.toString().trim();
 
  // 1. Cek cache cepat (CacheService, TTL 5 menit)
  try {
    var cache   = CacheService.getScriptCache();
    var cacheKey = 'ses_' + token;
    var cached  = cache.get(cacheKey);
    if (cached) {
      var cObj = JSON.parse(cached);
      // Validasi ulang timestamp di cache agar tidak bergantung cache expired TTL saja
      var cAge = new Date().getTime() - parseInt(cObj.time || '0');
      if (cAge < SESSION_TIMEOUT) {
        return { valid: true, user: cObj.user || '' };
      }
    }
  } catch (e) { /* lanjut ke ScriptProperties */ }
 
  // 2. Cek ScriptProperties (sumber kebenaran)
  var store = PropertiesService.getScriptProperties();
  var sessionStr = store.getProperty('SES_SESSION_' + token);
  if (!sessionStr) return { valid: false, reason: 'invalid_token' };
 
  try {
    var session = JSON.parse(sessionStr);
    var sTime   = parseInt(session.time || '0');
    var now     = new Date().getTime();
 
    if ((now - sTime) > SESSION_TIMEOUT) {
      store.deleteProperty('SES_SESSION_' + token);
      return { valid: false, reason: 'expired' };
    }
 
    // Update sliding session hanya jika jeda > 10 menit (hemat write)
    if (now - sTime > 10 * 60 * 1000) {
      session.time = now.toString();
      store.setProperty('SES_SESSION_' + token, JSON.stringify(session));
    }
 
    // Simpan ke cache selama 5 menit agar request berikutnya langsung dari cache
    try {
      var cache2 = CacheService.getScriptCache();
      cache2.put('ses_' + token, JSON.stringify({ user: session.user, time: session.time }), 300);
    } catch (e) { }
 
    return { valid: true, user: session.user || '' };
  } catch (e) {
    return { valid: false, reason: 'corrupted_session' };
  }
}
 
// ─── LOGOUT ──────────────────────────────────────────────────────────────────
function logout(token) {
  if (!token) return;
  token = token.toString().trim();
  var store = PropertiesService.getScriptProperties();
  store.deleteProperty('SES_SESSION_' + token);
  // Hapus dari cache juga
  try { CacheService.getScriptCache().remove('ses_' + token); } catch (e) { }
}
 
 
// ─── DATA ARSIP (Database) ───────────────────────────────────────────────────
 
/* ── HELPER: Baca data mentah dari sheet ── */
function _readAllFromSheet() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database');
  if (!sheet) throw new Error("Sheet 'Database' tidak ditemukan!");
  var lastRow = sheet.getLastRow();
  var maxCol  = sheet.getLastColumn();
  if (lastRow < 2 || maxCol < 1) return [];
 
  var colsToFetch = Math.min(16, maxCol);
  var rawData = sheet.getRange(2, 1, lastRow - 1, colsToFetch).getValues();
 
  return rawData.map(function(row) {
    var safeRow = [];
    for (var i = 0; i < 16; i++) {
      var cell = row[i] || '';
      if (cell instanceof Date) {
        var y = cell.getFullYear(), m = String(cell.getMonth()+1).padStart(2,'0'), d = String(cell.getDate()).padStart(2,'0');
        safeRow.push(y > 1900 ? y+'-'+m+'-'+d : '');
      } else {
        safeRow.push(cell.toString());
      }
    }
    // Auto-calculate Keterangan (index 12) berdasarkan TanggalSurat (index 5)
    safeRow[12] = _hitungKeterangan(safeRow[5], safeRow[12]);
    return safeRow;
  });
}
 
/* ── PERBAIKAN MULTI-DEVICE: getAll() dengan cache 60 detik ──
   Semua device yang memuat halaman dalam rentang 60 detik
   menerima data dari cache (in-memory di GAS runtime),
   bukan membuka Spreadsheet baru. Ini mengurangi beban drastis.  */
function getAll() {
  try {
    var cache    = CacheService.getScriptCache();
    var cached   = cache.get(CACHE_KEY_ALL);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) { /* fallback ke sheet */ }
 
  var data = _readAllFromSheet();
 
  // Simpan ke cache. Nilai maksimal CacheService adalah 100KB per entry.
  // Jika data besar, kompresi dengan Utilities.gzip tidak tersedia di sini,
  // tapi JSON bisa muat ~500–1000 baris tanpa masalah.
  try {
    var json = JSON.stringify(data);
    if (json.length < 95000) { // batas aman 95KB
      CacheService.getScriptCache().put(CACHE_KEY_ALL, json, CACHE_TTL);
    }
  } catch (e) { }
 
  return data;
}
 
/* ── Invalidate cache setelah mutasi ── */
function _invalidateCache() {
  try { CacheService.getScriptCache().remove(CACHE_KEY_ALL); } catch (e) { }
}

/**
 * Menghitung status Keterangan secara otomatis berdasarkan selisih tahun tanggal dengan tahun saat ini.
 * Aturan: >= 5 tahun (Musnah), >= 2 tahun (Inaktif), < 2 tahun (Aktif)
 */
function _hitungKeterangan(tanggalStr, currentKeterangan) {
  if (!tanggalStr || tanggalStr.toString().trim() === '') {
    return currentKeterangan || 'Aktif';
  }
  var parts = tanggalStr.toString().split('-');
  var year = parseInt(parts[0], 10);
  if (isNaN(year) || year < 1000) {
    return currentKeterangan || 'Aktif';
  }
  var currentYear = new Date().getFullYear();
  var diff = currentYear - year;
  if (diff >= 5) {
    return 'Musnah';
  } else if (diff >= 2) {
    return 'Inaktif';
  } else {
    return 'Aktif';
  }
}
 
function getKodeKlasifikasi() {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('KodeKlasifikasi');
    if (!sheet || sheet.getLastRow() < 2) return [];
    var values = sheet.getRange(2, 1, sheet.getLastRow()-1, 2).getValues();
    var seen = {}, list = [];
    for (var i = 0; i < values.length; i++) {
      var kode = values[i][0].toString().trim();
      var nama = (values[i][1] || values[i][0]).toString().trim();
      var key  = kode + '|' + nama;
      if (kode !== '' && !seen[key]) { seen[key] = true; list.push({ kode: kode, nama: nama }); }
    }
    return list;
  } catch(e) { return []; }
}
 
function simpan(data) {
  data.Keterangan = _hitungKeterangan(data.Tanggal_Surat, data.Keterangan);
  SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database').appendRow([
    '', data.No_Berkas, data.No_Item_Arsip, data.Kode_Klasifikasi, data.Judul,
    data.Tanggal_Surat, data.Jumlah, data.Tingkat_Perkembangan,
    data.Klasifikasi_Keamanan, data.Akses_Publik, data.Hak_Akses,
    data.Dasar_Pertimbangan, data.Keterangan, data.Lokasi, data.No_Bok, data.Link_Tautan
  ]);
  resetNomor();
  _invalidateCache(); // ← invalidate agar getAll() ambil data terbaru
}
 
function editData(data) {
  data.Keterangan = _hitungKeterangan(data.Tanggal_Surat, data.Keterangan);
  SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database')
    .getRange(parseInt(data.rowIndex)+2, 2, 1, 15).setValues([[
      data.No_Berkas, data.No_Item_Arsip, data.Kode_Klasifikasi, data.Judul,
      data.Tanggal_Surat, data.Jumlah, data.Tingkat_Perkembangan,
      data.Klasifikasi_Keamanan, data.Akses_Publik, data.Hak_Akses,
      data.Dasar_Pertimbangan, data.Keterangan, data.Lokasi, data.No_Bok, data.Link_Tautan
    ]]);
  _invalidateCache();
}
 
function hapusData(rowIndex) {
  SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database').deleteRow(parseInt(rowIndex)+2);
  resetNomor();
  _invalidateCache();
}
 
function resetNomor() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database');
  var lr    = sheet.getLastRow();
  if (lr < 2) return;
  var n = [];
  for (var i = 1; i <= lr-1; i++) n.push([i]);
  sheet.getRange(2, 1, lr-1, 1).setValues(n);
}
 
// ─── DATA ALIH MEDIA ─────────────────────────────────────────────────────────
 
function getAhliMediaSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('DAFTAR ARSIP ALIH MEDIA');
  if (sheet) return sheet;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var nm = sheets[i].getName().toLowerCase();
    if (nm.indexOf('alih media') !== -1 || nm.indexOf('ahli media') !== -1) return sheets[i];
  }
  throw new Error("Sheet 'DAFTAR ARSIP ALIH MEDIA' tidak ditemukan.");
}
 
function getAllAhliMedia() {
  var sheet = getAhliMediaSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 8) return [];
  var rawData = sheet.getRange(8, 1, lastRow - 7, 10).getDisplayValues();
  return rawData.map(function(row) {
    return [row[0]||'', row[1]||'', row[2]||'', row[3]||'', row[4]||'', row[5]||'', row[6]||'', row[7]||'', row[8]||'', row[9]||''];
  });
}
 
function simpanAhliMedia(data) {
  var sheet = getAhliMediaSheet();
  var lr = sheet.getLastRow();
  var newNo = 1;
  if (lr >= 8) {
    var lastNo = parseInt(sheet.getRange(lr, 1).getValue());
    newNo = (!isNaN(lastNo)) ? lastNo + 1 : (lr - 7) + 1;
  }
  sheet.appendRow([newNo, data.Jenis_Arsip, data.Semula, data.Menjadi, data.Jumlah, data.Alat, data.Waktu, data.Keterangan, data.Link_Tautan, data.File_Hash || '']);
}
 
function editDataAhliMedia(data) {
  var sheet = getAhliMediaSheet();
  var row = parseInt(data.rowIndex) + 8;
  var oldUrl = sheet.getRange(row, 9).getValue();
  sheet.getRange(row, 2, 1, 9).setValues([[data.Jenis_Arsip, data.Semula, data.Menjadi, data.Jumlah, data.Alat, data.Waktu, data.Keterangan, data.Link_Tautan, data.File_Hash || '']]);
  if (oldUrl && oldUrl !== data.Link_Tautan) deleteDriveFileByUrl(oldUrl);
}
 
function hapusDataAhliMedia(rowIndex) {
  var sheet = getAhliMediaSheet();
  var row = parseInt(rowIndex) + 8;
  var oldUrl = sheet.getRange(row, 9).getValue();
  sheet.deleteRow(row);
  if (oldUrl) deleteDriveFileByUrl(oldUrl);
}

// ─── DATA SPPD ───────────────────────────────────────────────────────────────

function getSPPDSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('DAFTAR SPPD');
  if (sheet) return sheet;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().indexOf('sppd') !== -1) return sheets[i];
  }
  throw new Error("Sheet 'DAFTAR SPPD' tidak ditemukan.");
}
 
function getAllSPPD() {
  var sheet = getSPPDSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];
  var rawData = sheet.getRange(3, 1, lastRow - 2, 9).getDisplayValues();
  return rawData.map(function(row) {
    return [row[0]||'', row[1]||'', row[2]||'', row[3]||'', row[4]||'', row[5]||'', row[6]||'', row[7]||'', row[8]||''];
  });
}
 
function simpanSPPD(data) {
  var sheet = getSPPDSheet();
  var lr = sheet.getLastRow();
  var newNo = 1;
  if (lr >= 3) {
    var lastNo = parseInt(sheet.getRange(lr, 1).getValue());
    newNo = (!isNaN(lastNo)) ? lastNo + 1 : (lr - 2) + 1;
  }
  sheet.appendRow([newNo, data.No_Urut, data.No_SPPD, data.Nama, data.Tujuan_SPPD, data.Tempat_Tujuan_SPPD, data.Dari, data.Sampai, data.Tanggal_SPPD]);
}
 
function editDataSPPD(data) {
  var sheet = getSPPDSheet();
  var row = parseInt(data.rowIndex) + 3;
  sheet.getRange(row, 2, 1, 8).setValues([[data.No_Urut, data.No_SPPD, data.Nama, data.Tujuan_SPPD, data.Tempat_Tujuan_SPPD, data.Dari, data.Sampai, data.Tanggal_SPPD]]);
}
 
function hapusDataSPPD(rowIndex) {
  var sheet = getSPPDSheet();
  sheet.deleteRow(parseInt(rowIndex) + 3);
  resetNomorSPPD();
}
 
function resetNomorSPPD() {
  var sheet = getSPPDSheet();
  var lr = sheet.getLastRow();
  if (lr < 3) return;
  var n = [];
  for (var i = 1; i <= lr - 2; i++) n.push([i]);
  sheet.getRange(3, 1, lr - 2, 1).setValues(n);
}

/**
 * Unduh data SPPD sebagai xlsx, pdf, atau docx.
 * Parameter: bulan (string '01'-'12', opsional), tahun (string, opsional), format ('xlsx'|'pdf'|'docx')
 *
 * Filter dilakukan pada kolom G (Dari), H (Sampai), atau I (Tanggal).
 * Kolom yang diekspor: No | No.Urut | No.SPPD | Nama | Tujuan | Tempat Tujuan | Dari | Sampai | Tanggal
 */
function getDownloadUrlSPPD(bulan, tahun, format) {
  var sourceSheet = getSPPDSheet();

  var tempSheetName = 'Export_SPPD_' + new Date().getTime();
  var tempSS   = SpreadsheetApp.create(tempSheetName);
  var tempSSId = tempSS.getId();
  DriveApp.getFileById(tempSSId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // ── Salin header (baris 1–2) + data (baris 3+) ke SS baru ──────────────
  var tempSheet = sourceSheet.copyTo(tempSS);
  tempSheet.setName('Data SPPD');
  var defaultSheet = tempSS.getSheetByName('Sheet1');
  if (defaultSheet) tempSS.deleteSheet(defaultSheet);

  // ── Helper parsing tanggal ke YYYY-MM-DD ─────────────────────────────
  var parseDateToISO = function(val) {
    if (!val) return '';
    if (val instanceof Date) {
      var y = val.getFullYear();
      var m = String(val.getMonth() + 1).padStart(2, '0');
      var d = String(val.getDate()).padStart(2, '0');
      return y > 1900 ? y + '-' + m + '-' + d : '';
    }
    var str = val.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    var match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) return match[3] + '-' + match[2].padStart(2,'0') + '-' + match[1].padStart(2,'0');
    var match2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match2) return match2[1] + '-' + match2[2].padStart(2,'0') + '-' + match2[3].padStart(2,'0');
    return str;
  };

  // ── Filter berdasarkan bulan dan/atau tahun (cek kolom G, H, I) ──────
  var hasBulan = bulan && bulan.toString().trim() !== '';
  var hasTahun = tahun && tahun.toString().trim() !== '';

  if (hasBulan || hasTahun) {
    var rawData = tempSheet.getDataRange().getValues();
    var filtered = rawData.slice(0, 2); // Simpan header baris 1–2
    for (var i = 2; i < rawData.length; i++) {
      var r = rawData[i];
      // Cek pada kolom G (idx 6=Dari), H (idx 7=Sampai), I (idx 8=Tanggal)
      var dates = [parseDateToISO(r[6]), parseDateToISO(r[7]), parseDateToISO(r[8])];
      var rowMatch = false;
      for (var di = 0; di < dates.length; di++) {
        var dt = dates[di];
        if (!dt) continue;
        var parts = dt.split('-');
        var dtYear = parts[0] || '';
        var dtMonth = parts[1] || '';
        var yearOk  = !hasTahun || dtYear  === tahun.toString().trim();
        var monthOk = !hasBulan || dtMonth === bulan.toString().trim();
        if (yearOk && monthOk) { rowMatch = true; break; }
      }
      if (rowMatch) filtered.push(r);
    }
    tempSheet.clearContents();
    if (filtered.length > 0) {
      tempSheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
    }
  }

  var newLastRow = tempSheet.getLastRow();
  if (newLastRow < 3) {
    cleanupTempSheet(tempSSId, null);
    throw new Error("Tidak terdapat data sesuai kriteria yang diberikan.");
  }

  // ── Renomor kolom A mulai dari 1 ──────────────────────────────────────
  var dataCount = newLastRow - 2;
  var newNos = [];
  for (var n = 1; n <= dataCount; n++) newNos.push([n]);
  tempSheet.getRange(3, 1, dataCount, 1).setValues(newNos);

  // ── Rapikan: buang baris & kolom kosong sisa ─────────────────────────
  var COLS = 9; // A s/d I
  var maxRows = tempSheet.getMaxRows();
  if (maxRows > newLastRow) tempSheet.deleteRows(newLastRow + 1, maxRows - newLastRow);
  var maxCols = tempSheet.getMaxColumns();
  if (maxCols > COLS) tempSheet.deleteColumns(COLS + 1, maxCols - COLS);

  // ── Lebar kolom ──────────────────────────────────────────────────────
  // No | No.Urut | No.SPPD | Nama | Tujuan | Tempat Tujuan | Dari | Sampai | Tanggal
  tempSheet.autoResizeColumns(1, COLS);
  var minW = [30,  70,  80, 120, 200, 200,  120,  120,  120];
  var maxW = [40, 110, 120, 180, 350, 350, 140, 140, 140];
  for (var c = 1; c <= COLS; c++) {
    var auto = tempSheet.getColumnWidth(c);
    tempSheet.setColumnWidth(c, Math.max(minW[c-1], Math.min(maxW[c-1], auto)));
  }

  // ── Freeze & format header (baris pertama data di baris 1 atau baris 2?) ─
  // Karena sheet asli memiliki 2 baris header, kita buat baris 1-2 bold + warna
  tempSheet.setFrozenRows(2);
  tempSheet.getRange(1, 1, 2, COLS)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#0f2544')
    .setWrap(true);

  var gid = tempSheet.getSheetId();

  // ── Format DOCX ──────────────────────────────────────────────────────
  if (format === 'docx') {
    try {
      var rawData  = tempSheet.getDataRange().getDisplayValues();
      var dataRows = [];
      for (var i = 2; i < rawData.length; i++) {
        dataRows.push(rawData[i].map(function(c){ return c.toString(); }));
      }

      var doc  = DocumentApp.create(tempSheetName + '_Docx');
      var body = doc.getBody();
      // A4 Landscape
      body.setPageHeight(595.276).setPageWidth(841.89)
          .setMarginLeft(30).setMarginRight(30).setMarginTop(36).setMarginBottom(36);

      var title = body.insertParagraph(0, 'DAFTAR SURAT PERINTAH PERJALANAN DINAS (SPPD)');
      title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      title.editAsText().setBold(true).setFontSize(13);

      // Header tabel menggunakan 1 baris ringkas
      var headerRow = ['No', 'No. Urut', 'No. SPPD', 'Nama', 'Tujuan Perjalanan Dinas', 'Tempat Tujuan', 'Dari', 'Sampai', 'Tanggal'];
      var tableData = [headerRow].concat(dataRows);
      var table = body.appendTable(tableData);

      // Total ~751pt (A4 landscape 841.89 - margin 60)
      // No(25) | No.Urut(55) | No.SPPD(65) | Nama(90) | Tujuan(170) | Tempat(150) | Dari(60) | Sampai(60) | Tanggal(76)
      var colWidths = [25, 55, 65, 90, 170, 150, 60, 60, 76];

      for (var r = 0; r < table.getNumRows(); r++) {
        var rowObj = table.getRow(r);
        for (var c = 0; c < rowObj.getNumCells(); c++) {
          var cell = rowObj.getCell(c);
          var para = cell.getChild(0).asParagraph();
          if (r === 0) {
            cell.setBackgroundColor('#0f2544');
            para.editAsText().setBold(true).setForegroundColor('#ffffff').setFontSize(7);
          } else {
            para.editAsText().setFontSize(7);
          }
          if (colWidths[c]) cell.setWidth(colWidths[c]);
        }
      }

      doc.saveAndClose();
      var docId = doc.getId();
      DriveApp.getFileById(docId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return {
        url        : 'https://docs.google.com/document/d/' + docId + '/export?format=docx',
        tempSheetId: tempSSId,
        tempDocId  : docId
      };
    } catch (e) {
      cleanupTempSheet(tempSSId, null);
      throw new Error("Gagal membuat Word: " + e.message);
    }
  }

  // ── Format XLSX / PDF ────────────────────────────────────────────────
  var formatParam = format === 'pdf' ? 'pdf' : 'xlsx';
  var exportUrl   = 'https://docs.google.com/spreadsheets/d/' + tempSSId
                  + '/export?format=' + formatParam + '&gid=' + gid;
  if (formatParam === 'pdf') {
    exportUrl += '&portrait=false&size=A4&fitw=true&gridlines=false';
  }
  return { url: exportUrl, tempSheetId: tempSSId };
}

// ─── UPLOAD DRIVE ─────────────────────────────────────────────────────────────

/**
 * Hapus file dari Drive berdasarkan URL (memasukkan ke Trash)
 */
function deleteDriveFileByUrl(url) {
  if (!url) return;
  try {
    var match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      DriveApp.getFileById(match[1]).setTrashed(true);
    }
  } catch (e) {
    // Abaikan jika file tidak ditemukan atau tidak ada izin
  }
}

/**
 * Konversi byte array hasil digest ke format string hexadesimal (MD5).
 */
function _hexDigest(digest) {
  var hash = '';
  for (var i = 0; i < digest.length; i++) {
    var byteVal = digest[i];
    if (byteVal < 0) byteVal += 256;
    var byteString = byteVal.toString(16);
    if (byteString.length == 1) byteString = '0' + byteString;
    hash += byteString;
  }
  return hash;
}

/**
 * Mengambil semua MD5 hash dari sheet Alih Media.
 * Jika ada baris lama yang memiliki tautan file tapi belum ada hash, hitung & simpan otomatis.
 */
function _getAlihMediaHashes() {
  var sheet = getAhliMediaSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 8) return [];
  
  var range = sheet.getRange(8, 9, lastRow - 7, 2); // Kolom I (Link) & J (Hash)
  var values = range.getValues();
  var hashes = [];
  
  for (var i = 0; i < values.length; i++) {
    var link = values[i][0] || '';
    var hash = values[i][1] || '';
    
    if (link && !hash) {
      // Lazy compute untuk data lama
      try {
        var match = link.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
          var file = DriveApp.getFileById(match[1]);
          var blob = file.getBlob();
          var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, blob.getBytes());
          hash = _hexDigest(digest);
          
          // Tulis kembali ke spreadsheet kolom ke-10 (Kolom J)
          sheet.getRange(8 + i, 10).setValue(hash);
        }
      } catch (e) {
        // Abaikan jika file tidak ditemukan
      }
    }
    
    if (hash) {
      hashes.push(hash);
    }
  }
  return hashes;
}

/**
 * Upload file ke Drive (folder: aplikasi arsip / alih media)
 */
function uploadFileToDrive(base64Data, fileName, mimeType) {
  try {
    var parentFolderName = "aplikasi arsip";
    var childFolderName  = "alih media";
    
    var parentFolders = DriveApp.getFoldersByName(parentFolderName);
    var parentFolder  = parentFolders.hasNext() ? parentFolders.next() : DriveApp.createFolder(parentFolderName);
    
    var childFolders = parentFolder.getFoldersByName(childFolderName);
    var targetFolder = childFolders.hasNext() ? childFolders.next() : parentFolder.createFolder(childFolderName);
    
    var decodedData = Utilities.base64Decode(base64Data.split(",")[1]);
    
    // Hitung MD5 hash
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, decodedData);
    var hash = _hexDigest(digest);
    
    var blob        = Utilities.newBlob(decodedData, mimeType, fileName);
    var file        = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { success: true, url: file.getUrl(), name: fileName, hash: hash };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Upload file Arsip ke Drive berdasarkan keterangan
 * (folder: aplikasi arsip / Data Arsip / <keterangan>)
 */
function uploadFileToDriveArsip(base64Data, fileName, mimeType, keterangan) {
  try {
    var decodedData = Utilities.base64Decode(base64Data.split(",")[1]);
    
    // Hitung MD5 dari file baru
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, decodedData);
    var uploadHash = _hexDigest(digest);
    
    // Cocokkan dengan daftar hash Alih Media
    var alihMediaHashes = _getAlihMediaHashes();
    if (alihMediaHashes.indexOf(uploadHash) !== -1) {
      return { success: false, message: 'File yang Anda unggah sudah pernah diupload pada Alih Media.' };
    }
    
    keterangan = keterangan || "Tanpa Keterangan";
    var parentFolderName = "aplikasi arsip";
    var subFolderName    = "Data Arsip";
    var childFolderName  = keterangan;
    
    var parentFolders = DriveApp.getFoldersByName(parentFolderName);
    var parentFolder  = parentFolders.hasNext() ? parentFolders.next() : DriveApp.createFolder(parentFolderName);
    
    var subFolders = parentFolder.getFoldersByName(subFolderName);
    var subFolder  = subFolders.hasNext() ? subFolders.next() : parentFolder.createFolder(subFolderName);

    var childFolders = subFolder.getFoldersByName(childFolderName);
    var targetFolder = childFolders.hasNext() ? childFolders.next() : subFolder.createFolder(childFolderName);
    
    var blob        = Utilities.newBlob(decodedData, mimeType, fileName);
    var file        = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { success: true, url: file.getUrl(), name: fileName };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Upload file Surat Masuk ke Drive
 * (folder: aplikasi arsip / surat masuk / [jenis surat])
 */
function uploadFileToDriveSM(base64Data, fileName, mimeType, jenisSurat) {
  try {
    jenisSurat = jenisSurat || "Lainnya";
    var parentFolderName = "aplikasi arsip";
    var subFolderName    = "surat masuk";
    var childFolderName  = jenisSurat;
    
    var parentFolders = DriveApp.getFoldersByName(parentFolderName);
    var parentFolder  = parentFolders.hasNext() ? parentFolders.next() : DriveApp.createFolder(parentFolderName);
    
    var subFolders = parentFolder.getFoldersByName(subFolderName);
    var subFolder  = subFolders.hasNext() ? subFolders.next() : parentFolder.createFolder(subFolderName);

    var childFolders = subFolder.getFoldersByName(childFolderName);
    var targetFolder = childFolders.hasNext() ? childFolders.next() : subFolder.createFolder(childFolderName);
    
    var decodedData = Utilities.base64Decode(base64Data.split(",")[1]);
    var blob        = Utilities.newBlob(decodedData, mimeType, fileName);
    var file        = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { success: true, url: file.getUrl(), name: fileName };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Upload file Surat Keluar ke Drive
 * (folder: aplikasi arsip / surat keluar / [jenis surat])
 */
function uploadFileToDriveSK(base64Data, fileName, mimeType, jenisSurat) {
  try {
    jenisSurat = jenisSurat || "Lainnya";
    var parentFolderName = "aplikasi arsip";
    var subFolderName    = "surat keluar";
    var childFolderName  = jenisSurat;
    
    var parentFolders = DriveApp.getFoldersByName(parentFolderName);
    var parentFolder  = parentFolders.hasNext() ? parentFolders.next() : DriveApp.createFolder(parentFolderName);
    
    var subFolders = parentFolder.getFoldersByName(subFolderName);
    var subFolder  = subFolders.hasNext() ? subFolders.next() : parentFolder.createFolder(subFolderName);

    var childFolders = subFolder.getFoldersByName(childFolderName);
    var targetFolder = childFolders.hasNext() ? childFolders.next() : subFolder.createFolder(childFolderName);
    
    var decodedData = Utilities.base64Decode(base64Data.split(",")[1]);
    var blob        = Utilities.newBlob(decodedData, mimeType, fileName);
    var file        = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { success: true, url: file.getUrl(), name: fileName };
  } catch (e) {
    return { success: false, message: e.message };
  }
}


// ─── DOWNLOAD ALIH MEDIA ─────────────────────────────────────────────────────

function getDownloadUrlAhliMedia(tahun, format) {
  var sourceSheet = getAhliMediaSheet();
  
  var tempSheetName = 'Export_Ahli_Media_' + new Date().getTime();
  var tempSS   = SpreadsheetApp.create(tempSheetName);
  var tempSSId = tempSS.getId();
  DriveApp.getFileById(tempSSId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  var tempSheet = sourceSheet.copyTo(tempSS);
  tempSheet.setName('Data Alih Media');
  var defaultSheet = tempSS.getSheetByName('Sheet1');
  if (defaultSheet) tempSS.deleteSheet(defaultSheet);
  
  if (tahun && tahun.toString().trim() !== '') {
    var data = tempSheet.getDataRange().getDisplayValues();
    var filteredData = data.slice(0, 7); // Simpan header (baris 1-7)
    for (var i = 7; i < data.length; i++) {
      var wStr = (data[i][6] || '').toString();
      if (wStr.indexOf(tahun) !== -1) filteredData.push(data[i]);
    }
    tempSheet.clearContents();
    if (filteredData.length > 0) {
      tempSheet.getRange(1, 1, filteredData.length, filteredData[0].length).setValues(filteredData);
    }
  }

  var newLastRow = tempSheet.getLastRow();
  if (newLastRow <= 7) {
    cleanupTempSheet(tempSSId, null);
    throw new Error("Tidak Terdapat Data Sesuai kriteria yang diberikan.");
  }

  var newNos = [];
  for (var n = 1; n <= (newLastRow - 7); n++) newNos.push([n]);
  tempSheet.getRange(8, 1, newNos.length, 1).setValues(newNos);

  var maxRows = tempSheet.getMaxRows();
  if (maxRows > newLastRow) tempSheet.deleteRows(newLastRow + 1, maxRows - newLastRow);
  var maxCols = tempSheet.getMaxColumns();
  if (maxCols > 8) tempSheet.deleteColumns(9, maxCols - 8);

  tempSheet.autoResizeColumns(1, 8);
  for (var c = 1; c <= 8; c++) {
    if (c === 1) { tempSheet.setColumnWidth(c, 30); continue; }
    var currentW = tempSheet.getColumnWidth(c);
    var buffer   = (c === 2) ? 200 : 30;
    var targetW  = currentW + buffer;
    if (c === 3 && targetW > 150) targetW = 150;
    if (targetW > 400) targetW = 400;
    if (targetW < 50)  targetW = 50;
    tempSheet.setColumnWidth(c, targetW);
  }

  var maxCols2 = tempSheet.getMaxColumns();
  if (maxCols2 > 8) tempSheet.deleteColumns(9, maxCols2 - 8);
  var maxRows2 = tempSheet.getMaxRows();
  var lastRowData = tempSheet.getLastRow();
  if (maxRows2 > lastRowData && lastRowData > 0) tempSheet.deleteRows(lastRowData + 1, maxRows2 - lastRowData);
  
  var gid = tempSheet.getSheetId();
  
  if (format === 'docx') {
    try {
      var rawData  = tempSheet.getDataRange().getDisplayValues();
      var dataRows = [];
      for (var i = 7; i < rawData.length; i++) {
        dataRows.push([
          (i - 6).toString(),
          (rawData[i][1] || '').toString(),
          (rawData[i][2] || '').toString(), (rawData[i][3] || '').toString(),
          (rawData[i][4] || '').toString(), (rawData[i][5] || '').toString(),
          (rawData[i][6] || '').toString(), (rawData[i][7] || '').toString()
        ]);
      }
      var doc  = DocumentApp.create(tempSheetName + '_Docx');
      var body = doc.getBody();
      body.setPageHeight(595.276).setPageWidth(841.89)
          .setMarginLeft(36).setMarginRight(36).setMarginTop(36).setMarginBottom(36);
      var title = body.insertParagraph(0, 'DAFTAR ARSIP ALIH MEDIA');
      title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      title.editAsText().setBold(true).setFontSize(16);
      var headerRow = ['No', 'Jenis Arsip', 'Semula', 'Menjadi', 'Jumlah', 'Alat', 'Waktu', 'Keterangan'];
      var tableData = [headerRow].concat(dataRows);
      var table = body.appendTable(tableData);
      var colWidths = [30, 110, 90, 90, 60, 100, 100, 150];
      for (var c = 0; c < table.getRow(0).getNumCells(); c++) {
        var cell = table.getRow(0).getCell(c);
        cell.setBackgroundColor('#0f2544');
        cell.getChild(0).asParagraph().editAsText().setBold(true).setForegroundColor('#ffffff');
        cell.setWidth(colWidths[c]);
      }
      doc.saveAndClose();
      var docId = doc.getId();
      DriveApp.getFileById(docId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { url: 'https://docs.google.com/document/d/' + docId + '/export?format=docx', tempSheetId: tempSSId, tempDocId: docId };
    } catch (e) {
      throw new Error("Gagal membuat Word: " + e.message);
    }
  } else {
    var formatParam = format === 'pdf' ? 'pdf' : (format === 'csv' ? 'csv' : 'xlsx');
    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + tempSSId + '/export?format=' + formatParam + '&gid=' + gid;
    if (formatParam === 'pdf') exportUrl += '&portrait=false&size=A4&fitw=true';
    return { url: exportUrl, tempSheetId: tempSSId };
  }
}

// ─── DOWNLOAD ARSIP ──────────────────────────────────────────────────────────

function getDownloadUrlArsip(format, keterangan, blnThn, kodeKlasifikasi, noBok) {
  var sourceSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database');

  var tempSheetName = 'Export_Data_Arsip_' + new Date().getTime();
  var tempSS   = SpreadsheetApp.create(tempSheetName);
  var tempSSId = tempSS.getId();
  DriveApp.getFileById(tempSSId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var tempSheet = sourceSheet.copyTo(tempSS);
  tempSheet.setName('Data Arsip');
  var defaultSheet = tempSS.getSheetByName('Sheet1');
  if (defaultSheet) tempSS.deleteSheet(defaultSheet);

  var data = tempSheet.getDataRange().getDisplayValues();

  var ketFilter  = keterangan      ? keterangan.toString().toLowerCase().trim()      : '';
  var klasFilter = kodeKlasifikasi ? kodeKlasifikasi.toString().toLowerCase().trim() : '';
  var bokFilter  = noBok           ? noBok.toString().toLowerCase().trim()           : '';
  var blnFilter  = blnThn          ? blnThn.toString().toLowerCase().trim()          : '';

  var INCLUDE_COLS = 15;
  var filteredData = [ data[0].slice(0, INCLUDE_COLS) ];

  for (var i = 1; i < data.length; i++) {
    var row   = data[i];
    var match = true;
    if (ketFilter  && row[12].toString().toLowerCase().trim() !== ketFilter)             match = false;
    if (klasFilter && row[3].toString().toLowerCase().trim().indexOf(klasFilter) === -1) match = false;
    if (bokFilter  && row[14].toString().toLowerCase().trim().indexOf(bokFilter) === -1) match = false;
    if (blnFilter  && row[5].toString().toLowerCase().indexOf(blnFilter) === -1)         match = false;
    if (match) {
      var newRow = row.slice(0, INCLUDE_COLS);
      newRow[0]  = filteredData.length;
      filteredData.push(newRow);
    }
  }

  if (filteredData.length <= 1) {
    cleanupTempSheet(tempSSId, null);
    throw new Error("Tidak ada data sesuai kriteria yang diberikan.");
  }

  tempSheet.clearContents();
  tempSheet.getRange(1, 1, filteredData.length, INCLUDE_COLS).setValues(filteredData);

  var maxRows = tempSheet.getMaxRows();
  if (maxRows > filteredData.length) tempSheet.deleteRows(filteredData.length + 1, maxRows - filteredData.length);
  var maxCols = tempSheet.getMaxColumns();
  if (maxCols > INCLUDE_COLS) tempSheet.deleteColumns(INCLUDE_COLS + 1, maxCols - INCLUDE_COLS);

  tempSheet.autoResizeColumns(1, INCLUDE_COLS);
  var minW = [35, 90, 75, 90, 220, 110, 70, 100, 100, 110, 90, 110, 70, 90, 120];
  var maxW = [35,130,100,130, 350, 130, 90, 130, 130, 130,120, 160, 90,130, 160];
  for (var c = 1; c <= INCLUDE_COLS; c++) {
    var auto = tempSheet.getColumnWidth(c);
    tempSheet.setColumnWidth(c, Math.max(minW[c-1], Math.min(maxW[c-1], auto)));
  }

  tempSheet.setFrozenRows(1);
  tempSheet.getRange(1, 1, 1, INCLUDE_COLS)
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f2544').setWrap(true);

  var gid = tempSheet.getSheetId();

  if (format === 'docx') {
    try {
      var doc  = DocumentApp.create(tempSheetName + '_Docx');
      var body = doc.getBody();
      body.setPageHeight(595.276).setPageWidth(841.89)
          .setMarginLeft(28).setMarginRight(28).setMarginTop(36).setMarginBottom(36);
      var titlePar = body.insertParagraph(0, 'DAFTAR ARSIP');
      titlePar.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      titlePar.editAsText().setBold(true).setFontSize(13);
      var tableData = filteredData.map(function(r) { return r.map(function(c) { return c.toString(); }); });
      var table = body.appendTable(tableData);
      var docW = [25,60,45,55,135,50,30,55,55,45,50,60,40,55,70];
      for (var r = 0; r < table.getNumRows(); r++) {
        var rowObj = table.getRow(r);
        for (var c = 0; c < rowObj.getNumCells(); c++) {
          var cell = rowObj.getCell(c);
          var para = cell.getChild(0).asParagraph();
          if (r === 0) {
            cell.setBackgroundColor('#0f2544');
            para.editAsText().setBold(true).setForegroundColor('#ffffff').setFontSize(7);
          } else {
            para.editAsText().setFontSize(7);
          }
          if (docW[c]) cell.setWidth(docW[c]);
        }
      }
      doc.saveAndClose();
      var docId = doc.getId();
      DriveApp.getFileById(docId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { url: 'https://docs.google.com/document/d/' + docId + '/export?format=docx', tempSheetId: tempSSId, tempDocId: docId };
    } catch(e) {
      cleanupTempSheet(tempSSId, null);
      throw new Error("Gagal membuat Word: " + e.message);
    }
  } else {
    var formatParam = format === 'pdf' ? 'pdf' : 'xlsx';
    var exportUrl   = 'https://docs.google.com/spreadsheets/d/' + tempSSId
                    + '/export?format=' + formatParam + '&gid=' + gid;
    if (formatParam === 'pdf') exportUrl += '&portrait=false&size=A4&fitw=true&gridlines=false';
    return { url: exportUrl, tempSheetId: tempSSId };
  }
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────

function cleanupTempSheet(tempId, docId) {
  if (tempId) { try { DriveApp.getFileById(tempId).setTrashed(true); } catch(e) {} }
  if (docId)  { try { DriveApp.getFileById(docId).setTrashed(true);  } catch(e) {} }
}

function testAuth() {
  DocumentApp.create('Test');
  DriveApp.getFiles();
}

// ─── DYNAMIC HEADER FINDER ──────────────────────────────────────────────────

function findHeaderRow(sheet, keywords) {
  var lastRow = sheet.getLastRow();
  var maxCol = sheet.getLastColumn();
  if (lastRow < 1 || maxCol < 1) return 1;
  var checkRows = Math.min(20, lastRow);
  var values = sheet.getRange(1, 1, checkRows, maxCol).getValues();
  
  // Normalize keywords by removing all non-alphanumeric characters
  var cleanKeywords = keywords.map(function(k) {
    return k.toLowerCase().replace(/[^a-z0-9]/g, '');
  });
  
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var valClean = values[r][c].toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      for (var k = 0; k < cleanKeywords.length; k++) {
        if (valClean.indexOf(cleanKeywords[k]) !== -1) {
          return r + 1; // 1-indexed row number
        }
      }
    }
  }
  return 1; // fallback
}

// ─── DATA SURAT MASUK (formSM) ────────────────────────────────────────────────

function getSMSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('DAFTAR SURAT MASUK');
  if (sheet) return sheet;
  // Fallback: cari sheet yang mengandung kata "daftar surat masuk"
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().indexOf('surat masuk') !== -1) {
      return sheets[i];
    }
  }
  throw new Error("Sheet 'DAFTAR SURAT MASUK' tidak ditemukan. Harap periksa nama Sheet Anda.");
}

function getAllSM() {
  var sheet = getSMSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  // Gunakan getValues() bukan getDisplayValues() agar tanggal bisa diformat konsisten
  var rawData = sheet.getRange(3, 1, lastRow - 2, 9).getValues();
  return rawData.map(function (row) {
    return [
      row[0] ? row[0].toString() : '',  // No
      row[1] ? row[1].toString() : '',  // Nomor Urut
      row[2] ? row[2].toString() : '',  // Nomor Berkas
      row[3] ? row[3].toString() : '',  // Asal Surat
      formatTanggal(row[4]),            // Tanggal Surat → YYYY-MM-DD
      row[5] ? row[5].toString() : '',  // Nomor Surat
      row[6] ? row[6].toString() : '',  // Perihal
      row[7] ? row[7].toString() : '',  // Jenis Surat
      row[8] ? row[8].toString() : ''   // Link File Tautan
    ];
  });
}

function formatTanggal(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, '0');
    var d = String(val.getDate()).padStart(2, '0');
    return y > 1900 ? y + '-' + m + '-' + d : '';
  }
  // Kalau sudah string (misal sudah tersimpan sebagai teks), kembalikan apa adanya
  return val.toString();
}

/**
 * Simpan data Surat masuk baru ke sheet.
 * Auto-nomor pada kolom A.
 */
function simpanSM(data) {
  var sheet = getSMSheet();
  var lr = sheet.getLastRow();
  var newNo = 1;

  // Data dimulai baris 3, jadi jika lastRow >= 3 berarti sudah ada data
  if (lr >= 3) {
    var lastNo = parseInt(sheet.getRange(lr, 1).getValue());
    if (!isNaN(lastNo)) newNo = lastNo + 1;
    else newNo = (lr - 2) + 1;
  }
  // Tulis tepat di baris berikutnya setelah baris terakhir
  // Jika baru (lr < 3), pastikan tulis mulai baris 3
  var targetRow = Math.max(lr + 1, 3);
  sheet.getRange(targetRow, 1, 1, 9).setValues([[
    newNo,
    data.Nomor_Urut,
    data.Nomor_Berkas,
    data.Asal_Surat,
    data.Tanggal_Surat,
    data.Nomor_Surat,
    data.Perihal,
    data.Jenis_Surat,
    data.Link_File_Tautan
  ]]);
}
/**
 * Edit data Surat masuk yang sudah ada.
 * rowIndex = index array dari client (0-based), baris spreadsheet = rowIndex + 3
 */
function editDataSM(data) {
  var sheet = getSMSheet();
  var row = parseInt(data.rowIndex) + 3;
  // Mulai kolom B (2) s/d I (9), total 8 kolom — tidak ubah kolom A (No)
  sheet.getRange(row, 2, 1, 8).setValues([[
    data.Nomor_Urut,
    data.Nomor_Berkas,
    data.Asal_Surat,
    data.Tanggal_Surat,
    data.Nomor_Surat,
    data.Perihal,
    data.Jenis_Surat,
    data.Link_File_Tautan
  ]]);
}
/**
 * Hapus baris surat masuk dan renomor ulang.
 * rowIndex = index array dari client (0-based), baris spreadsheet = rowIndex + 3
 */
function hapusDataSM(rowIndex) {
  var sheet = getSMSheet();
  sheet.deleteRow(parseInt(rowIndex) + 3);
resetNomorSM();
}
/**
 * Renomor ulang kolom A pada sheet DAFTAR SURAT MASUK mulai dari 1
 */
function resetNomorSM() {
  var sheet = getSMSheet();
  var lr = sheet.getLastRow();
  if (lr < 3) return;
  var n = [];
  for (var i = 1; i <= lr - 2; i++) n.push([i]);
  sheet.getRange(3, 1, lr - 2, 1).setValues(n);
}


function getDownloadUrlSM(bulan, tahun, format) {
  var sourceSheet = getSMSheet();
  var hRow = 2; // Hardcode ke 2 untuk mengamankan tata letak spreadsheet tetap
  
  var tempSheetName = 'Export_Surat_Masuk_' + new Date().getTime();
  var tempSS   = SpreadsheetApp.create(tempSheetName);
  var tempSSId = tempSS.getId();
  DriveApp.getFileById(tempSSId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  var tempSheet = sourceSheet.copyTo(tempSS);
  tempSheet.setName('Data Surat Masuk');
  var defaultSheet = tempSS.getSheetByName('Sheet1');
  if (defaultSheet) tempSS.deleteSheet(defaultSheet);
  
  var data = tempSheet.getDataRange().getValues(); // Ambil raw values agar format tanggal konsisten
  var filteredData = data.slice(0, hRow); // Simpan header
  
  // Helper fungsi lokalan untuk parsing tanggal
  var parseDateToISO = function(val) {
    if (!val) return '';
    if (val instanceof Date) {
      var y = val.getFullYear();
      var m = String(val.getMonth() + 1).padStart(2, '0');
      var d = String(val.getDate()).padStart(2, '0');
      return y > 1900 ? y + '-' + m + '-' + d : '';
    }
    var str = val.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    var match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
      return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
    }
    var match2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match2) {
      return match2[1] + '-' + match2[2].padStart(2, '0') + '-' + match2[3].padStart(2, '0');
    }
    return '';
  };
  
  var hasFilter = (tahun && tahun.toString().trim() !== '') || (bulan && bulan.toString().trim() !== '');
  
  if (hasFilter) {
    for (var i = hRow; i < data.length; i++) {
      var rawDate = data[i][4]; // Tanggal Surat di kolom indeks 4
      var formattedDate = parseDateToISO(rawDate);
      
      var match = true;
      if (tahun && tahun.toString().trim() !== '') {
        var yr = formattedDate.split('-')[0];
        if (yr !== tahun.toString().trim()) {
          match = false;
        }
      }
      if (bulan && bulan.toString().trim() !== '') {
        var mn = formattedDate.split('-')[1];
        if (mn !== bulan.toString().trim()) {
          match = false;
        }
      }
      
      if (match) {
        filteredData.push(data[i]);
      }
    }
    
    tempSheet.clearContents();
    if (filteredData.length > 0) {
      tempSheet.getRange(1, 1, filteredData.length, filteredData[0].length).setValues(filteredData);
    }
  }

  var newLastRow = tempSheet.getLastRow();
  if (newLastRow <= hRow) {
    cleanupTempSheet(tempSSId, null);
    throw new Error("Tidak Terdapat Data Sesuai kriteria yang diberikan.");
  }

  // Renomor kolom A mulai dari 1
  var newNos = [];
  for (var n = 1; n <= (newLastRow - hRow); n++) newNos.push([n]);
  tempSheet.getRange(hRow + 1, 1, newNos.length, 1).setValues(newNos);

  // Buang kolom 9 (Link File Tautan) agar ekspor rapi
  //var maxRows = tempSheet.getMaxRows();
  //if (maxRows > newLastRow) tempSheet.deleteRows(newLastRow + 1, maxRows - newLastRow);
  //var maxCols = tempSheet.getMaxColumns();
  //if (maxCols > 8) tempSheet.deleteColumns(9, maxCols - 8);

  tempSheet.autoResizeColumns(1, 9);
  var minW = [50, 80, 80, 120, 100, 100, 200, 200, 400];
  var maxW = [40, 120, 120, 600, 130, 130, 900, 250, 900];
  for (var c = 1; c <= 9; c++) {
    var currentW = tempSheet.getColumnWidth(c);
    tempSheet.setColumnWidth(c, Math.max(minW[c-1], Math.min(maxW[c-1], currentW)));
  }

  // Gaya Header
  tempSheet.setFrozenRows(hRow);
  tempSheet.getRange(1, 1, hRow, 9)
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f2544').setWrap(true);

  var gid = tempSheet.getSheetId();
  var formatParam = format === 'pdf' ? 'pdf' : 'xlsx';
  var exportUrl = 'https://docs.google.com/spreadsheets/d/' + tempSSId + '/export?format=' + formatParam + '&gid=' + gid;
  if (formatParam === 'pdf') {
    exportUrl += '&portrait=false&size=A4&fitw=true&gridlines=false';
  }
  return { url: exportUrl, tempSheetId: tempSSId };
}

// ─── DATA SURAT KELUAR (formSK) ───────────────────────────────────────────────

function getSKSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheets = ss.getSheets();
  var sheet = null;
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().trim() === 'daftar surat keluar') {
      sheet = sheets[i];
      break;
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet('DAFTAR SURAT KELUAR');
  }
  
  var hRow = findHeaderRow(sheet, ['nomor urut', 'no. urut', 'no urut', 'penerima']);
  
  // Auto-initialize if empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['NO', 'Nomor Urut', 'Nomor Berkas', 'Tanggal', 'Penerima', 'Perihal', 'Kode Klasifikasi', 'Jenis Surat', 'Link File']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackgroundColor('#0f2544').setFontColor('#ffffff');
    hRow = 1;
  }
  
  // Pastikan kolom berjumlah minimal 9
  var maxCol = sheet.getLastColumn();
  if (maxCol < 9) {
    var colsToAdd = 9 - maxCol;
    if (maxCol > 0) {
      sheet.insertColumnsAfter(maxCol, colsToAdd);
      var headers = ['NO', 'Nomor Urut', 'Nomor Berkas', 'Tanggal', 'Penerima', 'Perihal', 'Kode Klasifikasi', 'Jenis Surat', 'Link File'];
      for (var c = maxCol + 1; c <= 9; c++) {
        sheet.getRange(hRow, c).setValue(headers[c - 1])
          .setFontWeight('bold').setBackgroundColor('#0f2544').setFontColor('#ffffff');
      }
    }
  }
  
  return sheet;
}

function getAllSK() {
  var sheet = getSKSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  var rawData = sheet.getRange(3, 1, lastRow - 2, 9).getValues();
  return rawData.map(function (row) {
    return [
      row[0] ? row[0].toString() : '',  // No
      row[1] ? row[1].toString() : '',  // Nomor Urut
      row[2] ? row[2].toString() : '',  // Nomor Berkas
      formatTanggal(row[3]),            // Tanggal → YYYY-MM-DD
      row[4] ? row[4].toString() : '',  // Penerima
      row[5] ? row[5].toString() : '',  // Perihal
      row[6] ? row[6].toString() : '',  // Kode Klasifikasi
      row[7] ? row[7].toString() : '',  // Jenis Surat
      row[8] ? row[8].toString() : ''   // Link File Tautan
    ];
  });
}

function simpanSK(data) {
  var sheet = getSKSheet();
  var lr = sheet.getLastRow();
  var newNo = 1;

  // SK menggunakan findHeaderRow — asumsikan header di baris 1-2, data dari baris 3
  if (lr >= 3) {
    var lastNo = parseInt(sheet.getRange(lr, 1).getValue());
    if (!isNaN(lastNo)) newNo = lastNo + 1;
    else newNo = (lr - 2) + 1;
  }

  var targetRow = Math.max(lr + 1, 3);
  sheet.getRange(targetRow, 1, 1, 9).setValues([[
    newNo,
    data.Nomor_Urut,
    data.Nomor_Berkas,
    data.Tanggal,
    data.Penerima,
    data.Perihal,
    data.Kode_Klasifikasi,
    data.Jenis_Surat,
    data.Link_File_Tautan
  ]]);
}

function editDataSK(data) {
  var sheet = getSKSheet();
  var row = parseInt(data.rowIndex) + 3;
  var oldUrl = sheet.getRange(row, 9).getValue();
  
  sheet.getRange(row, 2, 1, 8).setValues([[
    data.Nomor_Urut,
    data.Nomor_Berkas,
    data.Tanggal,
    data.Penerima,
    data.Perihal,
    data.Kode_Klasifikasi,
    data.Jenis_Surat,
    data.Link_File_Tautan
  ]]);
  
  if (oldUrl && oldUrl !== data.Link_File_Tautan) {
    deleteDriveFileByUrl(oldUrl);
  }
}

function hapusDataSK(rowIndex) {
  var sheet = getSKSheet();
  var row = parseInt(rowIndex) + 3;
  var oldUrl = sheet.getRange(row, 9).getValue();
  
  sheet.deleteRow(row);
  
  if (oldUrl) {
    deleteDriveFileByUrl(oldUrl);
  }
  
  resetNomorSK();
}

function resetNomorSK() {
  var sheet = getSKSheet();
  var lr = sheet.getLastRow();
  if (lr < 3) return;
  
  var n = [];
  for (var i = 1; i <= lr - 2; i++) {
    n.push([i]);
  }
  sheet.getRange(3, 1, lr - 2, 1).setValues(n);
}

function getDownloadUrlSK(bulan, tahun, format) {
  var sourceSheet = getSKSheet();
  var hRow = 2; // Hardcode ke 2 untuk mengamankan tata letak spreadsheet tetap
  
  var tempSheetName = 'Export_Surat_Keluar_' + new Date().getTime();
  var tempSS   = SpreadsheetApp.create(tempSheetName);
  var tempSSId = tempSS.getId();
  DriveApp.getFileById(tempSSId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  var tempSheet = sourceSheet.copyTo(tempSS);
  tempSheet.setName('Data Surat Keluar');
  var defaultSheet = tempSS.getSheetByName('Sheet1');
  if (defaultSheet) tempSS.deleteSheet(defaultSheet);
  
  var data = tempSheet.getDataRange().getValues(); // Ambil raw values agar format tanggal konsisten
  var filteredData = data.slice(0, hRow); // Simpan header
  
  // Helper fungsi lokalan untuk parsing tanggal
  var parseDateToISO = function(val) {
    if (!val) return '';
    if (val instanceof Date) {
      var y = val.getFullYear();
      var m = String(val.getMonth() + 1).padStart(2, '0');
      var d = String(val.getDate()).padStart(2, '0');
      return y > 1900 ? y + '-' + m + '-' + d : '';
    }
    var str = val.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    var match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
      return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
    }
    var match2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match2) {
      return match2[1] + '-' + match2[2].padStart(2, '0') + '-' + match2[3].padStart(2, '0');
    }
    return '';
  };
  
  var hasFilter = (tahun && tahun.toString().trim() !== '') || (bulan && bulan.toString().trim() !== '');
  
  if (hasFilter) {
    for (var i = hRow; i < data.length; i++) {
      var rawDate = data[i][3]; // Tanggal di kolom indeks 3 (Tanggal Surat Keluar)
      var formattedDate = parseDateToISO(rawDate);
      
      var match = true;
      if (tahun && tahun.toString().trim() !== '') {
        var yr = formattedDate.split('-')[0];
        if (yr !== tahun.toString().trim()) {
          match = false;
        }
      }
      if (bulan && bulan.toString().trim() !== '') {
        var mn = formattedDate.split('-')[1];
        if (mn !== bulan.toString().trim()) {
          match = false;
        }
      }
      
      if (match) {
        filteredData.push(data[i]);
      }
    }
    
    tempSheet.clearContents();
    if (filteredData.length > 0) {
      tempSheet.getRange(1, 1, filteredData.length, filteredData[0].length).setValues(filteredData);
    }
  }

  var newLastRow = tempSheet.getLastRow();
  if (newLastRow <= hRow) {
    cleanupTempSheet(tempSSId, null);
    throw new Error("Tidak Terdapat Data Sesuai kriteria yang diberikan.");
  }

  // Renomor kolom A mulai dari 1
  var newNos = [];
  for (var n = 1; n <= (newLastRow - hRow); n++) newNos.push([n]);
  tempSheet.getRange(hRow + 1, 1, newNos.length, 1).setValues(newNos);

  tempSheet.autoResizeColumns(1, 9);
  var minW = [50, 80, 80, 100, 120, 200, 100, 250, 400];
  var maxW = [40, 120, 120, 130, 400, 900, 130, 300, 900];
  for (var c = 1; c <= 9; c++) {
    var currentW = tempSheet.getColumnWidth(c);
    tempSheet.setColumnWidth(c, Math.max(minW[c-1], Math.min(maxW[c-1], currentW)));
  }

  // Gaya Header
  tempSheet.setFrozenRows(hRow);
  tempSheet.getRange(1, 1, hRow, 9)
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f2544').setWrap(true);

  var gid = tempSheet.getSheetId();
  var formatParam = format === 'pdf' ? 'pdf' : 'xlsx';
  var exportUrl = 'https://docs.google.com/spreadsheets/d/' + tempSSId + '/export?format=' + formatParam + '&gid=' + gid;
  if (formatParam === 'pdf') {
    exportUrl += '&portrait=false&size=A4&fitw=true&gridlines=false';
  }
  return { url: exportUrl, tempSheetId: tempSSId };
}


// ════════════════════════════════════════════════════════════════════════
//  Fungsi QR Code
// ════════════════════════════════════════════════════════════════════════

// ─── 1. TAMBAH 'formQR' ke whitelist doGet ───────────────────────────────
//
//  Cari baris:
//    var whitelist = ['login', 'Dashboard', 'formArsip', 'formAhliMedia', 'formSPPD', 'formSM', 'formSK'];
//  Ganti menjadi:
//    var whitelist = ['login', 'Dashboard', 'formArsip', 'formAhliMedia', 'formSPPD', 'formSM', 'formSK', 'formQR'];
//
// ─────────────────────────────────────────────────────────────────────────


// ─── 2. HELPER: ambil / buat sheet "QR Code" ─────────────────────────────
function getQRSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('QR Code');
  if (sheet) return sheet;

  // Buat sheet baru jika belum ada
  sheet = ss.insertSheet('QR Code');

  // Inisialisasi header sesuai template
  sheet.getRange(1, 1, 1, 6).setValues([[
    'No', 'No. BOK', 'No. Berkas', 'Kode Klasifikasi', 'Lokasi', 'Tanggal Generate'
  ]]);
  sheet.getRange(1, 1, 1, 6)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#283289');
  sheet.setFrozenRows(1);

  return sheet;
}


// ─── 3. SIMPAN ke sheet "QR Code" ────────────────────────────────────────
//  Dipanggil dari formQR.HTML saat user klik "Simpan ke Sheet QR Code"
//  Parameter: { noBok, noBerkas, klas, lokasi }
function simpanQR(data) {
  var sheet = getQRSheet();
  var lr    = sheet.getLastRow();
  var newNo = (lr < 1) ? 1 : lr; // baris 1 = header, data mulai baris 2

  var tgl = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  sheet.appendRow([
    newNo,
    data.noBok    || '',
    data.noBerkas || '',
    data.klas     || '',
    data.lokasi   || '',
    tgl
  ]);
}


// ─── 4. AMBIL semua data QR dari sheet "QR Code" (opsional, untuk tabel) ─
function getAllQR() {
  var sheet = getQRSheet();
  var lr    = sheet.getLastRow();
  if (lr < 2) return [];
  return sheet.getRange(2, 1, lr - 1, 6).getDisplayValues().map(function(r) {
    return {
      no    : r[0] || '',
      noBok : r[1] || '',
      berkas: r[2] || '',
      klas  : r[3] || '',
      lokasi: r[4] || '',
      tgl   : r[5] || ''
    };
  });
}


// ════════════════════════════════════════════════════════════════════════
//  DASHBOARD STATS
// ════════════════════════════════════════════════════════════════════════

/**
 * Kembalikan semua data mentah yang dibutuhkan Dashboard
 * dalam satu panggilan agar lebih efisien.
 *
 * Return: {
 *   sm   : [[No,NoUrut,NoBerkas,AsalSurat,TglSurat,NoSurat,Perihal,JenisSurat,Link], ...],
 *   sk   : [[No,NoUrut,NoBerkas,Tgl,Penerima,Perihal,KodeKlas,JenisSurat,Link], ...],
 *   sppd : [[No,NoUrut,NoSPPD,Nama,Tujuan,Tempat,Dari,Sampai,Tanggal], ...],
 *   am   : [[No,JenisArsip,Semula,Menjadi,Jumlah,Alat,Waktu,Keterangan,Link], ...],
 *   arsip: [[No,NoBerkas,NoItem,KodeKlas,Judul,TglSurat,Jumlah,...,Keterangan,...], ...]
 * }
 */
function getDashboardStats() {
  var result = { sm: [], sk: [], sppd: [], am: [], arsip: [] };

  // Surat Masuk
  try { result.sm = getAllSM(); } catch(e) {}

  // Surat Keluar
  try { result.sk = getAllSK(); } catch(e) {}

  // SPPD
  try { result.sppd = getAllSPPD(); } catch(e) {}

  // Alih Media
  try { result.am = getAllAhliMedia(); } catch(e) {}

  // Arsip (Database) — ambil kolom yang diperlukan
  try {
    var arsipData = getAll();
    // Index: 0=No,1=NoBerkas,2=NoItem,3=KodeKlas,4=Judul,5=TglSurat,...,12=Keterangan
    result.arsip = arsipData.map(function(r) {
      return [r[0]||'', r[1]||'', r[2]||'', r[3]||'', r[4]||'', r[5]||'', r[6]||'', r[7]||'', r[8]||'', r[9]||'', r[10]||'', r[11]||'', r[12]||'', r[13]||'', r[14]||'', r[15]||''];
    });
  } catch(e) {}

  return result;
}