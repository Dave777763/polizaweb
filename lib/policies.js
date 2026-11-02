// Lógica compartida de subida: parsea y clasifica filas (solo lado servidor)
import { getDb } from "@/lib/db";
import { parsePdfBuffer } from "@/lib/pdf";

// Lee los archivos 'files' del FormData
export async function leerArchivos(req) {
  const form = await req.formData();
  return form.getAll("files").filter((f) => typeof f === "object" && f?.name);
}

// Convierte los archivos subidos en filas de datos (sin escribir en BD)
export async function prepararFilas(files) {
  const rows = [];
  for (const f of files) {
    const buffer = Buffer.from(await f.arrayBuffer());
    let parsed;
    try {
      parsed = await parsePdfBuffer(buffer);
    } catch (e) {
      rows.push({
        archivo: f.name,
        error: true,
        mensaje: `No se pudo leer: ${e?.message || e}`,
        estado: "inlegible",
      });
      continue;
    }
    parsed.records.forEach((r) => {
      rows.push({
        buffer, // solo se usa en confirm; preview lo elimina antes de responder
        archivo: f.name,
        paginas: (r.paginas || []).join("-"),
        serie: r.serie,
        placa: r.placa,
        cis: r.cis,
        poliza: r.poliza,
        empleado: r.empleado,
        modelo: r.modelo,
        descripcion: r.descripcion,
        propietario: r.propietario,
        vigenciaDesde: r.vigenciaDesde,
        vigenciaHasta: r.vigenciaHasta,
        tamano: buffer.length,
      });
    });
  }
  return rows;
}

// Marca estados sin escribir: nueva | renovacion | renovacion-en-lote | rechazada
// Regla: por N.º de serie, el último subido reemplaza lo anterior.
export async function marcarEstados(rows) {
  const series = [...new Set(rows.filter((r) => r.serie).map((r) => r.serie))];
  const db = await getDb();
  const col = db.collection("unidades");
  const existentes = series.length
    ? await col
        .find({ serie: { $in: series } }, { projection: { serie: 1, cis: 1, vigenciaHasta: 1 } })
        .toArray()
    : [];
  const mapExistentes = new Map(existentes.map((u) => [u.serie, u]));

  const visto = new Set();
  for (const r of rows) {
    if (!r.serie) {
      r.estado = "rechazada";
      continue;
    }
    if (visto.has(r.serie)) {
      r.estado = "renovacion-en-lote";
    } else {
      visto.add(r.serie);
      r.estado = mapExistentes.has(r.serie) ? "renovacion" : "nueva";
    }
  }
  return mapExistentes;
}
