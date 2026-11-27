import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { insertCapture, getCaptureById, updateCaptureStored, updateCaptureStatus,
  getPredictionByCaptureId, insertPrediction, getLatestPrediction, parseSafeBytes, validateCaptureId,
  fillCaptureMetadata, mediaExists, checkCaptureDatabase } from "../../lib/captureDb";
import type { InsertPredictionInput, OrmDb } from "../../lib/captureDb";
const FIXTURE_CAPTURE_ID = "CAP-20261121-041023-F837";
const FIXTURE_PREDICTION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const FIXTURE_PREDICTION_INPUT: InsertPredictionInput = {
  predictionId: FIXTURE_PREDICTION_ID,
  captureId: FIXTURE_CAPTURE_ID,
  processedJpgPath: `predictions/${FIXTURE_PREDICTION_ID}/processed.jpg`,
  ndviVisualPath: `predictions/${FIXTURE_PREDICTION_ID}/ndvi.png`,
  classification: "Sehat",
  classIndex: 0,
  predictionScore: 0.912,
  scoreTerserang: 0.088,
  scoreSehat: 0.912,
  threshold: 0.5,
  ndvi: 0.421,
  greenMeanScaled: 0.3102,
  redMeanScaled: 0.1874,
  nirMeanScaled: 0.622,
  modelName: "dreampalm-cnn-v3",
  modelStatus: "production",
  scoreCalibrated: false,
  radiometricMode: "jpg_approximate",
  radiometricValidated: false,
  physicalCoverageTargetM: 25.0,
  physicalCoverageValidated: false,
  validPixelPercentage: 98.5,
  automaticSprayingAllowed: false,
  preprocessingVersion: null,
  modelSha256: null,
  configSha256: null,
};
const id = FIXTURE_CAPTURE_ID;
const stored = { captureId: id, originalJpgPath: `captures/${id}/original.jpg`, rawFilePath: `captures/${id}/original.raw`, jpgSizeBytes: 3451130, rawSizeBytes: 18000000 };
const capture = { capture_id: id, drone_id: null, created_at: new Date(), captured_at: null,
  raw_file_path: stored.rawFilePath, original_jpg_path: stored.originalJpgPath,
  raw_size_bytes: BigInt(stored.rawSizeBytes), jpg_size_bytes: BigInt(stored.jpgSizeBytes), status: "stored", error_message: null };
