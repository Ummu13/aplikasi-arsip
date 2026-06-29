// ════════════════════════════════════════════════════════════════════════
//  Test_Upload.gs
//  Unit Test untuk Fungsionalitas Upload dan Integrasi Drive
// ════════════════════════════════════════════════════════════════════════

function test_uploadFileToDrive_invalidBase64() {
  try {
    var res = uploadFileToDrive("invalid_base64_string_without_comma", "test.txt", "text/plain");
    assert(res.success === false, "String base64 tidak valid harus gagal");
    Logger.log('✅ PASS [test_uploadFileToDrive_invalidBase64]');
    return { name: 'test_uploadFileToDrive_invalidBase64', passed: true };
  } catch (e) {
    return { name: 'test_uploadFileToDrive_invalidBase64', passed: false, error: e.message };
  }
}

function test_cekDuplikasiFile_emptyHash() {
  try {
    var res = cekDuplikasiFile("");
    assert(res.isDuplicate === false, "Hash kosong tidak boleh duplicate");
    Logger.log('✅ PASS [test_cekDuplikasiFile_emptyHash]');
    return { name: 'test_cekDuplikasiFile_emptyHash', passed: true };
  } catch (e) {
    return { name: 'test_cekDuplikasiFile_emptyHash', passed: false, error: e.message };
  }
}

function test_cekDuplikasiFile_existingHash() {
  try {
    // Menambahkan mock data ke sheet untuk ditest
    var sheet = getAhliMediaSheet();
    var hashMD5 = "d41d8cd98f00b204e9800998ecf8427e"; // Mock md5
    simpanAhliMedia({ Jenis_Arsip: 'Test', Semula: '', Menjadi: '', Jumlah: '', Alat: '', Waktu: '', Keterangan: '', Link_Tautan: '', File_Hash: hashMD5 });
    
    var res = cekDuplikasiFile(hashMD5);
    assert(res.isDuplicate === true, "Hash yang sudah ada harus terdeteksi duplikat");
    Logger.log('✅ PASS [test_cekDuplikasiFile_existingHash]');
    return { name: 'test_cekDuplikasiFile_existingHash', passed: true };
  } catch (e) {
    return { name: 'test_cekDuplikasiFile_existingHash', passed: false, error: e.message };
  }
}

function test_deleteDriveFileByUrl_invalidUrl() {
  try {
    // Tidak boleh crash saat dikasih URL yang salah
    deleteDriveFileByUrl("https://google.com/bukan_drive_url");
    Logger.log('✅ PASS [test_deleteDriveFileByUrl_invalidUrl]');
    return { name: 'test_deleteDriveFileByUrl_invalidUrl', passed: true };
  } catch (e) {
    return { name: 'test_deleteDriveFileByUrl_invalidUrl', passed: false, error: e.message };
  }
}
