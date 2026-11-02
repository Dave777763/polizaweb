// ============================================================
// PólizaWeb — Seed inicial
//   1) Crea (o reemplaza) pólizas en MongoDB Atlas desde los PDF
//      separados de ../placas/por_serie (regla: último gana por serie)
//   2) Opcional: crea el primer usuario admin:
//        npm run seed -- --admin --email=tucorreo@x.com --pass=Micontraseña1
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { MongoClient, GridFSBucket } from "mongodb";
import { Readable } from "node:stream";
import { parsePdfBuffer } from "../lib/pdf.js";

// ---- carga .env.local manual ----
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(PROJECT_ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// ---- args ----
const args = process.argv.slice(2);
const getArg = (k) => {
  const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  return a?.includes("=") ? a.split("=").slice(1).join("=").trim() : undefined;
};
const wantAdmin = args.includes("--admin");
const adminEmail = (getArg("email") || process.env.SEED_ADMIN_EMAIL || "").toLowerCase();
const adminPass = getArg("pass") || process.env.SEED_ADMIN_PASSWORD || "";

const DIR = getArg("dir") || path.resolve(PROJECT_ROOT, "..", "placas");
const PDF_DIR = path.join(DIR, "por_serie");
const DB_NAME = process.env.MONGODB_DB || "polizaweb";

function fail(msg) {
  console.error("❌ " + msg);
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  fail(
    "Falta MONGODB_URI en polizaweb/.env.local — pértela del Atlas: mongodb+srv://usuario:password@host"
  );
}

// ---- util GridFS ----
async function subirBuffer(db, buffer, filename) {
  const bucket = new GridFSBucket(db, { bucketName: "polizas_pdf" });
  return new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(filename);
    Readable.from(buffer).pipe(up);
    up.on("finish", () => resolve(up.id));
    up.on("error", reject);
  });
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log("✅ Conectado a MongoDB:", db.databaseName);

  // índices
  await db.collection("unidades").createIndex({ serie: 1 }, { unique: true }).catch(() => {});
  await db.collection("usuarios").createIndex({ email: 1 }, { unique: true }).catch(() => {});

  // admin
  if (wantAdmin) {
    if (!adminEmail || !adminPass) {
      console.warn("⚠️  --admin requiere --email y tambien --pass");
    } else {
      const passwordHash = await bcrypt.hash(adminPass, 10);
      await db.collection("usuarios").deleteOne({ email: adminEmail }); // reset de admin del seed
      await db.collection("usuarios").insertOne({
        email: adminEmail,
        nombre: "Administrador",
        rol: "admin",
        passwordHash,
        creado: new Date(),
      });
      console.log("✅ Admin listo:", adminEmail);
    }
  } else {
    const usuarios = await db.collection("usuarios").countDocuments();
    if (usuarios === 0) {
      console.warn(
        "⚠️  No hay usuarios. Crea el primero con:\n   npm run seed -- --admin --email=tucorreo@x.com --pass=TU_CONTRASEÑA"
      );
    }
  }

  // pólizas
  if (!fs.existsSync(PDF_DIR)) fail(`No existe la carpeta de PDFs separados: ${PDF_DIR}`);
  const archivos = fs
    .readdirSync(PDF_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  console.log(`📂 ${archivos.length} PDFs en ${PDF_DIR}`);

  let creadas = 0, renovadas = 0, sinSerie = 0;
  for (const f of archivos) {
    const buffer = fs.readFileSync(path.join(PDF_DIR, f));
    let parsed;
    try {
      parsed = await parsePdfBuffer(buffer);
    } catch (e) {
      console.warn(`⚠️  no legible: ${f} (${e?.message || e})`);
      continue;
    }
    const recs = parsed.records.filter((r) => r.serie);
    sinSerie += parsed.records.length - recs.length;
    for (const r of recs) {
      // último gana: borra si ya existe esta serie
      const existing = await db.collection("unidades").findOne({ serie: r.serie }, { projection: { archivo: 1 } });
      if (existing) {
        if (existing.archivo?.fileId) {
          await new GridFSBucket(db, { bucketName: "polizas_pdf" })
            .delete(existing.archivo.fileId)
            .catch(() => {});
        }
        await db.collection("unidades").deleteOne({ _id: existing._id });
        renovadas++;
      } else {
        creadas++;
      }
      const nombre = `${r.serie}_${r.placa || "SINPLACA"}.pdf`;
      const fileId = await subirBuffer(db, buffer, nombre);
      await db.collection("unidades").insertOne({
        serie: r.serie,
        placa: r.placa,
        cis: r.cis,
        poliza: r.poliza || null,
        empleado: r.empleado,
        modelo: r.modelo,
        descripcion: r.descripcion,
        propietario: r.propietario,
        vigenciaDesde: r.vigenciaDesde ? new Date(r.vigenciaDesde) : null,
        vigenciaHasta: r.vigenciaHasta ? new Date(r.vigenciaHasta) : null,
        ownerId: null,
        ownerEmail: "seed@import",
        archivo: { fileId, nombre, tamano: buffer.length },
        subido: new Date(),
      });
      process.stdout.write(`\r   ${creadas + renovadas} procesadas…`);
    }
  }
  console.log(`\n\n📦 Resumen del seed:
   creadas:    ${creadas}
   renovadas:  ${renovadas}
   sin serie:  ${sinSerie}
   total BD:   ${await db.collection("unidades").countDocuments()}`);
  await client.close();
  console.log("🎉 Seed terminado. Ahora: npm run dev  y abre http://localhost:3000");
}

main().catch((e) => {
  fail(e?.message || String(e));
});
