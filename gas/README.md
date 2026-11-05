# Deploy Demografi PK-287 ke Google Apps Script

## 1. Siapkan Google Sheet
Upload `Database Peserta PK-278 (1).xlsx` ke Google Drive → **Open with Google Sheets**.
Pastikan sheet **`Cleaning Database PK-287`** ada dan header di baris 1 tidak diubah
(kolom yang dipakai: Jenis Kelamin, Provinsi Asal, Wilayah Asal, Jenjang, Lokasi Studi,
Skema Beasiswa, Sub Skema Beasiswa, Rumpun Studi, Sub Rumpun Studi, Jenjang (S2/S3/Sp),
Kelompok Profesi, Jenis Profesi, Negara Tujuan (Utama), Kawasan Tujuan,
Universitas Tujuan (Standar), Kelompok Usia).

## 2. Buat project Apps Script
1. Di Google Sheet: **Extensions → Apps Script**.
2. Ganti isi `Code.gs` dengan isi file `gas/Code.gs`.
3. **+ → HTML**, beri nama **`index`** (tanpa .html), tempel seluruh isi `index.html` dari root project.
4. (Opsional) Isi `CONFIG.LOGO_URL` dengan URL logo yang bisa diakses publik, dan
   `CONFIG.SITE_URL` dengan alamat situs untuk tag SEO (canonical / Open Graph).
5. Simpan, lalu jalankan fungsi `logSummary` sekali untuk memberi izin akses (Authorize).

## 3. Deploy
**Deploy → New deployment → Web app**
- Execute as: **Me**
- Who has access: **Anyone**

URL yang didapat:
- `https://script.google.com/macros/s/XXXX/exec` → halaman dashboard
- `https://script.google.com/macros/s/XXXX/exec?format=json` → JSON agregat

Setiap kali Code.gs / index diubah: **Deploy → Manage deployments → Edit → Version: New version**.

## 4. (Disarankan untuk SEO) Hosting halaman di luar Apps Script
Halaman Apps Script dibungkus iframe, jadi kurang terbaca mesin pencari.
Untuk SEO terbaik, hosting folder ini (index.html + asset/) di GitHub Pages / Netlify / Vercel, lalu di `index.html` isi:

```js
var CONFIG = { API_URL: 'https://script.google.com/macros/s/XXXX/exec?format=json' };
```

Ganti juga `https://pk287.example/` di bagian `<head>` dengan domain Anda.

## Privasi
`getSummary()` hanya mengirim **jumlah per kategori**. Nama, NIK, kontak, alamat, email,
dan data pribadi lain tidak pernah dikirim ke browser. Data di-cache 10 menit; pakai menu
**Demografi Web → Refresh data web** di spreadsheet untuk memperbarui segera.

**Jangan** commit/unggah file Excel ke repositori publik, karena isinya data pribadi peserta.
