# PulseAI (AI Business)

Proyek ini adalah aplikasi React yang dibangun menggunakan [Vite](https://vitejs.dev/) dan TypeScript.

## Persyaratan Sistem

Sebelum menginstal dan menjalankan proyek ini di komputer lokal Anda, pastikan Anda telah menginstal perangkat lunak berikut:

- [Node.js](https://nodejs.org/) (Disarankan versi 18 atau lebih baru)
- npm (Biasanya sudah terinstal bersama Node.js)

## Cara Instalasi dan Menjalankan di Lokal

Ikuti langkah-langkah berikut untuk menjalankan proyek ini di mesin lokal Anda:

1. **Clone repository atau buka folder proyek ini** di terminal Anda.
   ```bash
   cd pulseai
   ```

2. **Instal dependensi**
   Jalankan perintah berikut untuk menginstal semua library dan dependensi yang dibutuhkan:
   ```bash
   npm install
   ```

3. **Konfigurasi Environment Variables**
   Proyek ini membutuhkan file konfigurasi `.env`. 
   - Salin file `.env.example` (jika ada) menjadi `.env` atau pastikan Anda sudah memiliki file `.env` dengan variabel yang dibutuhkan seperti konfigurasi Supabase dan Midtrans.
   
4. **Jalankan Development Server**
   Setelah semua dependensi terinstal, jalankan server pengembangan lokal dengan perintah:
   ```bash
   npm run dev
   ```

5. **Buka di Browser**
   Buka browser Anda dan akses URL yang tertera di terminal (biasanya `http://localhost:5173`).

## Struktur Folder Utama

- `src/` - Kode utama aplikasi React
- `server/` - Backend / Server (jika Anda ingin menjalankan backend terpisah, mungkin diperlukan perintah `npm run` yang berbeda di dalam folder ini)
- `whatsapp-gateway/` - Layanan gateway WhatsApp
- `public/` - Aset statis

## Scripts yang Tersedia

- `npm run dev` : Menjalankan aplikasi dalam mode development.
- `npm run build` : Membangun aplikasi untuk produksi.
- `npm run lint` : Menjalankan linter untuk memeriksa kualitas kode.
- `npm run preview` : Menjalankan server lokal untuk melihat hasil build produksi.
