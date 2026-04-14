// ════════════════════════════════════════════════════════════════════════
//  KODE.GS
//
//  KENAPA SOLUSI SEBELUMNYA GAGAL:
//  1. doGet() di GAS tidak bisa baca ?token= dari URL dalam iframe
//  2. PropertiesService tidak pernah expire sendiri
//  3. sessionStorage hanya di browser, server tidak tahu tab ditutup
//
//  SOLUSI BARU — CARA KERJA:
//  • Login → server simpan {token, timestamp} di ScriptProperties
//            → token dikirim ke browser → disimpan di sessionStorage
//  • Setiap halaman protected → JS langsung panggil cekSesi(token)
//    via google.script.run SEBELUM render apapun
//    → Server validasi: token cocok DAN belum expired (8 jam)
//    → Jika tidak valid → JS redirect ke login
//  • Tab ditutup → sessionStorage hilang → buka ulang → token kosong
//    → cekSesi('') → { valid: false } → redirect login  ✓
//  • Logout → hapus token di server  ✓
// ════════════════════════════════════════════════════════════════════════

var SHEET_ID        = '147OCWGJHSlzxt6HiprOsZs6dvdULXeo-4BuhV9qU8yg';
var SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 jam milidetik
var BASE_URL        = 'https://script.google.com/macros/s/AKfycby-HCCJCr8TUeN08F7Ks8I9pmlVjPFBe4joT4-JhTeb/dev';

// ─── ROUTING ─────────────────────────────────────────────────────────────────
function doGet(e) {
  var page = (e.parameter.page || 'login').toString().trim();

  // Whitelist halaman yang ada
  var whitelist = ['login', 'Dashboard', 'formArsip'];
  if (whitelist.indexOf(page) === -1) page = 'login';

  // doGet HANYA menampilkan HTML — validasi sesi dilakukan JS di halaman
  // (GAS iframe tidak bisa baca URL param secara reliable untuk auth)
  return HtmlService.createTemplateFromFile(page).evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setTitle('Aplikasi Arsip')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────
// Return objek: { ok: true, token: 'uuid' } atau { ok: false }
function checklogin(username, password) {
  var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Login');
  var lr = ws.getLastRow();

  username = username.toString().trim().toUpperCase();
  password = password.toString().trim().toUpperCase();

  for (var i = 2; i <= lr; i++) {
    var u = ws.getRange(i, 2).getValue().toString().trim().toUpperCase();
    var p = ws.getRange(i, 3).getValue().toString().trim().toUpperCase();
    if (u === username && p === password) {
      return { ok: true, token: _buatSesi(username) };
    }
  }
  return { ok: false };
}

function _buatSesi(username) {
  var token = Utilities.getUuid();
  var store = PropertiesService.getScriptProperties();
  store.setProperties({
    'SES_TOKEN' : token,
    'SES_USER'  : username,
    'SES_TIME'  : new Date().getTime().toString()
  });
  return token;
}

// ─── CEK SESI (dipanggil JS setiap halaman protected dimuat) ─────────────────
// Return: { valid: true, user: '...' } atau { valid: false, reason: '...' }
function cekSesi(token) {
  if (!token || token.toString().trim() === '') {
    return { valid: false, reason: 'no_token' };
  }

  var store = PropertiesService.getScriptProperties();
  var sToken = store.getProperty('SES_TOKEN');
  var sTime  = parseInt(store.getProperty('SES_TIME') || '0');
  var sUser  = store.getProperty('SES_USER') || '';
  var now    = new Date().getTime();

  if (!sToken || sToken !== token.toString().trim()) {
    return { valid: false, reason: 'invalid_token' };
  }

  if ((now - sTime) > SESSION_TIMEOUT) {
    store.deleteProperty('SES_TOKEN');
    store.deleteProperty('SES_USER');
    store.deleteProperty('SES_TIME');
    return { valid: false, reason: 'expired' };
  }

  // Perbarui timestamp (sliding session)
  store.setProperty('SES_TIME', now.toString());
  return { valid: true, user: sUser };
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
function logout() {
  var store = PropertiesService.getScriptProperties();
  store.deleteProperty('SES_TOKEN');
  store.deleteProperty('SES_USER');
  store.deleteProperty('SES_TIME');
}

// ─── DATA ────────────────────────────────────────────────────────────────────
function getAll() {
  var sheet   = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 16).getValues().map(function (row) {
    return row.map(function (cell) {
      if (cell instanceof Date) {
        var y = cell.getFullYear(), m = String(cell.getMonth()+1).padStart(2,'0'), d = String(cell.getDate()).padStart(2,'0');
        return y > 1900 ? y+'-'+m+'-'+d : '';
      }
      return cell.toString();
    });
  });
}

function getKodeKlasifikasi() {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('KodeKlasifikasi');
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow()-1, 2).getValues()
      .filter(function(r){ return r[0].toString().trim() !== ''; })
      .map(function(r){ return { kode: r[0].toString().trim(), nama: (r[1]||r[0]).toString().trim() }; });
  } catch(e) { return []; }
}

function simpan(data) {
  SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database').appendRow([
    '', data.No_Berkas, data.No_Item_Arsip, data.Kode_Klasifikasi, data.Judul,
    data.Tanggal_Lahir, data.Jumlah, data.Tingkat_Perkembangan,
    data.Klasifikasi_Keamanan, data.Akses_Publik, data.Hak_Akses,
    data.Dasar_Pertimbangan, data.Keterangan, data.Lokasi, data.No_Bok, data.Link_Tautan
  ]);
  resetNomor();
}

function editData(data) {
  SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database')
    .getRange(parseInt(data.rowIndex)+2, 2, 1, 15).setValues([[
      data.No_Berkas, data.No_Item_Arsip, data.Kode_Klasifikasi, data.Judul,
      data.Tanggal_Lahir, data.Jumlah, data.Tingkat_Perkembangan,
      data.Klasifikasi_Keamanan, data.Akses_Publik, data.Hak_Akses,
      data.Dasar_Pertimbangan, data.Keterangan, data.Lokasi, data.No_Bok, data.Link_Tautan
    ]]);
}

function hapusData(rowIndex) {
  SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database').deleteRow(parseInt(rowIndex)+2);
  resetNomor();
}

function resetNomor() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Database');
  var lr    = sheet.getLastRow();
  if (lr < 2) return;
  var n = [];
  for (var i = 1; i <= lr-1; i++) n.push([i]);
  sheet.getRange(2, 1, lr-1, 1).setValues(n);
}