# Panduan Kontribusi (Contributing Guide)

Terima kasih telah berkontribusi! Untuk menjaga kode tetap teratur, mudah dipahami, dan *history* yang bersih, mohon patuhi konvensi berikut sebelum Anda *commit* dan *push* perubahan Anda.

---

## 1. Branching Strategy

- **`main`**: Ini adalah branch *Production*. Setiap kali kode di-push ke branch ini, GitHub Actions akan langsung men-deploynya secara live ke pengguna (Google Apps Script).
- **`dev/<nama-fitur>`** atau **`fix/<nama-bug>`**: Ini adalah branch untuk Anda bekerja. Jangan langsung commit ke `main` jika Anda sedang membangun fitur yang butuh berhari-hari.

**Alur yang benar:**
1. `git checkout -b feat/tambah-filter-tanggal`
2. Kerjakan fitur Anda.
3. Commit dan push branch Anda.
4. Buat *Pull Request* (PR) ke branch `main`.

---

## 2. Konvensi Pesan Commit

Kami menggunakan adaptasi [Conventional Commits](https://www.conventionalcommits.org/) dalam bahasa Indonesia (atau Inggris) agar *history* mudah dibaca. Format pesan commit digunakan oleh *clasp* sebagai nama versi saat deployment ke Apps Script.

**Format:**
`<tipe>: <deskripsi singkat>`

**Tipe yang diizinkan:**
- `feat:` (Menambah fitur baru) — *Contoh: feat: menambahkan export laporan bulanan*
- `fix:` (Memperbaiki bug) — *Contoh: fix: memperbaiki loading tabel yang lambat*
- `docs:` (Hanya perubahan dokumentasi/readme) — *Contoh: docs: memperbarui panduan setup lokal*
- `style:` (Perubahan format kode, CSS, spasi, tidak mengubah logika) — *Contoh: style: merapikan padding di dashboard*
- `refactor:` (Perubahan struktur kode tapi tidak menambah/menghapus fitur) — *Contoh: refactor: memisahkan logika auth ke file terpisah*
- `test:` (Menambahkan/memperbaiki unit test) — *Contoh: test: menambah test untuk modul ekspor*
- `chore:` (Perbaikan kecil pada setup, dependensi, CI/CD) — *Contoh: chore: update action nodejs ke versi 20*

---

## 3. Aturan Jangan Di-Commit

Karena sifat Google Apps Script yang menyimpan rahasia langsung di dalam kode, Anda harus sangat berhati-hati sebelum menekan perintah `git commit`:

> [!CAUTION]
> 1. **`SHEET_ID` Sandbox:** Pastikan variabel `SHEET_ID` di `Kode.gs` mengarah kembali ke **ID SPREADSHEET PRODUKSI** sebelum commit. Jika Anda meng-commit ID Sandbox Anda, production app akan membaca database dummy.
> 2. **File `.clasprc.json`:** Ini adalah *credential token* Google rahasia Anda. (Sudah dicegah oleh `.gitignore`, tapi pastikan ulang).
> 3. **Folder `node_modules/`:** Tidak relevan di-deploy.
> 4. **Aset Gambar / Video:** Jangan upload ke dalam root folder untuk di-push ke Apps Script (simpan di `assets/` yang sudah di-ignore).

---

## 4. Checklist Pra-Pull Request (PR)

Sebelum meminta anggota tim lain (atau CI/CD) mengecek pekerjaan Anda, pastikan:
- [ ] Kode sudah mengikuti struktur *Layered Architecture* (Lihat `ARCHITECTURE.md`).
- [ ] Fungsi *mutasi* pada data (Save, Edit, Delete) sudah memanggil `_invalidateCache()`.
- [ ] Kode lulus pengecekan linter lokal (`npm run validate`).
- [ ] (Opsional tapi sangat dianjurkan) Anda sudah menjalankan test di Sandbox (`tests/`).
