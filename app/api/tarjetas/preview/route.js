import { getDb, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { leerTarjeta, claveTarjeta } from "@/lib/tarjetas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/tarjetas/preview — lee uno o varios PDFs y devuelve los datos sin guardar.
// Marca estado: nueva | renovacion | renovacion-en-lote
export async function POST(req) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });

    const form = await req.formData();
    const files = form.getAll("files").filter((f) => typeof f === "object" && f?.name);
    if (!files.length) return Response.json({ ok: false, error: "Sin archivos" }, { status: 400 });

    const rows = [];
    for (const f of files) {
      const buffer = Buffer.from(await f.arrayBuffer());
      try {
        const datos = await leerTarjeta(buffer);
        const clave = claveTarjeta(datos);
        rows.push({
          archivo: f.name,
          tamano: buffer.length,
          paginas: datos.paginas || 1,
          clave,
          serie: datos.serie,
          placas: datos.placas,
          folio: datos.folio,
          propietario: datos.propietario,
          marca: datos.marca,
          submarca: datos.submarca,
          anio: datos.anio,
          repuve: datos.repuve,
          claseTipo: datos.claseTipo,
          capacidad: datos.capacidad,
          fechaExpedicion: datos.fechaExpedicion,
          vigencia: datos.vigencia,
          texto: datos.texto,
        });
      } catch (e) {
        rows.push({
          archivo: f.name,
          tamano: buffer.length,
          paginas: 0,
          estado: "inlegible",
          mensaje: e?.message || "PDF no legible",
        });
      }
    }

    // Estado contra la base y contra el propio lote
    const claves = [...new Set(rows.filter((r) => r.clave).map((r) => r.clave))];
    let existentes = new Map();
    if (claves.length) {
      const db = await getDb();
      const docs = await db
        .collection("tarjetas")
        .find(
          { $or: [{ serie: { $in: claves } }, { placas: { $in: claves } }] },
          { projection: { serie: 1, placas: 1 } }
        )
        .toArray();
      for (const d of docs) {
        if (d.serie) existentes.set(d.serie.toUpperCase(), d);
        if (d.placas) existentes.set(d.placas.toUpperCase(), d);
      }
    }

    const vistos = new Set();
    for (const r of rows) {
      if (r.estado === "inlegible") continue;
      if (!r.clave) {
        r.estado = "sin-clave";
      } else if (vistos.has(r.clave)) {
        r.estado = "renovacion-en-lote";
      } else {
        vistos.add(r.clave);
        r.estado = existentes.has(r.clave) ? "renovacion" : "nueva";
      }
    }

    return Response.json({
      ok: true,
      rows,
      resumen: {
        total: rows.length,
        nuevas: rows.filter((r) => r.estado === "nueva").length,
        renovaciones: rows.filter((r) => r.estado === "renovacion").length,
        repetidas: rows.filter((r) => r.estado === "renovacion-en-lote").length,
        sinClave: rows.filter((r) => r.estado === "sin-clave").length,
        inlegibles: rows.filter((r) => r.estado === "inlegible").length,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
