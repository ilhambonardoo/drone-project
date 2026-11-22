# Drone Camera — Dashboard Analisis Citra MAPIR

Dashboard Next.js untuk memperoleh citra dari kamera multispektral MAPIR Survey3 melalui API DreamPalm, menjalankan inferensi NDVI/CNN melalui FastAPI, lalu menampilkan hasil klasifikasi, nilai NDVI, kanal spektral, dan citra hasil.

## Ringkasan Fitur

- Live preview kamera melalui iframe stream MAPIR.
- Pemeriksaan status kesiapan kamera dan busy capture setiap 5 detik.
- Pemicu capture melalui Next.js API route.
- Polling status capture hingga selesai atau gagal.
- Pengiriman gambar JPG hasil capture ke layanan FastAPI.
- Tampilan klasifikasi **Sehat** atau **Terserang** beserta skor CNN.
- Tampilan nilai NDVI, kanal Green/Red/NIR, dan persentase piksel valid.
- Preview foto capture, heatmap NDVI, serta tautan unduh JPG dan RAW asli.
- Guardrail visual untuk mode radiometrik sementara dan penyemprotan otomatis.

## Arsitektur

```text
Browser
  |  GET /api/mapir/health
  |  POST /api/mapir/capture
  |  GET /api/mapir/status/:captureId
  v
Next.js Server Routes
  |  X-DreamPalm-Key
  v
DreamPalm MAPIR API
  |  status, JPG, RAW
  v
Next.js Status Route
  |  multipart/form-data file=<capture-id>.jpg
  v
FastAPI ML API (/process-snapshot)
  |  hasil klasifikasi dan nilai spektral
  v
Dashboard
```

## Teknologi

- Next.js 16 dengan App Router
- React 19
- TypeScript
- Tailwind CSS 4
- FastAPI sebagai backend inferensi
- DreamPalm/Capture API untuk kamera MAPIR
- Supabase Storage untuk hosting citra hasil

## Struktur Project

```text
src/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── api/mapir/
│       ├── health/route.ts
│       ├── capture/route.ts
│       └── status/[captureId]/route.ts
├── components/
│   ├── CameraPreview.tsx
│   └── PredictionCard.tsx
├── lib/
│   └── errors.ts
└── types/
    └── index.ts

next.config.ts
env.example
```

## Prasyarat

- Node.js 20 atau lebih baru
- npm
- DreamPalm Capture API yang aktif
- Kamera MAPIR Survey3 yang terhubung dengan sistem DreamPalm
- Service FastAPI dengan endpoint `POST /process-snapshot`
- Akses ke URL stream kamera
- URL Supabase Storage bila hasil inferensi menampilkan gambar dari bucket

## Instalasi

1. Install dependency:

   ```bash
   npm install
   ```

2. Buat `.env.local` berdasarkan `env.example`:

   ```bash
   cp env.example .env.local
   ```

3. Isi environment variable yang diperlukan.

4. Jalankan development server:

   ```bash
   npm run dev
   ```

5. Buka `http://localhost:3000`.

## Environment Variable

| Variable | Scope | Wajib | Fungsi |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_MAPIR_STREAM_URL` | Browser | Tidak | URL iframe live preview MAPIR. Default: `https://stream.dreampalm.id/dreampalm/` |
| `DREAMPALM_API_URL` | Server | Ya | Base URL DreamPalm Capture API |
| `DREAMPALM_API_KEY` | Server | Ya | API key yang dikirim sebagai header `X-DreamPalm-Key` |
| `FASTAPI_URL` | Server | Tidak | Base URL FastAPI. Default: `http://127.0.0.1:8000` |
| `SUPABASE_STORAGE_URL` | Server/build | Tidak | Base URL Supabase untuk mengizinkan remote image Next.js |

Contoh konfigurasi:

