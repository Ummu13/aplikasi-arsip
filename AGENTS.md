# Panduan Pengembangan AI Agent (AGENTS.md)
*Aplikasi Arsip Balai K3 — Lingkungan Google Apps Script & Clasp*

Dokumen ini adalah panduan lengkap bagi AI Agent (atau pengembang baru) untuk memahami ekosistem, pola pengembangan, batasan platform, serta praktik terbaik dalam memelihara dan mengembangkan **Aplikasi Arsip Balai K3**.

---

## 1. Pendahuluan & Ringkasan Proyek
Proyek ini adalah **Sistem Informasi Kearsipan Digital** berbasis web yang dideploy sebagai Google Apps Script (GAS) Web Application. Seluruh sistem memanfaatkan ekosistem Google secara maksimal:
- **Frontend:** HTML5, CSS (Vanilla & Tailwind CSS CDN), dan Javascript murni (V8 Engine).
- **Backend:** Google Apps Script (`Kode.gs`) yang bertindak sebagai controller dan middleware.
- **Database:** Google Sheets yang diakses menggunakan `SpreadsheetApp`.
- **Penyimpanan Berkas:** Google Drive yang diatur dalam struktur folder hierarkis.

---

## 2. Struktur Proyek & Konvensi Berkas
Proyek dikelola menggunakan **Google Clasp (Command Line Apps Script Projects)**. Struktur berkas di workspace lokal adalah sebagai berikut:

```text
/
├── .clasp.json             # Konfigurasi Clasp (Script ID)
├── .claspignore            # Daftar file/folder yang diabaikan saat push
├── appsscript.json         # Manifest konfigurasi runtime, webapp, dan scopes GAS
├── Kode.gs                 # Backend controller utama (Logic & API)
├── Dashboard.HTML          # Template UI utama Dashboard
├── Dashboard-css.HTML      # Styling CSS spesifik untuk Dashboard
├── Navbar.HTML             # Komponen Navbar
├── Navbar-css.HTML         # Styling CSS spesifik Navbar
├── Sidebar.HTML            # Komponen Sidebar
├── Sidebar-css.HTML        # Styling CSS spesifik Sidebar
├── formArsip.HTML          # Halaman & Form Manajemen Arsip Utama
├── formArsip-css.HTML      # Styling CSS spesifik Form Arsip
├── formAhliMedia.HTML      # Halaman & Form Arsip Alih Media
├── formAhliMedia-css.HTML  # Styling CSS spesifik Alih Media
├── formSPPD.HTML           # Halaman & Form SPPD (Surat Perjalanan Dinas)
├── formSPPD-css.HTML       # Styling CSS spesifik SPPD
├── formSM.HTML             # Halaman & Form Surat Masuk
├── formSM-css.HTML         # Styling CSS spesifik Surat Masuk
├── formSK.HTML             # Halaman & Form Surat Keluar
├── formSK-css.HTML         # Styling CSS spesifik Surat Keluar
├── formQR.HTML             # Halaman & Form QR Code Generator/Scanner
├── formQR-css.HTML         # Styling CSS spesifik QR Code
├── login.HTML              # Halaman Login
├── login-css.HTML          # Styling CSS spesifik Login
├── session-helper.HTML     # Script Utility Client-Side untuk Sesi & Loading
└── readme.md               # Dokumentasi Ringkas (Katalog Berkas)
```

### Konvensi Pemisahan CSS & HTML
Karena keterbatasan Google Apps Script yang tidak mengizinkan referensi berkas `.css` atau `.js` eksternal secara langsung, semua style dipisahkan ke dalam berkas `-css.HTML` (berisi tag `<style>`). 
Komponen ini dimasukkan ke berkas HTML utama menggunakan fungsi pembantu di `Kode.gs`:
```javascript
// Di Kode.gs
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
```
**Contoh penggunaan di file HTML:**
```html
<!-- Di bagian head formArsip.HTML -->
<?!= include('formArsip-css'); ?>
```

---

## 3. Batasan Google Apps Script (GAS) & Pola Optimasi
Sebagai AI Agent, Anda **wajib** memahami batasan teknis Google Apps Script untuk menghindari *Runtime Error* atau performa yang sangat lambat (*latency* tinggi). Kode saat ini telah dioptimalkan dengan pola berikut:

