# DreamPalm Uji — Prisma ORM 7.10.1

Patch source-only untuk commit 3ed72cb (UI clean). PostgreSQL 16, schema `uji` saja. Seluruh CRUD capture/prediction/media memakai Prisma Client; `pg` dipertahankan khusus advisory lock dan diagnostik read-only. Lock tetap session-level dengan key `dreampalm-uji:<captureId>` dan sesi terdedikasi; operasi file/HTTP tetap di luar transaksi panjang. Dua pool (maksimum 5 koneksi masing-masing). Lock tidak menghilangkan risiko duplikasi jika sesi lock putus di tengah operasi; uji concurrency dan kegagalan jaringan sebelum produksi. UI, storage, FastAPI, Raspberry Pi, kontrak API tidak diubah.

## 1. Pasang patch pada branch terpisah

Pastikan git status bersih, branch `feat/prisma-orm-integration` dari commit 3ed72cb. Ekstrak ZIP ke root repository. `package-lock.json` sengaja tidak disertakan karena registry npm tidak tersedia di lingkungan pembuatan patch. Jalankan di laptop (Node 22 >= 22.12, atau Node 20 >= 20.19 untuk build; test runner existing perlu Node 22):

```bash
npm install
npm run db:generate
npx prisma validate
npm test
npx tsc --noEmit
npm run lint
npm run build
```

`npm install` memperbarui lockfile. Commit lockfile hasil instalasi. `prebuild` dan `pretest` menghasilkan Prisma Client. Generator `prisma-client-js` v7 dipilih untuk kompatibilitas loader Node existing (legacy, masih didukung v7); jangan upgrade ke v8 tanpa refactoring terpisah. Tidak perlu koneksi DB untuk generate/validate/build. Jika instalasi atau build gagal, berhenti, jangan deploy.

## 2. Developer baru / database kosong

Buat database PostgreSQL terpisah (mis. `dreampalm_prisma_test`) sebagai admin. Gunakan role owner migration untuk DDL dan role aplikasi terpisah untuk runtime. Contoh (jalankan via psql sebagai admin, password lewat `\password`, jangan commit password):

```sql
CREATE ROLE dreampalm_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE dreampalm_uji LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE dreampalm_prisma_test OWNER dreampalm_migrator;
GRANT CONNECT ON DATABASE dreampalm_prisma_test TO dreampalm_uji;
```

Jika role sudah ada, gunakan role yang sesuai dan jangan reset password existing. Jalankan `\password dreampalm_migrator` dan `\password dreampalm_uji` di psql hanya untuk role baru/lokal. Isi `.env` secara lokal (URL encode password):

```dotenv
MIGRATION_DATABASE_URL=postgresql://dreampalm_migrator:LOCAL_PASSWORD@127.0.0.1:5432/dreampalm_prisma_test?schema=uji
DATABASE_URL=postgresql://dreampalm_uji:LOCAL_PASSWORD@127.0.0.1:5432/dreampalm_prisma_test
```

```bash
npm run db:migrate
npx prisma migrate status
```

Sebagai migration owner/admin di database test tersebut:

```sql
GRANT USAGE ON SCHEMA uji TO dreampalm_uji;
GRANT SELECT, INSERT, UPDATE ON uji.captures TO dreampalm_uji;
GRANT SELECT, INSERT ON uji.predictions TO dreampalm_uji;
```

Migration tidak menyertakan role/password/data existing. CHECK constraints dipertahankan dalam SQL meskipun tidak dapat didefinisikan di schema.prisma. `0_init` berisi DDL dari dump, tanpa meta-command psql atau session SET. `CREATE SCHEMA IF NOT EXISTS` diperlukan karena Prisma bisa membuat schema riwayat lebih dahulu. Jangan hapus constraint saat membuat migration lanjutan.

```bash
npm run db:check
npm run db:smoke
```

Smoke test dibatasi nama database `dreampalm_prisma_test`; menggunakan transaction rollback dan lock uji, tidak memicu kamera, tidak membuat file. Jalankan pada database disposable kosong. Selanjutnya konfigurasi env storage/Capture API/FastAPI bila butuh E2E. Jangan menggunakan API kamera produksi untuk tes lokal tanpa koordinasi.

## 3. VPS existing — HANYA setelah uji lokal dan penerbangan selesai

Tidak perlu migration untuk runtime CRUD terhadap tabel yang sudah ada. Pertahankan DATABASE_URL dan storage saat ini. Jangan `migrate deploy` baseline terhadap tabel existing sebelum baseline dicatat. Backup schema dan data PostgreSQL `uji` dan filesystem secara konsisten saat tidak ada capture aktif; simpan backup secara privat. Bandingkan dump aktual dengan migration, cek apakah `uji._prisma_migrations` sudah ada, dan pastikan hanya schema `uji` dikelola. Gunakan akun pemilik schema/tabel atau administrator melalui mekanisme kredensial aman terpisah untuk migration (bukan user aplikasi). Jangan memberi user runtime hak DDL/superuser.

Setelah verifikasi dan backup, gunakan migration URL terpisah dengan `?schema=uji`, lalu `npx prisma migrate resolve --applied 0_init` untuk mencatat baseline existing (bukan membuat tabel baru), `npx prisma migrate status`. Tinjau hak akses tabel migration; jangan grant CRUD ke `_prisma_migrations`. Jangan gunakan `migrate reset`, `db push`, atau `migrate dev` di VPS. Jika schema berbeda atau ada riwayat lain, hentikan. Tidak perlu baseline sekarang untuk menguji ORM di database yang sudah ada; lakukan setelah validasi.

Deployment hanya setelah review: deploy branch baru di staging/port lain atau maintenance window, jangan mengganti layanan web uji aktif menjelang flight test. Pastikan `npm ci` termasuk devDependencies untuk build, `npm run build`, dan read-only check sebelum restart. Jangan jalankan runtime dengan kredensial migration. Rollback source ke commit 3ed72cb jika gagal; baseline (bila sudah dicatat) tidak mengubah tabel bisnis. UI, kamera dan layanan ML tetap sama.
