/**
 * @file src/lib/db.ts
 * @description Singleton pg.Pool untuk koneksi PostgreSQL.
 *
 * PENTING: Modul ini hanya boleh digunakan di sisi server (Route Handler,
 * Server Component, script Node.js). Tidak boleh diimpor di Client Component.
 *
 * Pool diinisialisasi secara lazy — koneksi baru dibuat saat fungsi pertama
 * kali dipanggil, bukan saat modul diimpor. Hal ini memastikan `next build`
 * dapat berjalan tanpa memerlukan database aktif.
 */

import pg from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

// Guard: pastikan modul tidak dijalankan di lingkungan browser/client.
if (typeof window !== "undefined") {
  throw new Error(
    "[db] Modul src/lib/db.ts hanya boleh diimpor di sisi server.",
  );
}

/** Singleton pool — null sebelum pertama kali diinisialisasi. */
let _pool: pg.Pool | null = null;

/**
 * Mengembalikan pool singleton. Membuat pool baru jika belum ada.
 * @throws Error jika DATABASE_URL belum dikonfigurasi.
 */
function getPool(): pg.Pool {
  if (_pool !== null) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "[db] Environment variable DATABASE_URL belum dikonfigurasi. " +
      "Tambahkan DATABASE_URL ke file .env sebelum menggunakan database.",
    );
  }

  _pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Log error pool tanpa mencetak connection string atau kredensial.
  _pool.on("error", () => {
    console.error("[db] Unexpected pool error.");
  });

  return _pool;
}

/**
 * Menjalankan query terparameterisasi dan mengembalikan objek QueryResult lengkap
 * (termasuk rowCount dan rows). Client diambil dari pool dan dilepaskan secara otomatis.
 *
 * @param text   - Teks SQL dengan placeholder $1, $2, ...
 * @param params - Array nilai parameter (opsional).
 * @returns QueryResult<T> lengkap.
 */
export async function execute<
  T extends QueryResultRow = QueryResultRow,
>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  const client = await getPool().connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

/**
 * Menjalankan query terparameterisasi dan mengembalikan array baris hasil (`rows`).
 * Client diambil dari pool dan dilepaskan secara otomatis.
 *
 * @param text   - Teks SQL dengan placeholder $1, $2, ...
 * @param params - Array nilai parameter (opsional).
 * @returns Array baris bertipe T.
 *
 * @example
 * const rows = await query<{ capture_id: string }>(
 *   'SELECT capture_id FROM uji.captures WHERE status = $1',
 *   ['pending']
 * );
 */
export async function query<
  T extends QueryResultRow = QueryResultRow,
>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await execute<T>(text, params);
  return result.rows;
}

/**
 * Mengembalikan PoolClient yang didedikasikan untuk operasi yang memerlukan
 * kontrol transaksi eksplisit atau advisory lock PostgreSQL.
 *
 * PENTING: Pemanggil wajib memanggil client.release() di blok finally.
 * Jangan pernah menggunakan `return` di dalam blok `finally`.
 * Jika pelepasan lock gagal, buang koneksi yang bermasalah dengan `client.release(true)`.
 *
 * @example
 * const client = await getClient();
 * let lockAcquired = false;
 * try {
 *   const lockRes = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [lockId]);
 *   lockAcquired = Boolean(lockRes.rows[0]?.locked);
 *   if (!lockAcquired) {
 *     throw new Error("Lock sedang digunakan.");
 *   }
 *   // ... operasi kritis di bawah lock ...
 * } finally {
 *   if (lockAcquired) {
 *     try {
 *       const unlockRes = await client.query('SELECT pg_advisory_unlock($1) AS unlocked', [lockId]);
 *       if (!unlockRes.rows[0]?.unlocked) {
 *         console.error("[db] Gagal melepaskan lock. Membuang koneksi.");
 *         client.release(true); // destroy client jika unlock tidak berhasil
 *       } else {
 *         client.release();
 *       }
 *     } catch {
 *       console.error("[db] Exception saat unlock.");
 *       client.release(true); // destroy client jika terjadi exception saat unlock
 *     }
 *   } else {
 *     client.release();
 *   }
 * }
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Menutup pool koneksi PostgreSQL secara anggun (graceful shutdown).
 * Berguna untuk script pemeliharaan, migrasi, dan teardown pengujian
 * agar proses Node.js dapat keluar dengan bersih.
 */
export async function closePool(): Promise<void> {
  if (_pool !== null) {
    const poolToClose = _pool;
    _pool = null;
    await poolToClose.end();
  }
}
