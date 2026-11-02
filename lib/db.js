import { MongoClient, GridFSBucket } from "mongodb";
import { Readable } from "node:stream";

function uri() {
  return process.env.MONGODB_URI;
}

export function mongoConfigured() {
  return Boolean(uri());
}

export async function getDb() {
  if (!uri()) {
    const e = new Error(
      "MONGODB_URI no está configurada en .env.local (¿ya creaste tu cluster en MongoDB Atlas?)"
    );
    e.code = "FALTA_MONGODB_URI";
    throw e;
  }
  const g = globalThis;
  if (!g.__pwMongoPromise) {
    g.__pwMongoPromise = new MongoClient(uri(), { maxPoolSize: 10 }).connect();
  }
  const client = await g.__pwMongoPromise;
  return client.db(process.env.MONGODB_DB || "polizaweb");
}

export async function getBucket() {
  const db = await getDb();
  return new GridFSBucket(db, { bucketName: "polizas_pdf" });
}

// Guarda un PDF en GridFS y devuelve el fileId
export async function uploadPdfBuffer(buffer, filename) {
  const bucket = await getBucket();
  const fileId = await new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(filename || "poliza.pdf");
    Readable.from(buffer).pipe(up);
    up.on("finish", () => resolve(up.id));
    up.on("error", reject);
  });
  return fileId;
}

// Borra con garantía best-effort (los orfanatos no deben romper el flujo)
export async function deletePdf(fileId) {
  if (!fileId) return;
  try {
    const bucket = await getBucket();
    await bucket.delete(fileId);
  } catch (e) {
    console.warn("No se pudo borrar archivo de GridFS:", e?.message || e);
  }
}

export function errorResponse(e) {
  if (e && e.code === "FALTA_MONGODB_URI") {
    return Response.json(
      { ok: false, error: "Configura MONGODB_URI en .env.local" },
      { status: 503 }
    );
  }
  console.error(e);
  return Response.json(
    { ok: false, error: e?.message || "Error interno" },
    { status: 500 }
  );
}
