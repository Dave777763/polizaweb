// Prueba del parser con el PDF real de la∫a carátula (sin MongoDB)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePdfBuffer } from "../lib/pdf.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT = path.resolve(ROOT, "..", "placas", "CARATULA_16211 20016322.pdf");
const SRC = process.argv[2] || DEFAULT;

const pdf = fs.readFileSync(SRC);
const parsed = await parsePdfBuffer(pdf);

const recs = parsed.records;
const sinSerie = recs.filter((r) => !r.serie);
const series = new Map();
recs.filter((r) => r.serie).forEach((r) => series.set(r.serie, (series.get(r.serie) || 0) + 1));
const dups = [...series.entries()].filter(([, n]) => n > 1);

console.log("totalPaginas:", parsed.paginas);
console.log("polizas detectadas:", recs.length);
console.log("paginas no asignadas:", parsed.noAsignadas.length ? parsed.noAsignadas : "ninguna");
console.log("sin serie:", sinSerie.length, sinSerie.map((r) => "pg" + (r.paginas?.[0] ?? "?")).join(", "));
console.log("series repetidas:", dups.map(([s, n]) => `${s} x${n}`).join(", ") || "ninguna");
console.log("\nprimeras 5:");
recs.slice(0, 5).forEach((r) =>
  console.log("  ", r.serie || "—", r.placa || "sinplaca", "cis", r.cis, "emp", r.empleado, "vig", r.vigenciaDesde?.slice(0, 10), "→", r.vigenciaHasta?.slice(0, 10))
);
console.log("últimas 3:");
recs.slice(-3).forEach((r) =>
  console.log("  ", r.serie || "—", r.placa || "sinplaca", "cis", r.cis, "emp", r.empleado)
);
