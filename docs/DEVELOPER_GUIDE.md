# Developer Guide (Aplikasi Arsip Balai K3)

Panduan ini ditujukan untuk **Developer Baru** atau **AI Assistant** agar dapat langsung bekerja pada proyek ini dengan efisien tanpa perlu menebak-nebak struktur proyek.

## 1. Prasyarat Lokal
1. **Node.js**: Pastikan sudah terinstal (`v18` atau `v20`).
2. **Google Clasp**: Instal secara global (`npm install -g @google/clasp`).
3. **Login Clasp**: Jalankan `clasp login` dan otorisasi menggunakan akun Google Anda.

## 2. Struktur File & Aturan Clasp
Google Apps Script (GAS) melalui Clasp tidak mendukung struktur folder untuk file eksekusi (`.gs`, `.html`). Semua file yang dikirim ke GAS **HARUS** berada di root (terdaftar dalam `.clasp.json`).
Oleh karena itu:
- Semua file kode ada di *root* direktori.
- File dokumentasi (`docs/`), aset (`assets/`), unit testing lokal (`tests/`), dan tooling CI (`.github/`, `scripts/`) di-ignore oleh Clasp melalui file `.claspignore`.
- **Aturan CSS/HTML**: Karena keterbatasan GAS yang tidak bisa mengimpor `.css` eksternal secara langsung, maka styling per komponen dipisahkan di file berakhiran `-css.HTML` (Misal: `Dashboard-css.HTML`). File ini nantinya di-`include` ke dalam file HTML utama.

## 3. Setup Spreadsheet Testing (Sandbox)
Sebelum menulis atau mengubah fitur logika, Anda wajib menggunakan Spreadsheet terpisah untuk pengujian (agar tidak merusak data *production*).
1. Buat salinan dari Spreadsheet Produksi.
2. Kosongkan isinya, buat data dummy.
3. Di dalam `Kode.gs`, ganti variabel `SHEET_ID` dengan ID Spreadsheet Sandbox Anda saat sedang masa *development*.
   **PENTING**: Jangan pernah *commit/push* `SHEET_ID` Sandbox ke branch `main`. Pastikan mengembalikannya ke ID Produksi sebelum *deploy*.

## 4. Keamanan dan Autentikasi
Aplikasi sekarang menggunakan *hashing MD5* untuk kredensial admin.
Jika Anda menduplikasi database untuk *testing* atau database Anda masih berisi teks biasa:
1. Buka Apps Script Editor secara online.
2. Cari dan jalankan fungsi `utils_hashExistingPasswords()` satu kali.
3. Password di Spreadsheet akan otomatis terenkripsi menjadi Hash MD5 (32 karakter).

## 5. Cara Menjalankan Unit Testing
Kami memiliki arsitektur Unit Testing *in-GAS* yang ditaruh di folder `tests/`. Karena Clasp mengabaikan folder ini saat push ke production, file test tidak akan mengotori env produksi.
Namun, saat *development*:
1. Tarik/copy konten dari file `tests/TestRunner.gs` dan file test lainnya (`Test_*.gs`).
2. Tempel/Buat file baru di Apps Script Editor online Anda.
3. Buka file `TestRunner.gs` di editor online, ganti `TEST_SHEET_ID` dengan ID Sandbox Anda.
4. Jalankan fungsi `runAllTests()`.
5. Cek tab eksekusi / log untuk melihat jumlah PASS dan FAIL. Hasil test juga akan dituliskan ke tab `Test Results` di Spreadsheet Sandbox Anda.

## 6. Static Analysis (Linter & Struktur)
Setiap kali Anda mencoba deploy, GitHub Actions akan menjalankan linter. Untuk mengecek sendiri secara lokal:
```bash
npm install
npm run lint
npm run validate
```
Jika gagal, perbaiki error tersebut sebelum *commit*.

## 7. Troubleshooting Umum
- **"The script completed but the returned value is not a supported return type."**
  Terjadi karena `google.script.run` mencoba mengembalikan Objek Date atau elemen DOM. Pastikan backend (`Kode.gs`) selalu me-*return* JSON/String/Array murni.
- **Data Tidak Tampil Setelah Disimpan**
  Kemungkinan ada bug pada cache. Pastikan semua fungsi mutasi (simpan/edit/hapus) di `Kode.gs` memanggil fungsi `_invalidateCache()`.
- **Performa Lemot (Loading lama)**
  Pastikan `CacheService` berjalan. Baca `getAll()` di `Kode.gs` untuk melihat cara cache mengambil alih beban SpreadsheetApp.
