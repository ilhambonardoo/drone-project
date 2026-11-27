import { getPrisma, disconnectPrisma } from "../lib/prisma";
import { getLatestPrediction } from "../lib/captureDb";

async function main() {
  try {
    console.log("[1/4] Inisialisasi Prisma Client...");
    const db = getPrisma();

    console.log("[2/4] Menghitung data captures...");
    console.log("captures:", await db.capture.count());

    console.log("[3/4] Menghitung data predictions...");
    console.log("predictions:", await db.prediction.count());

    console.log("[4/4] Mengambil prediksi terbaru...");
    const latest = await getLatestPrediction();

    console.log("Latest prediction:", latest?.prediction_id ?? "(empty)");

    console.log("PASS: Prisma read-only check berhasil.");
  } finally {
    await disconnectPrisma();
  }
}

main().catch((error) => {
  console.error("Prisma read-only check gagal.");
  console.error("Error name:", error.name);
  console.error("Error code:", error.code ?? "UNKNOWN");

  process.exitCode = 1;
});
