// ════════════════════════════════════════════════════════════════════════
//  TestRunner.gs
//  Fungsi utama untuk menjalankan semua test cases (Unit Test Layer 1)
// ════════════════════════════════════════════════════════════════════════

// Ganti SHEET_ID ke Spreadsheet khusus Test saat menjalankan testing
var TEST_SHEET_ID = 'GANTI_DENGAN_ID_SPREADSHEET_TESTING_ANDA'; 
var ORIGINAL_SHEET_ID = SHEET_ID;

function runAllTests() {
  // Overide SHEET_ID global ke Test Sheet
  SHEET_ID = TEST_SHEET_ID;
  
  var tests = [
    // Auth Tests
    test_checklogin_validCredentials,
    test_checklogin_invalidCredentials,
    test_checklogin_emptyInput,
    test_cekSesi_validToken,
    test_cekSesi_expiredToken,
    test_cekSesi_invalidToken,
    test_logout_clearsSession,
    
    // Arsip Tests
    test_getAll_returnsArray,
    test_simpan_validData,
    test_simpan_missingRequiredFields,
    test_editData_correctRowIndex,
    test_hapusData_decreasesRowCount,
    test_resetNomor_sequentialNumbers,
    test_batchUpdateKeterangan_correctColumn,
    test_getKodeKlasifikasi_noDuplicates,
    
    // Surat Tests
    test_simpanSM_autoNumber,
    test_editDataSM_correctRow,
    test_hapusDataSM_renumber,
    test_formatTanggal_dateObject,
    test_formatTanggal_stringInput,
    test_simpanSPPD_autoNumber,
    test_simpanSK_autoNumber,
    test_getAllSM_minColumns,
    
    // Upload Tests
    test_uploadFileToDrive_invalidBase64,
    test_cekDuplikasiFile_emptyHash,
    test_cekDuplikasiFile_existingHash,
    test_deleteDriveFileByUrl_invalidUrl,
    
    // Cache Tests
    test_getAll_cacheHit,
    test_invalidateCache_afterSimpan,
    test_cacheSize_withinLimit
  ];

  var results = [];
  var passed = 0;
  var failed = 0;

  Logger.log('=== MEMULAI TEST RUNNER ===');
  
  for (var i = 0; i < tests.length; i++) {
    var testFn = tests[i];
    if (typeof testFn === 'function') {
      try {
        var res = testFn();
        results.push(res);
        if (res && res.passed) passed++;
        else failed++;
      } catch (e) {
        Logger.log('❌ FAIL [' + testFn.name + '] Exception: ' + e.message);
        results.push({ name: testFn.name, passed: false, error: e.message });
        failed++;
      }
    } else {
      Logger.log('⚠️ Test tidak ditemukan (undefined) di index ' + i);
    }
  }

  // Restore SHEET_ID
  SHEET_ID = ORIGINAL_SHEET_ID;

  Logger.log('=== TEST SELESAI ===');
  Logger.log('Total: ' + tests.length);
  Logger.log('✅ Passed: ' + passed);
  Logger.log('❌ Failed: ' + failed);
  
  _saveTestResults(results, passed, failed);
}

function _saveTestResults(results, passed, failed) {
  try {
    var ss = SpreadsheetApp.openById(TEST_SHEET_ID);
    var sheet = ss.getSheetByName('Test Results');
    if (!sheet) {
      sheet = ss.insertSheet('Test Results');
      sheet.appendRow(['Timestamp', 'Test Name', 'Status', 'Error Message']);
    }
    
    var timestamp = new Date();
    var rows = [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (!r) continue;
      rows.push([
        timestamp, 
        r.name || 'Unknown', 
        r.passed ? 'PASS' : 'FAIL', 
        r.error || ''
      ]);
    }
    
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    }
  } catch (e) {
    Logger.log('Gagal menyimpan hasil test ke spreadsheet: ' + e.message);
  }
}

// Helper Assertions
function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}
function assertEquals(expected, actual, message) {
  if (expected !== actual) throw new Error((message ? message + ": " : "") + "Expected '" + expected + "', but got '" + actual + "'");
}
function assertNotNull(obj, message) {
  if (obj === null || obj === undefined) throw new Error((message ? message + ": " : "") + "Expected non-null value");
}
