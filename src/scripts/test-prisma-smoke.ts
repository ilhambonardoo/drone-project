/** Explicitly opt-in: only a disposable dreampalm_prisma_test database. No camera/ML calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPrisma } from "../lib/prisma";
import { getClient, closePool } from "../lib/db";
import { insertCapture, getCaptureById, updateCaptureStored, getLatestPrediction,
  getPredictionByCaptureId, insertPrediction, mediaExists } from "../lib/captureDb";

const url = process.env.DATABASE_URL;
if (!url || new URL(url).pathname !== "/dreampalm_prisma_test") {
  throw new Error("Smoke test hanya boleh pada database disposable dreampalm_prisma_test.");
}
const id = `TEST-${randomUUID()}`;
const pred = randomUUID();
const jpg = `captures/${id}/original.jpg`;
const raw = `captures/${id}/original.raw`;
const png = `predictions/${pred}/ndvi.png`;
const processed = `predictions/${pred}/processed.jpg`;
const rollback = new Error("SMOKE_ROLLBACK");
async function main() {
  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      await insertCapture({ captureId: id }, tx);
      await insertCapture({ captureId: id }, tx);
      assert.equal(await tx.capture.count({ where: { capture_id: id } }), 1);
      await updateCaptureStored({ captureId:id, originalJpgPath:jpg, rawFilePath:raw, jpgSizeBytes:123, rawSizeBytes:456 },tx);
      assert.equal((await getCaptureById(id,tx))?.raw_size_bytes,456);
      await insertPrediction({ predictionId:pred,captureId:id,processedJpgPath:processed,ndviVisualPath:png,
        classification:"Sehat",classIndex:0,predictionScore:0.8,scoreTerserang:0.2,scoreSehat:0.8,threshold:0.5,ndvi:0.5,
        greenMeanScaled:0.2,redMeanScaled:0.1,nirMeanScaled:0.3,modelName:"smoke",modelStatus:"test",
        scoreCalibrated:false,radiometricMode:"test",radiometricValidated:false,physicalCoverageTargetM:null,
        physicalCoverageValidated:false,validPixelPercentage:100,automaticSprayingAllowed:false,
        preprocessingVersion:null,modelSha256:null,configSha256:null },tx);
      assert.equal((await getPredictionByCaptureId(id,tx))?.prediction_id,pred);
      assert.equal((await getLatestPrediction(tx))?.prediction_id,pred);
      assert.equal(await mediaExists("captures",id,jpg,tx),true);
      assert.equal(await mediaExists("predictions",pred,png,tx),true);
      assert.equal(await mediaExists("captures",id,"wrong",tx),false);
      throw rollback;
    }, {timeout: 20_000});
  } catch (e) { if (e !== rollback) throw e; }
  assert.equal(await prisma.capture.count({where:{capture_id:id}}),0);
  // Verify same capture lock excludes another PostgreSQL session.
  const a = await getClient();
  try {
    const b = await getClient();
    try {
      const q = "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked";
      const key = [`dreampalm-uji:${id}`];
      assert.equal((await a.query(q,key)).rows[0].locked,true);
      assert.equal((await b.query(q,key)).rows[0].locked,false);
    } finally { b.release(true); }
  } finally { a.release(true); }
  console.log("PASS: ORM CRUD, idempotency, relation, media metadata, BigInt, rollback, advisory lock.");
}
main().catch(() => { console.error("Smoke test gagal. Periksa database/configuration."); process.exitCode=1; })
  .finally(async()=>{await disconnectPrisma();await closePool();});