function mockDb(results: Record<string, unknown> = {}) {
  const calls: { method: string; args: unknown }[] = [];
  const call = (method: string) => async (args: unknown) => { calls.push({ method, args }); return results[method] ?? null; };
  const db = { capture: { findUnique: call("capture.findUnique"), findFirst: call("capture.findFirst"),
    createMany: call("capture.createMany"), updateMany: call("capture.updateMany") },
    prediction: { findFirst: call("prediction.findFirst"), create: call("prediction.create") } } as unknown as OrmDb;
  return { db, calls };
}
describe("Prisma capture DAL", () => {
  it("validates IDs", () => { validateCaptureId(id); for (const v of ["", " ", "../bad", "a/b", "x".repeat(129)]) assert.throws(() => validateCaptureId(v)); });
  it("converts BIGINT safely", () => { for (const v of [null, undefined]) assert.equal(parseSafeBytes(v), null); for (const v of [18, "18", BigInt(18)]) assert.equal(parseSafeBytes(v), 18); for (const v of [-1, "-1", BigInt(-1), NaN, 1.2, "9007199254740992", BigInt("9007199254740992")]) assert.throws(() => parseSafeBytes(v)); });
  it("checks DB before trigger", async () => { const { db, calls } = mockDb(); await checkCaptureDatabase(db); assert.deepEqual(calls[0], { method: "capture.findFirst", args: { select: { capture_id: true } } }); });
  it("creates pending capture idempotently", async () => { const { db, calls } = mockDb(); await insertCapture({ captureId: id }, db); assert.deepEqual(calls[0], { method: "capture.createMany", args: { data: [{ capture_id: id, drone_id: null, captured_at: null, status: "pending" }], skipDuplicates: true } }); });
  it("rejects invalid capture before DB", async () => { const { db, calls } = mockDb(); await assert.rejects(insertCapture({ captureId: "../bad" }, db)); assert.equal(calls.length, 0); });
  it("returns null for missing capture", async () => { const { db } = mockDb(); assert.equal(await getCaptureById(id, db), null); });
  it("maps capture bytes to numbers", async () => { const { db } = mockDb({ "capture.findUnique": capture }); const row = await getCaptureById(id, db); assert.equal(row?.raw_size_bytes, 18000000); assert.equal(row?.jpg_size_bytes, 3451130); });
  it("rejects invalid stored paths and sizes", async () => { const { db, calls } = mockDb(); for (const changes of [{originalJpgPath:""},{rawFilePath:"../raw"},{jpgSizeBytes:0},{rawSizeBytes:-1},{jpgSizeBytes:NaN},{rawSizeBytes:1.5},{rawSizeBytes:Number.MAX_SAFE_INTEGER+1}]) await assert.rejects(updateCaptureStored({...stored,...changes},db)); assert.equal(calls.length,0); });
  it("stores paths and exact BigInt sizes", async () => { const { db, calls } = mockDb({ "capture.updateMany": { count: 1 } }); await updateCaptureStored(stored, db); assert.deepEqual(calls[0], { method: "capture.updateMany", args: { where: { capture_id: id }, data: { status: "stored", original_jpg_path: stored.originalJpgPath, raw_file_path: stored.rawFilePath, jpg_size_bytes: BigInt(stored.jpgSizeBytes), raw_size_bytes: BigInt(stored.rawSizeBytes), error_message: null } } }); });
  it("rejects missing row during update", async () => { const { db } = mockDb({ "capture.updateMany": { count: 0 } }); await assert.rejects(updateCaptureStored(stored, db)); await assert.rejects(updateCaptureStatus(id,"failed",null,db)); });
  it("updates pending and failed only", async () => { const { db, calls } = mockDb({ "capture.updateMany": { count: 1 } }); await updateCaptureStatus(id,"failed","error",db); await updateCaptureStatus(id,"pending",null,db); await assert.rejects(updateCaptureStatus(id,"stored" as "pending",null,db)); assert.equal(calls.length,2); });
  it("fills metadata only when NULL", async () => { const { db,calls } = mockDb({ "capture.updateMany": {count:1} }); const time=new Date(); await fillCaptureMetadata(id,{droneId:"drone",capturedAt:time},db); assert.deepEqual(calls.map(c=>c.args),[{where:{capture_id:id,drone_id:null},data:{drone_id:"drone"}},{where:{capture_id:id,captured_at:null},data:{captured_at:time}}]); });
  it("orders predictions deterministically", async () => { const {db,calls}=mockDb(); assert.equal(await getPredictionByCaptureId(id,db),null); assert.deepEqual(calls[0].args,{where:{capture_id:id},orderBy:[{created_at:"desc"},{prediction_id:"desc"}]}); });
  it("inserts all 26 fields and preserves values", async () => { const {db,calls}=mockDb(); await insertPrediction(FIXTURE_PREDICTION_INPUT,db); const data=(calls[0].args as {data:Record<string,unknown>}).data; assert.equal(Object.keys(data).length,26); for (const [key,value] of Object.entries(FIXTURE_PREDICTION_INPUT)) { const field=key.replace(/[A-Z]/g,c=>"_"+c.toLowerCase()); assert.equal(data[field],value,field); } });
  it("joins latest prediction with capture without leaking BigInt", async () => { const m=mockDb(); await insertPrediction(FIXTURE_PREDICTION_INPUT,m.db); const data=(m.calls[0].args as {data:Record<string,unknown>}).data; const {db,calls}=mockDb({"prediction.findFirst":{...data,created_at:new Date(),capture}}); const row=await getLatestPrediction(db); assert.equal(row?.prediction_id,FIXTURE_PREDICTION_ID); assert.equal(row?.raw_size_bytes,18000000); assert.equal(row?.capture_status,"stored"); assert.doesNotThrow(()=>JSON.stringify(row)); assert.deepEqual(calls[0].args,{include:{capture:true},orderBy:[{created_at:"desc"},{prediction_id:"desc"}]}); });
  it("returns null when no predictions",async()=>{const {db}=mockDb(); assert.equal(await getLatestPrediction(db),null);});
  it("authorizes media only by recorded path and stored status",async()=>{ const {db,calls}=mockDb({"capture.findFirst":{capture_id:id}}); assert.equal(await mediaExists("captures",id,stored.originalJpgPath,db),true); assert.deepEqual(calls[0].args,{where:{capture_id:id,status:"stored",OR:[{original_jpg_path:stored.originalJpgPath},{raw_file_path:stored.originalJpgPath}]},select:{capture_id:true}}); assert.equal(await mediaExists("predictions",FIXTURE_PREDICTION_ID,"missing",db),false); });
});
