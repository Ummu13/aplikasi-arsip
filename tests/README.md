# Panduan Unit Testing Aplikasi Arsip

> [!NOTE]  
> Dokumen ini hanya menjelaskan cara eksekusi testing lokal. Untuk **Panduan Lengkap (End-to-End) dari testing hingga production deploy**, silakan baca **[`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)**.

Folder `tests/` berisi skrip untuk melakukan *Unit Testing* logika aplikasi langsung di *runtime* Google Apps Script (Layer 1).

Karena folder ini di-ignore oleh Clasp (didaftarkan di `.claspignore`), file-file ini **TIDAK AKAN** dikirim ke *production environment* Google Apps Script saat `clasp push`. Ini menjaga *production codebase* tetap bersih.

## Cara Menggunakan (Untuk Development Lokal/Sandbox)

Karena GAS tidak bisa mengeksekusi test lokal (harus berjalan di infrastruktur Google), Anda harus mem-bypass batasan ini di akun *sandbox* Anda.

### 1. Persiapan Sandbox
1. Buat Spreadsheet Sandbox (Duplikasi dari *production*).
2. Dapatkan ID Spreadsheet tersebut.

### 2. Copy-Paste ke Editor Online
1. Buka Apps Script Editor untuk *project sandbox* Anda.
2. Buat file baru (misal: `TestRunner.gs`, `Test_Arsip.gs`, dst).
3. Salin isi kode dari file di folder ini ke masing-masing file yang baru dibuat di editor.

### 3. Eksekusi Test
1. Buka `TestRunner.gs` di editor online.
2. Ubah baris ini:
   ```javascript
   var TEST_SHEET_ID = 'GANTI_DENGAN_ID_SPREADSHEET_TESTING_ANDA';
   ```
   menjadi ID Sandbox Anda.
3. Pilih fungsi `runAllTests` dari menu *dropdown* di bagian atas editor.
4. Klik **Jalankan** (*Run*).

### 4. Membaca Hasil
1. Buka **Log Eksekusi** di bagian bawah editor. Anda akan melihat log komplit:
   ```
   === MEMULAI TEST RUNNER ===
   ✅ PASS [test_checklogin_validCredentials]
   ✅ PASS [test_simpan_validData]
   ...
   === TEST SELESAI ===
   Total: 25
   ✅ Passed: 25
   ❌ Failed: 0
   ```
2. Aplikasi juga akan membuat Sheet baru bernama `Test Results` di dalam Spreadsheet Sandbox Anda yang merangkum hasil (PASS/FAIL) beserta timestamp eksekusi.