```env
NEXT_PUBLIC_MAPIR_STREAM_URL=https://stream.dreampalm.id/dreampalm/
DREAMPALM_API_URL=https://api.dreampalm.id
DREAMPALM_API_KEY=<dream-palm-api-key>
FASTAPI_URL=http://127.0.0.1:8000
SUPABASE_STORAGE_URL=https://<project-ref>.supabase.co
```

> Jangan menaruh API key atau credential rahasia pada variable yang diawali `NEXT_PUBLIC_`. `DREAMPALM_API_KEY` hanya dibaca oleh Next.js server route.

Restart development server setelah mengubah environment variable.

## Kontrak API Internal

### Health

```http
GET /api/mapir/health
```

Merequest `{DREAMPALM_API_URL}/health` ke DreamPalm API. Contoh response:

```json
{
  "drone_id": "drone-01",
  "raspberry_pi": "online",
  "mapir": {
    "ready": true,
    "ip": "192.168.1.100"
  },
  "capture_busy": false
}
```

### Mulai Capture

```http
POST /api/mapir/capture
```

Merequest `POST {DREAMPALM_API_URL}/captures` dengan header:

```http
X-DreamPalm-Key: <DREAMPALM_API_KEY>
```

Response upstream perlu menyediakan `capture_id`.

### Status Capture

```http
GET /api/mapir/status/<captureId>
```

Frontend melakukan polling route ini setiap 1.5 detik. Saat status belum selesai, response berasal langsung dari upstream. Saat status `completed`, route mengunduh file JPG dari URL upstream, mengirimnya ke FastAPI sebagai multipart field `file`, lalu mengembalikan:

```json
{
  "status": "completed",
  "capture_id": "capture-123",
  "originalJpgUrl": "https://api.dreampalm.id/v1/mapir/captures/capture-123.jpg",
  "originalRawUrl": "https://api.dreampalm.id/v1/mapir/captures/capture-123.raw",
  "mlResult": {
    "success": true,
    "filename": "capture-123.jpg",
    "modelName": "DreamPalm-NDVI-CNN",
    "modelStatus": "active",
    "classification": "Sehat",
    "classIndex": 0,
    "scoreTerserang": 0.12,
    "scoreSehat": 0.88,
    "predictionScore": 0.88,
    "scoreCalibrated": true,
    "threshold": 0.5,
    "ndvi": 0.65,
    "bands": {
      "green": 0.31,
      "red": 0.24,
      "nir": 0.72
    },
    "validPixelPercentage": 98.5,
    "inputShape": [224, 224, 3],
    "snapshotThumbnail": "https://<project-ref>.supabase.co/storage/v1/object/public/snapshots/thumbnail.jpg",
    "snapshotNDVI": "https://<project-ref>.supabase.co/storage/v1/object/public/snapshots/ndvi.png",
    "radiometricMode": "jpg",
    "radiometricValidated": false,
    "physicalCoverageTargetMeters": 0,
    "physicalCoverageValidated": false,
    "automaticSprayingAllowed": false
  }
}
```

Nilai `classification` yang didukung UI adalah `Sehat` dan `Terserang`.

## Kontrak FastAPI

Request yang dibuat route status:

```http
POST <FASTAPI_URL>/process-snapshot
Content-Type: multipart/form-data
```

Field:

```text
file=<file JPG hasil capture>
```

FastAPI harus mengembalikan objek JSON yang sesuai dengan tipe `NDVIPredictionResult`, terutama:

- `success`
- `filename`
- `modelName`
- `modelStatus`
- `classification`
- `scoreSehat`
- `scoreTerserang`
- `predictionScore`
- `threshold`
- `ndvi`
- `bands.green`, `bands.red`, `bands.nir`
- `validPixelPercentage`
- `snapshotThumbnail`
- `snapshotNDVI`
- flag radiometrik dan penyemprotan

## Alur Penggunaan

