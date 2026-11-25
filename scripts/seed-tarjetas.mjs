// ============================================================
// PólizaWeb — Carga masiva de tarjetas de circulación
//
//   npm run seed:tarjetas -- --dir="..\tarjetacirulacion\limpios"
//
// Lee cada PDF, extrae placa/serie/folio/propietario… y lo guarda en
// MongoDB + GridFS (bucket tarjetas_pdf). Regla: por serie o placa,
// la última tarjeta sustituye a la anterior.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, GridFSBucket } from "mongodb";
import { Readable } from "node:stream";
import { leerTarjeta, claveTarjeta } from "../lib/tarjetas.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(PROJECT_ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const getArg = (k) => {
  const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  return a?.includes("=") ? a.split("=").slice(1).join("=").trim() : undefined;
};

const DIR = path.resolve(
  getArg("dir") || path.resolve(PROJECT_ROOT, "..", "tarjetacirulacion", "limpios")
);
const OWNER = (getArg("owner") || "seed@import").toLowerCase();
const DB_NAME = process.env.MONGODB_DB || "polizaweb";
const BUCKET = "tarjetas_pdf";

function fail(msg) {
  console.error("❌ " + msg);
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  fail("Falta MONGODB_URI en app-repo/.env.local (o en la variable de entorno)");
}

function subir(db, buffer, filename) {
  const bucket = new GridFSBucket(db, { bucketName: BUCKET });
  return new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(filename);
    Readable.from(buffer).pipe(up);
    up.on("finish", () => resolve(up.id));
    up.on("error", reject);
  });
}

function fechaDeVigencia(vigencia) {
  const anio = Number(vigencia);
  if (!Number.isFinite(anio) || anio < 1980 || anio > 2100) return null;
  return new Date(Date.UTC(anio, 11, 31));
}

async function main() {
  if (!fs.existsSync(DIR)) fail(`No existe la carpeta: ${DIR}`);
  const archivos = fs
    .readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  if (!archivos.length) fail(`Sin PDFs en ${DIR}`);

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`✅ MongoDB ${db.databaseName} · 📂 ${archivos.length} PDFs en ${DIR}`);

  const col = db.collection("tarjetas");
  await col.createIndex({ serie: 1 }).catch(() => {});
  await col.createIndex({ placas: 1 }).catch(() => {});

  let nuevas = 0;
  let reemplazos = 0;
  let sinClave = 0;
  const errores = [];

  for (const f of archivos) {
    const buffer = fs.readFileSync(path.join(DIR, f));
    let d;
    try {
      d = await leerTarjeta(buffer);
    } catch (e) {
      errores.push(`${f}: ${e?.message || e}`);
      continue;
    }

    const clave = claveTarjeta(d);
    if (!clave) {
      sinClave++;
      errores.push(`${f}: sin serie ni placa`);
      continue;
    }

    const anterior = await col.findOne(
      d.serie ? { serie: d.serie } : { placas: d.placas },
      { projection: { archivo: 1 } }
    );
    if (anterior) {
      await col.deleteOne({ _id: anterior._id });
      if (anterior.archivo?.fileId) {
        await new GridFSBucket(db, { bucketName: BUCKET })
          .delete(anterior.archivo.fileId)
          .catch(() => {});
      }
      reemplazos++;
    } else {
      nuevas++;
    }

    const nombre = `tarjeta_${clave}.pdf`;
    const fileId = await subir(db, buffer, nombre);
    await col.insertOne({
      serie: d.serie,
      placas: d.placas,
      folio: d.folio,
      propietario: d.propietario,
      marca: d.marca,
      submarca: d.submarca,
      anio: d.anio,
      repuve: d.repuve,
      claseTipo: d.claseTipo,
      capacidad: d.capacidad,
      fechaExpedicion: d.fechaExpedicion || null,
      vigencia: d.vigencia || "",
      vigenciaHasta: fechaDeVigencia(d.vigencia),
      texto: d.texto,
      archivo: { fileId, nombre, tamano: buffer.length },
      ownerId: null,
      ownerEmail: OWNER,
      subido: new Date(),
    });
    process.stdout.write(
      `\r   ${d.placas || d.serie} · ${(d.propietario || "").slice(0, 32).padEnd(32)}`
    );
  }

  console.log(`\n\n📦 Resumen:
   nuevas:      ${nuevas}
   reemplazos:  ${reemplazos}
   sin clave:   ${sinClave}
   total BD:    ${await col.countDocuments()}`);

  if (errores.length) {
    console.log("\n⚠️  con problemas:");
    errores.forEach((e) => console.log("   " + e));
  }

  await client.close();
  console.log("🎉 Listo.");
}

main().catch((e) => fail(e?.message || String(e)));
