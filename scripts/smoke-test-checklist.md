# Manual Smoke Test Checklist

> [!NOTE]  
> Ini adalah referensi cepat. Untuk **Panduan Lengkap (End-to-End) dari coding hingga production deploy**, silakan baca **[`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)**.

**PENTING:** Karena Google Apps Script memanipulasi Google Drive dan Google Sheets secara langsung, tidak semua aspek dapat dites secara otomatis tanpa akun Service. Anda HARUS menjalankan tes manual berikut pada Spreadsheet Testing / Sandbox sebelum merge atau mendeploy versi ini secara publik.

## Persiapan (Sandbox)
- [ ] Buka Aplikasi Web di URL development (dev deployment URL dari Clasp).
- [ ] Buka Spreadsheet Sandbox.
- [ ] Ganti sementara (atau pastikan env sudah menggunakan) `SHEET_ID` menjadi ID Spreadsheet Sandbox (bukan produksi!).

## 1. Modul Autentikasi
- [ ] Login dengan kredensial salah (harus ditolak).
- [ ] Login dengan kredensial benar (harus masuk ke Dashboard).
- [ ] Biarkan idle selama > 8 jam, refresh halaman (sesi harus kadaluwarsa, dikembalikan ke login).
- [ ] Klik Logout (sesi terhapus, dikembalikan ke login).

## 2. Modul Data (Arsip, Surat Masuk, Keluar, SPPD)
- [ ] **Create:** Tambah 1 data Arsip baru. Pastikan nomor berurut dengan benar dan data tersimpan ke baris terakhir di Spreadsheet Sandbox.
- [ ] **Read:** Pastikan tabel menampilkan data yang baru ditambah.
- [ ] **Update:** Edit data yang baru ditambah. Ganti judul/perihal, lalu simpan. Pastikan tabel dan Spreadsheet Sandbox terupdate.
- [ ] **Delete:** Hapus data tersebut. Pastikan data hilang dari tabel dan Spreadsheet Sandbox.

## 3. Integrasi Drive (Upload Berkas)
- [ ] Tambahkan data baru beserta file PDF kecil (contoh 100kb).
- [ ] Pastikan upload sukses dan link tautan file muncul di Spreadsheet.
- [ ] Buka Google Drive folder `ID_FOLDER` atau `ID_FOLDER_SURAT_KELUAR`, pastikan file PDF ada di sana.
- [ ] Hapus data tersebut dari aplikasi.
- [ ] Cek Google Drive kembali. Pastikan file PDF terkait **TIDAK ADA** (terhapus otomatis).

## 4. Performa & Cache
- [ ] Tambahkan banyak data (> 10 baris) dengan cepat.
- [ ] Refresh tabel beberapa kali berturut-turut. Harus terasa instan (indikasi `CacheService` bekerja memotong panggilan langsung ke SpreadsheetApp).

## Pengesahan
Jika semua centang sudah diuji dan berhasil tanpa error di konsol browser, Anda dapat memberikan *approve* pada Pull Request ini atau merespons Issue ini dengan `[x] All tests passed. Ready for production deploy.`