1. Dashboard memanggil `/api/mapir/health` dan menandai kamera siap bila MAPIR ready dan tidak sedang capture.
2. Pengguna menekan **Ambil Foto & Analisis**.
3. Browser memanggil `/api/mapir/capture`.
4. Next.js meneruskan request ke DreamPalm API dengan API key.
5. Browser menerima `capture_id`, lalu polling `/api/mapir/status/<captureId>` setiap 1.5 detik.
6. Jika selesai, Next.js mengambil JPG, mengirimnya ke FastAPI, dan mengembalikan hasil ML.
7. Dashboard menampilkan prediksi CNN, NDVI, kanal spektral, thumbnail, dan heatmap.

## Konfigurasi Gambar Next.js

`next.config.ts` mengizinkan gambar remote dari:

- host yang ditentukan `DREAMPALM_API_URL` pada pola `/v1/mapir/captures/**`
- host yang ditentukan `SUPABASE_STORAGE_URL` pada pola `/storage/v1/object/public/snapshots/**`

Pastikan URL upstream dan gambar Supabase menggunakan HTTPS serta berada dalam pola yang terdaftar. Restart Next.js setelah mengganti `SUPABASE_STORAGE_URL` atau `DREAMPALM_API_URL`.

## Script Project

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Menjalankan production build
npm run lint     # Menjalankan ESLint
```

## Verifikasi Sebelum Deployment

```bash
npm run lint
npm run build
npm run start
```

Pastikan service DreamPalm dan FastAPI dapat diakses dari server Next.js, bukan hanya dari browser pengguna.

## Deployment

Gunakan platform yang mendukung Next.js 16 dan App Router. Konfigurasikan environment variable berikut pada platform deployment:

```text
NEXT_PUBLIC_MAPIR_STREAM_URL
DREAMPALM_API_URL
DREAMPALM_API_KEY
FASTAPI_URL
SUPABASE_STORAGE_URL
```

Perluasan yang direkomendasikan untuk produksi:

- Gunakan HTTPS untuk seluruh endpoint.
- Gunakan secret manager untuk `DREAMPALM_API_KEY`.
- Tambahkan timeout dan retry terbatas pada polling capture.
- Batasi ukuran dan tipe file pada FastAPI.
- Pastikan bucket Supabase public atau tambahkan proxy autentikasi sesuai kebutuhan.
- Tambahkan autentikasi pengguna sebelum membuka dashboard capture.

## Troubleshooting

### Status kamera selalu menunggu

- Periksa koneksi ke `{DREAMPALM_API_URL}/health`.
- Pastikan response DreamPalm menunjukkan `mapir.ready: true`.
- Pastikan tidak ada capture aktif (`capture_busy: false`).

### Capture gagal dengan 500

- Pastikan `DREAMPALM_API_URL` dan `DREAMPALM_API_KEY` terisi.
- Pastikan header `X-DreamPalm-Key` sesuai dengan API upstream.

### Capture selesai tetapi hasil ML gagal

- Pastikan FastAPI aktif pada `FASTAPI_URL`.
- Pastikan endpoint `/process-snapshot` menerima `multipart/form-data`.
- Pastikan URL JPG dapat diunduh Next.js dan API key upstream valid.
- Periksa log Next.js untuk detail dari response FastAPI.

### Gambar tidak tampil

- Pastikan `snapshotThumbnail` dan `snapshotNDVI` dapat diakses.
- Pastikan Supabase Storage public bila URL berasal dari bucket public.
- Pastikan hostname Supabase terdaftar pada `SUPABASE_STORAGE_URL`.
- Restart server setelah mengubah konfigurasi Next.js.

### Environment variable tidak terbaca

- Simpan server-only variable di `.env.local`.
- Jangan gunakan tanda kutip atau karakter newline pada nilai API key.
- Restart `npm run dev` setelah mengubah `.env.local`.

## Referensi

- [Dokumentasi Next.js](https://nextjs.org/docs)
- [Dokumentasi React](https://react.dev/)
- [Dokumentasi Tailwind CSS](https://tailwindcss.com/docs)
- [Dokumentasi Supabase Storage](https://supabase.com/docs/guides/storage)
