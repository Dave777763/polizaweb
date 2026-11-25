// ============================================================
// Prueba de punta a punta de la sección Tarjetas:
//   Mongo en memoria + seed + `next start` + llamadas HTTP reales
//   node scripts/test-e2e-tarjetas.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { MongoClient, GridFSBucket } from "mongodb";
import { Readable } from "node:stream";
import { MongoMemoryServer } from "mongodb-memory-server";
import bcrypt from "bcryptjs";
import { leerTarjeta, claveTarjeta } from "../lib/tarjetas.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PDF_DIR = process.env.TARJETAS_DIR || path.resolve(ROOT, "..", "tarjetacirulacion", "limpios");
const PORT = 3101;
const BASE = `http://localhost:${PORT}`;
const DB_NAME = "polizaweb";
const BUCKET = "tarjetas_pdf";

const log = (...a) => console.log(...a);
const ok = (cond, msg) => {
  if (!cond) throw new Error("FALLO: " + msg);
  log("  ✓ " + msg);
};

function subir(db, buffer, filename) {
  const bucket = new GridFSBucket(db, { bucketName: BUCKET });
  return new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(filename);
    Readable.from(buffer).pipe(up);
    up.on("finish", () => resolve(up.id));
    up.on("error", reject);
  });
}

async function esperar(url, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  if (!fs.existsSync(PDF_DIR)) throw new Error(`No existe ${PDF_DIR}`);
  const pdfs = fs.readdirSync(PDF_DIR).filter((f) => f.endsWith(".pdf")).slice(0, 3);
  if (pdfs.length < 3) throw new Error("Se necesitan al menos 3 PDFs de prueba");

  log("1) Mongo en memoria…");
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);
  log("   ", uri);

  log("2) Usuario admin de prueba…");
  await db.collection("usuarios").insertOne({
    email: "prueba@polizaweb.test",
    nombre: "Prueba",
    rol: "admin",
    passwordHash: await bcrypt.hash("Prueba123", 10),
    creado: new Date(),
  });

  log("3) Sembrando tarjetas de ejemplo…");
  for (const f of pdfs) {
    const buffer = fs.readFileSync(path.join(PDF_DIR, f));
    const d = await leerTarjeta(buffer);
    const clave = claveTarjeta(d);
    const nombre = `tarjeta_${clave}.pdf`;
    const fileId = await subir(db, buffer, nombre);
    await db.collection("tarjetas").insertOne({
      ...d,
      vigenciaHasta: d.vigencia ? new Date(Date.UTC(Number(d.vigencia), 11, 31)) : null,
      archivo: { fileId, nombre, tamano: buffer.length },
      ownerId: null,
      ownerEmail: "seed@import",
      subido: new Date(),
    });
  }

  log("4) Levantando next start…");
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      MONGODB_URI: uri,
      MONGODB_DB: DB_NAME,
      AUTH_SECRET: "secreto-de-prueba",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (b) => process.stderr.write("[next] " + b.toString().slice(0, 300)));

  const arriba = await esperar(`${BASE}/login`);
  if (!arriba) throw new Error("next start no respondió");

  try {
    log("5) Login…");
    const resLogin = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "prueba@polizaweb.test", password: "Prueba123" }),
    });
    ok(resLogin.status === 200, "login responde 200");
    const setCookie = resLogin.headers.getSetCookie?.() || [];
    const cookie = setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith("pw_session="));
    ok(Boolean(cookie), "recibe cookie de sesión");
    const H = { Cookie: cookie };

    log("6) GET /api/tarjetas (sembradas)…");
    const rLista = await fetch(`${BASE}/api/tarjetas`, { headers: H });
    const dLista = await rLista.json();
    ok(rLista.status === 200 && dLista.ok, "lista responde ok");
    ok(dLista.tarjetas.length === pdfs.length, `lista devuelve ${pdfs.length} tarjetas`);
    const primera = dLista.tarjetas[0];
    ok(Boolean(primera.placas && primera.serie), "las tarjetas traen placa y serie");
    ok(primera.archivo?.tamano > 1000, "las tarjetas traen PDF");

    log("7) Búsqueda…");
    const rBusca = await fetch(`${BASE}/api/tarjetas?q=${encodeURIComponent(primera.placas)}`, { headers: H });
    const dBusca = await rBusca.json();
    ok(dBusca.tarjetas.length >= 1, "buscar por placa encuentra la tarjeta");

    log("8) Filtro por serie (detalle de unidad)…");
    const rSerie = await fetch(`${BASE}/api/tarjetas?serie=${encodeURIComponent(primera.serie)}`, { headers: H });
    const dSerie = await rSerie.json();
    ok(dSerie.tarjetas.length === 1 && dSerie.tarjetas[0].id === primera.id, "filtro por serie exacto");

    log("9) Preview de un PDF…");
    const fdPrev = new FormData();
    const buf = fs.readFileSync(path.join(PDF_DIR, pdfs[0]));
    fdPrev.append("files", new Blob([buf], { type: "application/pdf" }), pdfs[0]);
    const rPrev = await fetch(`${BASE}/api/tarjetas/preview`, { method: "POST", body: fdPrev, headers: H });
    const dPrev = await rPrev.json();
    ok(rPrev.status === 200 && dPrev.ok, "preview responde ok");
    const fila = dPrev.rows[0];
    ok(Boolean(fila.placas && fila.serie), "preview detecta placa y serie");
    ok(fila.estado === "renovacion", "marca renovación porque ya existe");

    log("10) Alta de una tarjeta nueva…");
    const fdNew = new FormData();
    fdNew.append("file", new Blob([buf], { type: "application/pdf" }), "nueva.pdf");
    fdNew.append("serie", "ZZ9ZZZ99Z99999999");
    fdNew.append("placas", "ZZ9999Z");
    fdNew.append("folio", "0999999");
    fdNew.append("propietario", "PRUEBA SA DE CV");
    fdNew.append("vigencia", "2027");
    const rNew = await fetch(`${BASE}/api/tarjetas`, { method: "POST", body: fdNew, headers: H });
    const dNew = await rNew.json();
    ok(rNew.status === 200 && dNew.ok, "POST crea la tarjeta");
    ok(dNew.reemplazo === false, "no reemplaza nada");

    const rLista2 = await (await fetch(`${BASE}/api/tarjetas`, { headers: H })).json();
    const creada = rLista2.tarjetas.find((t) => t.placas === "ZZ9999Z");
    ok(Boolean(creada), "la tarjeta nueva aparece en la lista");

    log("11) PDF de la tarjeta…");
    const rPdf = await fetch(`${BASE}/api/tarjetas/${creada.id}/pdf`, { headers: H });
    const bytes = Buffer.from(await rPdf.arrayBuffer());
    ok(rPdf.status === 200, "GET pdf responde 200");
    ok(bytes.subarray(0, 4).toString() === "%PDF", "el archivo es un PDF");
    ok(bytes.length > 1000, "el PDF no está vacío");

    log("12) Reemplazo por misma placa…");
    const fdRep = new FormData();
    fdRep.append("file", new Blob([buf], { type: "application/pdf" }), "reemplazo.pdf");
    fdRep.append("serie", "");
    fdRep.append("placas", "ZZ9999Z");
    fdRep.append("folio", "0999998");
    fdRep.append("propietario", "PRUEBA 2 SA DE CV");
    fdRep.append("vigencia", "2028");
    const rRep = await fetch(`${BASE}/api/tarjetas`, { method: "POST", body: fdRep, headers: H });
    const dRep = await rRep.json();
    ok(rRep.status === 200 && dRep.reemplazo === true, "reemplaza la tarjeta de la misma placa");

    const lista3 = await (await fetch(`${BASE}/api/tarjetas`, { headers: H })).json();
    const iguales = lista3.tarjetas.filter((t) => t.placas === "ZZ9999Z");
    ok(iguales.length === 1 && iguales[0].folio === "0999998", "queda solo la última");

    log("13) Borrado…");
    const rDel = await fetch(`${BASE}/api/tarjetas/${iguales[0].id}`, { method: "DELETE", headers: H });
    ok(rDel.status === 200, "DELETE responde 200");
    const lista4 = await (await fetch(`${BASE}/api/tarjetas`, { headers: H })).json();
    ok(!lista4.tarjetas.some((t) => t.placas === "ZZ9999Z"), "la tarjeta ya no está");

    log("\n🎉 Todas las pruebas pasaron");
  } finally {
    server.kill();
    await client.close();
    await mongo.stop();
  }
}

main().catch((e) => {
  console.error("\n❌", e?.message || e);
  process.exit(1);
});
