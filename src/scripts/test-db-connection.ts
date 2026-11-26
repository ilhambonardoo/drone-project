/**
 * @file src/scripts/test-db-connection.ts
 * @description Script pengujian koneksi database — 100% read-only, dijalankan secara manual.
 *
 * PENTING:
 * - Jangan jalankan script ini terhadap database VPS produksi dari laptop.
 * - Gunakan hanya dengan DATABASE_URL yang menunjuk ke environment pengujian terisolasi.
 * - Script hanya melakukan operasi SELECT pada catalog PostgreSQL dan tabel uji — tidak ada perubahan data.
 * - Koneksi dan pool dijamin ditutup (closePool) di akhir pengujian.
 *
 * Kompatibilitas Versi Node.js:
 * - Pengujian Lokal: Menggunakan Node.js 22 (v22.6+ / v22.18.0) dengan native test runner dan
 *   flag `--experimental-strip-types`.
 * - Lingkungan VPS: Menggunakan Node.js 20.20.2. Next.js 16 mengompilasi seluruh source code
 *   menjadi JavaScript murni saat proses `next build`. Pada saat runtime produksi (`next start`),
 *   semua file dieksekusi sebagai JavaScript standar tanpa memerlukan fitur strip types.
 *   JANGAN melakukan upgrade atau perubahan pada versi Node.js VPS.
 *
 * Cara Menjalankan (dari root direktori proyek):
 *   1. Menggunakan Node.js 22.6+ (bukan Node.js 20):
 *      node --env-file=.env --loader ./src/__tests__/test-resolver.mjs --experimental-strip-types src/scripts/test-db-connection.ts
 *
 *   2. Atau menggunakan environment variable shell langsung:
 *      $env:DATABASE_URL="postgresql://user:pass@host:5432/dbname"
 *      node --loader ./src/__tests__/test-resolver.mjs --experimental-strip-types src/scripts/test-db-connection.ts
 */

import { query, closePool } from "../lib/db";

interface SchemaRow {
  schema_name: string;
}

interface TableRow {
  table_name: string;
}

interface CountRow {
  count: string;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TimeRow {
  now: Date;
  version: string;
}

async function main(): Promise<void> {
  console.log("─".repeat(60));
  console.log("[test-db] Memulai pengujian koneksi PostgreSQL (Read-Only)...");
  console.log(
    "[test-db] DATABASE_URL:",
    process.env.DATABASE_URL
      ? "✓ terdeteksi di environment (kredensial disembunyikan)"
      : "✗ belum dikonfigurasi di environment",
  );
  console.log("─".repeat(60));

  if (!process.env.DATABASE_URL) {
    console.error(
      "[test-db] Error: Environment variable DATABASE_URL belum diatur.",
    );
    console.error(
      "[test-db] Gunakan: node --env-file=.env --loader ./src/__tests__/test-resolver.mjs --experimental-strip-types src/scripts/test-db-connection.ts",
    );
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  async function check(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${name}: ${msg}`);
      failed++;
    }
  }

  try {
    // ── Pemeriksaan 1: Koneksi dasar & versi ──────────────────────────────────
    console.log("\n[1] Koneksi dan versi PostgreSQL");
    await check("SELECT NOW() dan versi server", async () => {
      const rows = await query<TimeRow>(
        "SELECT NOW() AS now, version() AS version",
      );
      if (!rows[0]?.now) throw new Error("Tidak mendapat timestamp dari server.");
      console.log(`      Waktu server   : ${rows[0].now.toISOString()}`);
      const pgVersion = rows[0].version.split(" ").slice(0, 2).join(" ");
      console.log(`      PostgreSQL     : ${pgVersion}`);
    });

    // ── Pemeriksaan 2: Keberadaan schema uji ──────────────────────────────────
    console.log("\n[2] Keberadaan schema uji");
    await check("Schema 'uji' tersedia", async () => {
      const rows = await query<SchemaRow>(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
        ["uji"],
      );
      if (rows.length === 0) throw new Error('Schema "uji" tidak ditemukan.');
    });

    // ── Pemeriksaan 3: Keberadaan tabel uji.captures & uji.predictions ────────
    console.log("\n[3] Keberadaan tabel");
    let foundTables: string[] = [];
    await check("Tabel uji.captures dan uji.predictions tersedia", async () => {
      const rows = await query<TableRow>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = ANY($2::text[])
         ORDER BY table_name`,
        ["uji", ["captures", "predictions"]],
      );
      foundTables = rows.map((r) => r.table_name);
      if (!foundTables.includes("captures")) {
        throw new Error("Tabel uji.captures tidak ditemukan.");
      }
      if (!foundTables.includes("predictions")) {
        throw new Error("Tabel uji.predictions tidak ditemukan.");
      }
      console.log(`      Ditemukan      : ${foundTables.join(", ")}`);
    });