### A. Spreadsheet Read/Write Contention (Bypass Limit)
- **Masalah:** Membaca data langsung dari Spreadsheet menggunakan `SpreadsheetApp` pada setiap request sangat lambat (~800ms - 2s) dan rentan terkena limit kuota baca harian jika diakses banyak pengguna secara bersamaan.
- **Solusi (Pola Cache):** Gunakan `CacheService` (in-memory cache Google) untuk mem-bypass hit langsung ke Spreadsheet.
  - Halaman dashboard/list mengambil data melalui `getAll()` yang memuat cache selama 60 detik (`CACHE_TTL = 60`).
  - Setiap kali ada aksi mutasi data (`simpan`, `editData`, `hapusData`), cache **wajib di-invalidate** melalui fungsi `_invalidateCache()`.
  
### B. Optimasi Validasi Sesi (`cekSesi`)
- **Masalah:** Fungsi pengecekan sesi di-load di setiap perpindahan halaman dan memakan waktu lama jika terus menulis/membaca ke `ScriptProperties`.
- **Solusi:**
  - `cekSesi` menggunakan `CacheService.getScriptCache()` dengan TTL 5 menit (`300` detik) sebagai lapisan validasi cepat (latensi turun dari ~800ms ke ~100ms).
  - sliding session (pembaruan waktu aktif token) di `ScriptProperties` hanya dijalankan jika selisih waktu update terakhir dengan waktu saat ini lebih dari 10 menit (`now - sTime > 10 * 60 * 1000`). Ini menghemat operasi tulis properti secara signifikan.

### C. Penanganan Cold-Start & Network Timeout
- **Masalah:** Eksekusi backend Google Apps Script yang tidak aktif selama beberapa waktu (cold start) dapat memakan waktu 8 hingga 10 detik untuk bangun, membuat UI terlihat "hang" (stuck loading).
- **Solusi:**
  - `session-helper.HTML` dilengkapi **Global Timeout Fallback selama 12 detik**. Jika `google.script.run.cekSesi` tidak merespons dalam 12 detik, overlay loading secara otomatis dihapus dan user diarahkan kembali ke login, mencegah aplikasi macet tanpa kejelasan.

---

## 4. Alur Interaksi Klien-Server (`google.script.run`)
Semua komunikasi data antara client-side JS dan server-side GAS dilakukan secara asinkron menggunakan API bawaan `google.script.run` dengan handler sukses dan gagal.

### Contoh Pola Pemanggilan yang Benar:
```javascript
// Di sisi Client-side (HTML/JS)
google.script.run
  .withSuccessHandler(function(response) {
    if (response.success) {
      Swal.fire('Berhasil!', response.message, 'success');
      // Segarkan tabel data
    } else {
      Swal.fire('Gagal', response.message, 'error');
    }
  })
  .withFailureHandler(function(error) {
    Swal.fire('Error', 'Terjadi kesalahan sistem: ' + error.message, 'error');
  })
  .simpan(formData);
```

---

## 5. Panduan Workflow Clasp untuk AI Agent
Jika Anda diminta untuk memperbarui atau menguji kode secara lokal:
1. Pastikan file konfigurasi `.clasp.json` terhubung dengan ID Script yang benar.
2. Gunakan `clasp pull` untuk mengunduh perubahan dari server Google Apps Script (jika user mengedit dari web editor).
3. Gunakan `clasp push` untuk mengunggah semua perubahan berkas lokal ke server Apps Script.
4. Gunakan `clasp deploy` atau periksa deploy link secara langsung untuk memastikan versi web app terbaru telah berjalan.

---

## 6. Checklist untuk AI Agent Sebelum Mengirim Kode
Sebelum Anda menyatakan pekerjaan selesai, verifikasi hal-hal berikut:
- [ ] Apakah fungsi mutasi data baru sudah memanggil `_invalidateCache()`?
- [ ] Apakah Anda menghindari penggunaan `SpreadsheetApp.getActiveSpreadsheet()` dalam loop atau fungsi yang berulang? (Gunakan `SpreadsheetApp.openById(SHEET_ID)` yang di-cache di awal fungsi).
- [ ] Apakah Anda telah memisahkan kode CSS baru ke dalam berkas `-css.HTML` dan menyisipkannya dengan `include`?
- [ ] Apakah penanganan tanggal telah diformat secara aman (`YYYY-MM-DD`) sebelum masuk ke Spreadsheet atau ditarik ke Frontend? (Gunakan helper `formatTanggal` atau pengecekan `instanceof Date`).
- [ ] Apakah proses upload file ke Google Drive sudah memberikan izin `ANYONE_WITH_LINK` & `VIEW` agar link tautan dapat diakses oleh user umum?
- [ ] Apakah ada penanganan error yang memadai (`try-catch` di backend dan `.withFailureHandler` di frontend)?
