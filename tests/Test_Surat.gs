// ════════════════════════════════════════════════════════════════════════
//  Test_Surat.gs
//  Unit Test untuk Modul Surat Masuk, Keluar, dan SPPD
// ════════════════════════════════════════════════════════════════════════

function test_simpanSM_autoNumber() {
  try {
    var initData = getAllSM();
    var lastNo = initData.length > 0 ? parseInt(initData[initData.length-1][0]) || 0 : 0;
    
    simpanSM({ Nomor_Urut: '1', Nomor_Berkas: 'SM-001', Asal_Surat: 'Kantor', Tanggal_Surat: '2023-01-01', Nomor_Surat: '123', Perihal: 'Test', Jenis_Surat: 'Biasa', Link_File_Tautan: '' });
    
    var finalData = getAllSM();
    var newNo = parseInt(finalData[finalData.length-1][0]);
    assert(newNo === lastNo + 1 || (initData.length === 0 && newNo === 1), "Auto number SM gagal");
    Logger.log('✅ PASS [test_simpanSM_autoNumber]');
    return { name: 'test_simpanSM_autoNumber', passed: true };
  } catch (e) {
    return { name: 'test_simpanSM_autoNumber', passed: false, error: e.message };
  }
}

function test_editDataSM_correctRow() {
  try {
    var data = getAllSM();
    if (data.length > 0) {
      var targetRow = data.length - 1;
      editDataSM({ rowIndex: targetRow, Nomor_Urut: '99', Nomor_Berkas: 'EDITED', Asal_Surat: '', Tanggal_Surat: '', Nomor_Surat: '', Perihal: '', Jenis_Surat: '', Link_File_Tautan: '' });
      var finalData = getAllSM();
      assert(finalData[targetRow][2] === 'EDITED', "Edit data SM gagal");
    }
    Logger.log('✅ PASS [test_editDataSM_correctRow]');
    return { name: 'test_editDataSM_correctRow', passed: true };
  } catch (e) {
    return { name: 'test_editDataSM_correctRow', passed: false, error: e.message };
  }
}

function test_hapusDataSM_renumber() {
  try {
    var data = getAllSM();
    if (data.length > 0) {
      hapusDataSM(data.length - 1);
      var finalData = getAllSM();
      if (finalData.length > 0) {
        assert(finalData[0][0] == 1, "Renumber setelah hapus gagal");
      }
    }
    Logger.log('✅ PASS [test_hapusDataSM_renumber]');
    return { name: 'test_hapusDataSM_renumber', passed: true };
  } catch (e) {
    return { name: 'test_hapusDataSM_renumber', passed: false, error: e.message };
  }
}

function test_formatTanggal_dateObject() {
  try {
    var dateObj = new Date(2023, 0, 15); // Month is 0-indexed in JS (0 = Jan)
    var formatted = formatTanggal(dateObj);
    assert(formatted === '2023-01-15', "Format Date obj gagal. Got: " + formatted);
    Logger.log('✅ PASS [test_formatTanggal_dateObject]');
    return { name: 'test_formatTanggal_dateObject', passed: true };
  } catch (e) {
    return { name: 'test_formatTanggal_dateObject', passed: false, error: e.message };
  }
}

function test_formatTanggal_stringInput() {
  try {
    var strDate = "2023-05-20";
    var formatted = formatTanggal(strDate);
    assert(formatted === "2023-05-20", "Format string input berubah. Got: " + formatted);
    Logger.log('✅ PASS [test_formatTanggal_stringInput]');
    return { name: 'test_formatTanggal_stringInput', passed: true };
  } catch (e) {
    return { name: 'test_formatTanggal_stringInput', passed: false, error: e.message };
  }
}

function test_simpanSPPD_autoNumber() {
  try {
    var initData = getAllSPPD();
    simpanSPPD({ No_Urut: '1', No_SPPD: 'SPPD-01', Nama: 'Budi', Tujuan_SPPD: 'Rapat', Tempat_Tujuan_SPPD: 'Jakarta', Dari: '2023-01-01', Sampai: '2023-01-02', Tanggal_SPPD: '2023-01-01' });
    var finalData = getAllSPPD();
    assert(finalData.length === initData.length + 1, "Data SPPD gagal disimpan");
    Logger.log('✅ PASS [test_simpanSPPD_autoNumber]');
    return { name: 'test_simpanSPPD_autoNumber', passed: true };
  } catch (e) {
    return { name: 'test_simpanSPPD_autoNumber', passed: false, error: e.message };
  }
}

function test_simpanSK_autoNumber() {
  try {
    var initData = getAllSK();
    simpanSK({ Nomor_Urut: '1', Nomor_Berkas: 'SK-01', Tanggal: '2023-01-01', Penerima: 'Kantor', Perihal: 'Tes', Kode_Klasifikasi: '000', Jenis_Surat: 'Biasa', Link_File_Tautan: '' });
    var finalData = getAllSK();
    assert(finalData.length === initData.length + 1, "Data Surat Keluar gagal disimpan");
    Logger.log('✅ PASS [test_simpanSK_autoNumber]');
    return { name: 'test_simpanSK_autoNumber', passed: true };
  } catch (e) {
    return { name: 'test_simpanSK_autoNumber', passed: false, error: e.message };
  }
}

function test_getAllSM_minColumns() {
  try {
    var data = getAllSM();
    if (data.length > 0) {
      assert(data[0].length === 9, "Data Surat Masuk harus mengembalikan tepat 9 elemen (0-8)");
    }
    Logger.log('✅ PASS [test_getAllSM_minColumns]');
    return { name: 'test_getAllSM_minColumns', passed: true };
  } catch (e) {
    return { name: 'test_getAllSM_minColumns', passed: false, error: e.message };
  }
}
