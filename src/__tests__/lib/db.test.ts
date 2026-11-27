/**
 * @file src/__tests__/lib/db.test.ts
 * @description Unit test untuk db.ts — verifikasi konfigurasi pool, lazy init,
 * pelepasan koneksi (release) pada query sukses/gagal, dan proteksi kredensial.
 *
 * Menjalankan pengujian:
 *   node --loader ./src/__tests__/test-resolver.mjs --experimental-strip-types --test src/__tests__/lib/db.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { query, execute, getClient, closePool } from "../../lib/db";

describe("db - lazy initialization & security", () => {
  it("melempar error deskriptif jika DATABASE_URL tidak dikonfigurasi", async () => {
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    await closePool(); // Reset singleton pool

    try {
      await assert.rejects(
        async () => {
          await query("SELECT 1");
        },
        (err: Error) => {
          assert.ok(
            err.message.includes("DATABASE_URL belum dikonfigurasi"),
            "Pesan error harus menyebutkan DATABASE_URL belum diatur",
          );
          // Pastikan tidak ada token rahasia
          assert.ok(!err.message.includes("password"));
          assert.ok(!err.message.includes("postgresql://"));
          return true;
        },
      );
    } finally {
      if (originalUrl) {
        process.env.DATABASE_URL = originalUrl;
      }
    }
  });

  it("modul db.ts dapat diimpor tanpa throw error saat DATABASE_URL belum ada (lazy init)", async () => {
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    await closePool();

    try {
      const dbModule = await import("../../lib/db");
      assert.equal(typeof dbModule.query, "function");
      assert.equal(typeof dbModule.execute, "function");
      assert.equal(typeof dbModule.getClient, "function");
      assert.equal(typeof dbModule.closePool, "function");
    } finally {
      if (originalUrl) {
        process.env.DATABASE_URL = originalUrl;
      }
    }
  });
});

describe("db - connection release & execution", () => {
  it("melepaskan koneksi (client.release) ketika query berhasil", async () => {
    process.env.DATABASE_URL = "postgresql://test_user:test_pass@127.0.0.1:5432/test_db";
    await closePool();

    const originalConnect = pg.Pool.prototype.connect;
    let released = false;

    // Mock Pool.connect
    pg.Pool.prototype.connect = (async () => {
      return {
        query: async () => ({ rows: [{ val: 42 }], rowCount: 1 }),
        release: () => {
          released = true;
        },
      } as unknown as pg.PoolClient;
    }) as typeof pg.Pool.prototype.connect;

    try {
      const rows = await query<{ val: number }>("SELECT 42 AS val");
      assert.deepEqual(rows, [{ val: 42 }]);
      assert.equal(released, true, "client.release() harus dipanggil setelah query berhasil");
    } finally {
      pg.Pool.prototype.connect = originalConnect;
      await closePool();
    }
  });

  it("melepaskan koneksi (client.release) di dalam finally meskipun query melempar error", async () => {
    process.env.DATABASE_URL = "postgresql://test_user:test_pass@127.0.0.1:5432/test_db";
    await closePool();

    const originalConnect = pg.Pool.prototype.connect;
    let released = false;

    pg.Pool.prototype.connect = (async () => {
      return {
        query: async () => {
          throw new Error("Syntax error in query");
        },
        release: () => {
          released = true;
        },
      } as unknown as pg.PoolClient;
    }) as typeof pg.Pool.prototype.connect;

    try {
      await assert.rejects(
        async () => {
          await query("INVALID QUERY");
        },
        /Syntax error in query/,
      );
      assert.equal(
        released,
        true,
        "client.release() harus tetap dipanggil di finally meskipun query gagal",
      );
    } finally {
      pg.Pool.prototype.connect = originalConnect;
      await closePool();
    }
  });

  it("execute mengembalikan QueryResult lengkap termasuk rowCount", async () => {
    process.env.DATABASE_URL = "postgresql://test_user:test_pass@127.0.0.1:5432/test_db";
    await closePool();

    const originalConnect = pg.Pool.prototype.connect;
    let released = false;

    pg.Pool.prototype.connect = (async () => {
      return {
        query: async () => ({
          rows: [],
          rowCount: 3,
          command: "UPDATE",
          oid: 0,
          fields: [],
        }),
        release: () => {
          released = true;
        },
      } as unknown as pg.PoolClient;
    }) as typeof pg.Pool.prototype.connect;

    try {
      const res = await execute("UPDATE uji.captures SET status = $1", ["pending"]);
      assert.equal(res.rowCount, 3);
      assert.deepEqual(res.rows, []);
      assert.equal(released, true);
    } finally {
      pg.Pool.prototype.connect = originalConnect;
      await closePool();
    }
  });
});

describe("db - error logging credential sanitization", () => {
  it("handler error pool tidak membocorkan kredensial dan tidak membuka koneksi nyata", async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://mock_user:mock_password@127.0.0.1:5432/mock_db";
    await closePool();
    const logs: string[] = [];
    const originalConsoleError = console.error;
    const originalConnect = pg.Pool.prototype.connect;
    console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    pg.Pool.prototype.connect = (async function (this: pg.Pool) {
      this.emit("error", new Error("Failure: mock_password postgresql://mock_user:mock_password@127.0.0.1:5432/mock_db"));
      return { release: () => {} } as unknown as pg.PoolClient;
    }) as typeof pg.Pool.prototype.connect;
    try {
      const client = await getClient();
      client.release();
      assert.deepEqual(logs, ["[db] Unexpected pool error."]);
    } finally {
      pg.Pool.prototype.connect = originalConnect;
      console.error = originalConsoleError;
      await closePool();
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  });
});
