// ============================================================
// Test E2E de la lógica de BD (sin Next): seed x2 (renovaciones),
// GridFS roundtrip y primer login. Usa MongoDB en memoria.
//   node scripts/test-e2e.mjs
// ============================================================
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoClient, GridFSBucket } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB = "polizaweb";

function fail(msg) {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}
const check = (cond, msg) => {
  if (!cond) fail(msg);
  else console.log("✔", msg);
};

const mms = await MongoMemoryServer.create({ instance: { dbName: DB } });
const URI = mms.getUri();
console.log("Mongo de prueba:", URI);

const env = { ...process.env, MONGODB_URI: URI, MONGODB_DB: DB };

// ---- SEED 1: admin + 101 pólizas (100 series — NV5124A va 2 veces) ----
let r = spawnSync(
  process.execPath,
  ["scripts/seed.mjs", "--admin", "--email=admin@test.com", "--pass=Prueba123"],
  { cwd: ROOT, env, encoding: "utf8", timeout: 300000 }
);
console.log("── stdout seed 1 ──\n", r.stdout);
console.log("── stderr seed 1 ──\n", r.stderr);
check(r.status === 0, "seed corrida 1 con exito (salida 0)");
if (r.status !== 0) process.exit(1);
const adminCreado = /Admin listo: admin@test\.com/.test(r.stdout);
check(adminCreado, "usuario admin creado");
check(/creadas:\s+100/.test(r.stdout), "seed 1: 100 creadas (101 filas − 1 duplicada)");
check(/renovadas:\s+1/.test(r.stdout), "seed 1: la serie duplicada se auto-renovó (último gana)");
check(/total BD:\s+100/.test(r.stdout), "seed 1: 100 unidades en BD");

// ---- inspección directa ----
const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);
const usuarios = await db.collection("usuarios").find({}).toArray();
check(usuarios.length === 1 && usuarios[0].email === "admin@test.com" && usuarios[0].rol === "admin", "1 admin en BD");
check(/^\$2[aby]\$/.test(usuarios[0].passwordHash || ""), "contraseña hasheada con bcrypt");

const unidades = await db.collection("unidades").find({}).toArray();
check(unidades.length === 100, "100 documentos unidades");
const unidadTest = unidades.find((u) => u.placa === "NX1988B");
check(Boolean(unidadTest), "unidades NX1988B existe");
check(
  unidadTest?.placa === "NX1988B" && unidadTest.serie === "1FDRF3GN0REF50657" && unidadTest.cis === "20367112",
  "campos parseados correctos (NX1988B)"
);
check(unidadTest?.archivo?.fileId, "con fileId de GridFS");
const sinPlaca = unidades.filter((u) => u.placa === "");
check(sinPlaca.length === 4, "4 unidades sin placa (S/N de la póliza)");
const conVigencia = unidades.filter((u) => u.vigenciaDesde && u.vigenciaHasta);
check(conVigencia.length === 100, "100 unidades con vigencias parseadas");
const viejos = unidades.filter((u) => u.serie === "TM189189");
check(viejos.length === 1 && viejos[0].serie.length === 8, "serie corta TM189189 (8 car.) preservada");

// GridFS roundtrip: descargar y verificar que es PDF
const bucket = new GridFSBucket(db, { bucketName: "polizas_pdf" });
const chunks = [];
await new Promise((res, rej) => {
  const s = bucket.openDownloadStream(unidadTest.archivo.fileId);
  s.on("data", (c) => chunks.push(c));
  s.on("end", res);
  s.on("error", rej);
});
const pdfBuf = Buffer.concat(chunks);
check(pdfBuf.subarray(0, 5).toString() === "%PDF-", "GridFS entrega PDF (%PDF-)");
check(pdfBuf.length > 20000, "PDF con contenido sustancial");

// ---- SEED 2: misma correría → todas se 'renuevan', total se mantiene ----
r = spawnSync(process.execPath, ["scripts/seed.mjs"], { cwd: ROOT, env, encoding: "utf8", timeout: 300000 });
console.log("── stdout seed 2 ──\n", r.stdout);
console.log("── stderr seed 2 ──\n", r.stderr);
check(r.status === 0, "seed corrida 2 con exito");
check(/creadas:\s+0/.test(r.stdout), "seed 2: 0 nuevas");
check(/renovadas:\s+101/.test(r.stdout), "seed 2: 101 renovaciones (cada fila reemplaza la suya; último gana)");
check(/total BD:\s+100/.test(r.stdout), "seed 2: total sigue en 100");
const unidades2 = await db.collection("unidades").find({}, { projection: { serie: 1, cis: 1 } }).toArray();
const nv2 = unidades2.filter((u) => u.serie === "3GB3C9CG7FG501266");
check(nv2.length === 1 && nv2[0].cis === "20413125", "tras re-seed, NV5124A conserva el CIS de la última fila (20413125)");
const archivos2 = await db.collection("unidades").find({}, { projection: { "archivo.fileId": 1 } }).toArray();
const fileIds = new Set(archivos2.map((u) => String(u.archivo.fileId)));
check(archivos2.length === 100 && fileIds.size === 100, "sin fileIds huérfanos repetidos");

await client.close();
await mms.stop();
console.log("\n🏆 E2E COMPLETO: parser + seed + renovaciones + GridFS OK");
process.exit(0);
