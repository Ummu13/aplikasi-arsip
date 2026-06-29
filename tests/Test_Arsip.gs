// ════════════════════════════════════════════════════════════════════════
//  Test_Arsip.gs
//  Unit Test untuk Modul Database Arsip
// ════════════════════════════════════════════════════════════════════════

function test_getAll_returnsArray() {
  try {
    var data = getAll();
    assert(Array.isArray(data), "getAll() harus mereturn Array");
    Logger.log('✅ PASS [test_getAll_returnsArray]');
    return { name: 'test_getAll_returnsArray', passed: true };
  } catch (e) {
    return { name: 'test_getAll_returnsArray', passed: false, error: e.message };
  }
}

function test_simpan_validData() {
  try {
    var initCount = _readAllFromSheet().length;
    var mockData = {
      No_Berkas: 'TEST-001', No_Item_Arsip: '1', Kode_Klasifikasi: '000',
      Judul: 'Test Arsip', Tanggal_Surat: '2023-01-01', Jumlah: 1,
      Tingkat_Perkembangan: 'Asli', Klasifikasi_Keamanan: 'Biasa',
      Akses_Publik: 'Terbuka', Hak_Akses: 'Semua', Dasar_Pertimbangan: '',
      Keterangan: 'TESTING', Lokasi: 'Rak 1', No_Bok: 'B1', Link_Tautan: ''
    };
    simpan(mockData);
    var finalCount = _readAllFromSheet().length;
    assert(finalCount === initCount + 1, "Baris baru gagal ditambahkan");
    Logger.log('✅ PASS [test_simpan_validData]');
    return { name: 'test_simpan_validData', passed: true };
  } catch (e) {
    return { name: 'test_simpan_validData', passed: false, error: e.message };
  }
}

function test_simpan_missingRequiredFields() {
  try {
    // Should not crash, just save empty strings
    simpan({ Judul: 'Test Missing Fields' }); 
    Logger.log('✅ PASS [test_simpan_missingRequiredFields]');
    return { name: 'test_simpan_missingRequiredFields', passed: true };
  } catch (e) {
    return { name: 'test_simpan_missingRequiredFields', passed: false, error: e.message };
  }
}

function test_editData_correctRowIndex() {
  try {
    var data = getAll();
    if (data.length > 0) {
      var targetRow = data.length - 1; // Test edit row terakhir
      var mockData = {
        rowIndex: targetRow, No_Berkas: 'EDIT-001', No_Item_Arsip: '1', 
        Kode_Klasifikasi: '000', Judul: 'Edited Title', Tanggal_Surat: '2023-01-01', 
        Jumlah: 1, Tingkat_Perkembangan: 'Asli', Klasifikasi_Keamanan: 'Biasa',
        Akses_Publik: 'Terbuka', Hak_Akses: 'Semua', Dasar_Pertimbangan: '',
        Keterangan: 'TESTING', Lokasi: 'Rak 1', No_Bok: 'B1', Link_Tautan: ''
      };
      editData(mockData);
      var afterEdit = _readAllFromSheet();
      assert(afterEdit[targetRow][4] === 'Edited Title', "Judul gagal diubah");
    }
    Logger.log('✅ PASS [test_editData_correctRowIndex]');
    return { name: 'test_editData_correctRowIndex', passed: true };
  } catch (e) {
    return { name: 'test_editData_correctRowIndex', passed: false, error: e.message };
  }
}

function test_hapusData_decreasesRowCount() {
  try {
    var initCount = _readAllFromSheet().length;
    if (initCount > 0) {
      hapusData(initCount - 1); // Hapus baris terakhir
      var finalCount = _readAllFromSheet().length;
      assert(finalCount === initCount - 1, "Baris gagal dihapus");
    }
    Logger.log('✅ PASS [test_hapusData_decreasesRowCount]');
    return { name: 'test_hapusData_decreasesRowCount', passed: true };
  } catch (e) {
    return { name: 'test_hapusData_decreasesRowCount', passed: false, error: e.message };
  }
}

function test_resetNomor_sequentialNumbers() {
  try {
    resetNomor();
    var data = _readAllFromSheet();
    if (data.length > 0) {
      assert(data[0][0].toString() === "1", "Nomor pertama harus 1");
      if (data.length > 1) {
        assert(data[1][0].toString() === "2", "Nomor kedua harus 2");
      }
    }
    Logger.log('✅ PASS [test_resetNomor_sequentialNumbers]');
    return { name: 'test_resetNomor_sequentialNumbers', passed: true };
  } catch (e) {
    return { name: 'test_resetNomor_sequentialNumbers', passed: false, error: e.message };
  }
}

function test_batchUpdateKeterangan_correctColumn() {
  try {
    var data = _readAllFromSheet();
    if (data.length > 0) {
      batchUpdateKeterangan([{ rowIndex: 0, keterangan: 'UPDATED BATCH' }]);
      var afterUpdate = _readAllFromSheet();
      assert(afterUpdate[0][12] === 'UPDATED BATCH', "Gagal update batch keterangan");
    }
    Logger.log('✅ PASS [test_batchUpdateKeterangan_correctColumn]');
    return { name: 'test_batchUpdateKeterangan_correctColumn', passed: true };
  } catch (e) {
    return { name: 'test_batchUpdateKeterangan_correctColumn', passed: false, error: e.message };
  }
}

function test_getKodeKlasifikasi_noDuplicates() {
  try {
    var kodes = getKodeKlasifikasi();
    var keys = kodes.map(function(k) { return k.kode; });
    var uniqueKeys = keys.filter(function(v, i, a) { return a.indexOf(v) === i; });
    assert(keys.length === uniqueKeys.length, "Terdapat duplikasi kode klasifikasi");
    Logger.log('✅ PASS [test_getKodeKlasifikasi_noDuplicates]');
    return { name: 'test_getKodeKlasifikasi_noDuplicates', passed: true };
  } catch (e) {
    return { name: 'test_getKodeKlasifikasi_noDuplicates', passed: false, error: e.message };
  }
}
