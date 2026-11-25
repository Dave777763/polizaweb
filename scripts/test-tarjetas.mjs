// Prueba el parser de tarjetas contra una carpeta de PDFs.
//   node scripts/test-tarjetas.mjs --dir=..\tarjetacirulacion\limpios
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leerTarjeta, claveTarjeta } from "../lib/tarjetas.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dirArg = args.find((a) => a.startsWith("--dir="));
const DIR = dirArg ? path.resolve(dirArg.split("=").slice(1).join("=")) : path.resolve(ROOT, "..", "tarjetacirulacion", "limpios");

const archivos = fs
  .readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith(".pdf"))
  .sort();

console.log(`📂 ${archivos.length} PDFs en ${DIR}\n`);

let ok = 0;
const problemas = [];
const vistos = new Map();

for (const f of archivos) {
  const buffer = fs.readFileSync(path.join(DIR, f));
  try {
    const d = await leerTarjeta(buffer);
    const faltan = [];
    if (!d.serie) faltan.push("serie");
    if (!d.placas) faltan.push("placas");
    if (!d.folio) faltan.push("folio");
    if (!d.propietario) faltan.push("propietario");
    if (!d.fechaExpedicion) faltan.push("fecha");
    if (faltan.length) problemas.push([f, faltan.join(","), d]);
    else ok++;

    const clave = claveTarjeta(d);
    if (vistos.has(clave)) problemas.push([f, `DUPLICADO de ${vistos.get(clave)}`, d]);
    else vistos.set(clave, f);

    console.log(
      `${f.slice(-12).padEnd(12)} ${(d.placas || "—").padEnd(9)} ${(d.serie || "—").padEnd(18)} ` +
        `folio=${(d.folio || "—").padEnd(8)} ${(d.propietario || "—").slice(0, 34).padEnd(34)} ` +
        `${(d.marca || "—").slice(0, 22).padEnd(22)} ${String(d.anio || "—").padEnd(5)} ` +
        `exp=${d.fechaExpedicion || "—"} vig=${d.vigencia || "—"}`
    );
  } catch (e) {
    problemas.push([f, "ERROR " + (e?.message || e)]);
  }
}

console.log(`\n✅ completos: ${ok}/${archivos.length}`);
if (problemas.length) {
  console.log("\n⚠️  revisar:");
  for (const [f, motivo, d] of problemas) console.log(`   ${f} → ${motivo}`);
}
