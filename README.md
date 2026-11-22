# Drone NDVI Camera

Aplikasi Next.js untuk simulasi kamera drone menggunakan webcam komputer. Snapshot dari webcam dikirim ke service FastAPI untuk diproses menjadi analisis NDVI, lalu hasilnya ditampilkan sebagai nilai NDVI RAW, NDVI AI, klasifikasi kesehatan tanaman, dan tiga gambar hasil: NDVI, RG, serta RGR.

> Status saat ini: frontend belum menginisialisasi client Supabase dan belum melakukan upload ke Supabase secara langsung. Frontend hanya memanggil FastAPI. Supabase perlu digunakan oleh backend atau ditambahkan ke alur upload terlebih dahulu. Konfigurasi Next.js sudah mengizinkan gambar public dari bucket `snapshots` pada project Supabase yang sekarang.

## Prasyarat

- Node.js 20 atau lebih baru
- npm
- Service FastAPI untuk endpoint pemrosesan snapshot
- Browser dengan akses webcam
- Project Supabase jika backend menyimpan hasil gambar ke Storage

## Menjalankan frontend

Install dependency:

```bash
npm install
```

Buat file `.env.local` di root project:

```env
NEXT_PUBLIC_FASTAPI_URL=http://127.0.0.1:8000
```

Jalankan development server:

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Akses webcam perlu diizinkan oleh browser. Untuk deployment, gunakan URL HTTPS karena sebagian besar browser hanya mengizinkan webcam dari HTTPS atau `localhost`.

## Environment variable

| Variable                  | Wajib | Dipakai oleh | Keterangan                                             |
| ------------------------- | ----- | ------------ | ------------------------------------------------------ |
| `NEXT_PUBLIC_FASTAPI_URL` | Tidak | Frontend     | Base URL FastAPI. Default-nya `http://127.0.0.1:8000`. |

Contoh untuk backend lokal:

```env
NEXT_PUBLIC_FASTAPI_URL=http://127.0.0.1:8000
```

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` belum dibaca oleh source frontend saat ini. Jangan menaruh service role key di `.env.local` frontend atau variable yang diawali `NEXT_PUBLIC_`; service role key hanya boleh berada di backend.

## Setup Supabase Storage

Bagian ini diperlukan apabila FastAPI menyimpan gambar hasil ke Supabase Storage dan mengembalikan URL public-nya ke frontend.

1. Buat project di [Supabase Dashboard](https://supabase.com/dashboard).
2. Buka **Storage** lalu buat bucket bernama `snapshots`.
3. Jadikan bucket public jika response FastAPI mengembalikan URL seperti:
   `https://<project-ref>.supabase.co/storage/v1/object/public/snapshots/<file>`.
4. Di environment backend, isi kredensial Supabase. Nama variable bisa mengikuti library backend yang digunakan, misalnya:

   ```env
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   SUPABASE_BUCKET=snapshots
   ```

5. Jangan commit file env atau service role key. Gunakan `.env.local` untuk frontend dan env secret dari platform deployment untuk backend.

`next.config.ts` membaca hostname Supabase dari `SUPABASE_STORAGE_URL` pada `.env`. Ganti nilai tersebut jika memakai project Supabase lain, lalu restart server Next.js agar konfigurasi diperbarui.

### Kontrak endpoint FastAPI

Frontend mengirim request berikut:

```http
POST {NEXT_PUBLIC_FASTAPI_URL}/process-snapshot
Content-Type: multipart/form-data
```

Field file yang dikirim bernama `file`. Response sukses diharapkan berbentuk JSON:

```json
{
  "success": true,
  "ndviRAW": 0.72,
  "ndviAI": 0.81,
  "classification": "sehat",
  "snapshotNDVI": "https://<project-ref>.supabase.co/storage/v1/object/public/snapshots/ndvi.png",
  "snapshotRG": "https://<project-ref>.supabase.co/storage/v1/object/public/snapshots/rg.png",
  "snapshotRGR": "https://<project-ref>.supabase.co/storage/v1/object/public/snapshots/rgr.png"
}
```

Nilai `classification` yang didukung frontend adalah `sehat` dan `tidak_sehat`. Untuk response error, frontend mencoba membaca field `detail`.

## Alur aplikasi

1. `CameraPreview` meminta akses webcam melalui `navigator.mediaDevices.getUserMedia`.
2. Tombol snapshot mengambil frame video dan mengubahnya menjadi file PNG.
3. `ndiviService` mengirim file ke FastAPI pada endpoint `/process-snapshot`.
4. `PredictionCard` menampilkan nilai, klasifikasi, dan gambar hasil dari response API.

## Struktur penting

```text
src/
	app/page.tsx                    Halaman utama dan state proses
	app/api/process-ndvi/route.ts  Route API Next.js, saat ini belum diimplementasikan
	components/CameraPreview.tsx    Akses webcam dan pembuatan snapshot
	components/PredictionCard.tsx   Tampilan hasil analisis
	services/ndiviService.ts        Client HTTP ke FastAPI
	types/index.ts                  Tipe response NDVI
next.config.ts                    Konfigurasi remote image Supabase
```

## Script tersedia

```bash
npm run dev      # Development server
npm run build    # Build production
npm run start    # Menjalankan hasil build
npm run lint     # Pemeriksaan ESLint
```

Sebelum membuat pull request atau deployment, jalankan:

```bash
npm run lint
npm run build
```

## Troubleshooting

- **Webcam tidak aktif:** izinkan permission kamera dan buka aplikasi melalui `localhost` atau HTTPS.
- **Request gagal / connection refused:** pastikan FastAPI hidup dan nilai `NEXT_PUBLIC_FASTAPI_URL` benar.
- **Gambar hasil tidak tampil:** pastikan URL response dapat diakses, bucket `snapshots` public, dan hostname Supabase sudah terdaftar di `next.config.ts`.
- **Perubahan `.env.local` tidak terbaca:** restart `npm run dev` setelah mengubah environment variable.

## Referensi

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
  This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