    // ── Pemeriksaan 4: Kolom kritis uji.captures ─────────────────────────────
    console.log("\n[4] Struktur tabel uji.captures");
    if (foundTables.includes("captures")) {
      await check("Kolom kritis uji.captures tersedia", async () => {
        const rows = await query<ColumnRow>(
          `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          ["uji", "captures"],
        );
        const cols = new Map(rows.map((r) => [r.column_name, r]));
        const required = [
          "capture_id",
          "status",
          "created_at",
          "original_jpg_path",
          "raw_file_path",
          "jpg_size_bytes",
          "raw_size_bytes",
        ];
        const missing = required.filter((c) => !cols.has(c));
        if (missing.length > 0) {
          throw new Error(`Kolom tidak ditemukan: ${missing.join(", ")}`);
        }
        console.log(`      Total kolom    : ${cols.size}`);
      });
    }

    // ── Pemeriksaan 5: Kolom kritis uji.predictions ───────────────────────────
    console.log("\n[5] Struktur tabel uji.predictions");
    if (foundTables.includes("predictions")) {
      await check("Kolom kritis uji.predictions tersedia", async () => {
        const rows = await query<ColumnRow>(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          ["uji", "predictions"],
        );
        const cols = new Set(rows.map((r) => r.column_name));
        const required = [
          "prediction_id",
          "capture_id",
          "created_at",
          "processed_jpg_path",
          "ndvi_visual_path",
          "classification",
          "class_index",
          "prediction_score",
          "score_terserang",
          "score_sehat",
          "threshold",
          "ndvi",
          "green_mean_scaled",
          "red_mean_scaled",
          "nir_mean_scaled",
          "model_name",
          "model_status",
          "score_calibrated",
          "radiometric_mode",
          "radiometric_validated",
          "valid_pixel_percentage",
          "automatic_spraying_allowed",
        ];
        const missing = required.filter((c) => !cols.has(c));
        if (missing.length > 0) {
          throw new Error(`Kolom tidak ditemukan: ${missing.join(", ")}`);
        }
        console.log(`      Total kolom    : ${cols.size}`);
      });
    }

    // ── Pemeriksaan 6: Hak akses SELECT (read-only) ──────────────────────────
    console.log("\n[6] Hak akses SELECT (read-only)");
    await check("SELECT COUNT(*) pada uji.captures", async () => {
      const rows = await query<CountRow>(
        "SELECT COUNT(*)::text AS count FROM uji.captures",
      );
      console.log(`      uji.captures   : ${rows[0].count} baris`);
    });

    await check("SELECT COUNT(*) pada uji.predictions", async () => {
      const rows = await query<CountRow>(
        "SELECT COUNT(*)::text AS count FROM uji.predictions",
      );
      console.log(`      uji.predictions: ${rows[0].count} baris`);
    });

    // ── Pemeriksaan 7: Advisory lock API tersedia ────────────────────────────
    console.log("\n[7] PostgreSQL advisory lock API");
    await check("Fungsi advisory lock tersedia (pemeriksaan katalog saja)", async () => {
      const rows = await query<{ lock_available: boolean; unlock_available: boolean }>(
        `SELECT to_regprocedure('pg_catalog.pg_try_advisory_lock(bigint)') IS NOT NULL AS lock_available,
                to_regprocedure('pg_catalog.pg_advisory_unlock(bigint)') IS NOT NULL AS unlock_available`,
      );
      if (!rows[0]?.lock_available || !rows[0]?.unlock_available) {
        throw new Error('Fungsi advisory lock tidak tersedia.');
      }
    });
  } finally {
    // Tutup connection pool secara bersih agar proses Node.js keluar
    await closePool();
  }

  // ── Ringkasan ─────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log(`[test-db] Selesai: ${passed} lulus, ${failed} gagal`);
  if (failed > 0) {
    console.error(
      "[test-db] ⚠ Ada pemeriksaan yang gagal. Periksa konfigurasi database.",
    );
    process.exit(1);
  } else {
    console.log("[test-db] ✓ Semua pemeriksaan lulus. Database siap.");
    process.exit(0);
  }
}

main().catch(async (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[test-db] Fatal error:", msg);
  await closePool().catch(() => {});
  process.exit(1);
});
