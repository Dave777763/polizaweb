import { ObjectId } from "mongodb";
import { getDb, uploadPdfBuffer, deletePdf, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { leerArchivos, prepararFilas } from "@/lib/policies";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/policies/confirm — guarda cada fila, EN ORDEN.
// Regla de renovación: si la serie ya existe (o apareció antes en este mismo
// lote), se borra el documento y su PDF anterior y queda el nuevo ("último gana").
// Las filas SIN serie se rechazan y no se guardan.
export async function POST(req) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });
    const files = await leerArchivos(req);
    if (!files.length) return Response.json({ ok: false, error: "Sin archivos" }, { status: 400 });

    const rows = await prepararFilas(files);
    if (rows.some((r) => r.estado === "inlegible")) {
      return Response.json(
        {
          ok: false,
          error: "Uno de los archivos no se pudo leer como PDF. Revisa que todos sean .pdf válidos.",
        },
        { status: 400 }
      );
    }

    const db = await getDb();
    const col = db.collection("unidades");

    let creadas = 0;
    let renovadas = 0;
    const rechazadas = [];

    for (const fila of rows) {
      if (!fila.serie) {
        rechazadas.push({
          archivo: fila.archivo,
          paginas: fila.paginas,
          placa: fila.placa,
          cis: fila.cis,
        });
        continue;
      }

      // upsert por serie: borrar el existente (doc + archivo de GridFS), luego insertar
      const existing = await col.findOne({ serie: fila.serie }, { projection: { archivo: 1 } });
      if (existing) {
        await deletePdf(existing.archivo?.fileId);
        await col.deleteOne({ _id: existing._id });
        renovadas++;
      }

      const nombreArchivo = `${fila.serie}_${fila.placa || "SINPLACA"}.pdf`;
      const fileId = await uploadPdfBuffer(fila.buffer, nombreArchivo);

      await col.insertOne({
        serie: fila.serie,
        placa: fila.placa,
        cis: fila.cis,
        poliza: fila.poliza,
        empleado: fila.empleado,
        modelo: fila.modelo,
        descripcion: fila.descripcion,
        propietario: fila.propietario,
        vigenciaDesde: fila.vigenciaDesde ? new Date(fila.vigenciaDesde) : null,
        vigenciaHasta: fila.vigenciaHasta ? new Date(fila.vigenciaHasta) : null,
        ownerId: new ObjectId(user.sub),
        ownerEmail: user.email,
        archivo: { fileId, nombre: nombreArchivo, tamano: fila.tamano },
        subido: new Date(),
      });
      if (!existing) creadas++;
    }

    return Response.json({
      ok: true,
      resumen: { creadas, renovadas, rechazadas: rechazadas.length },
      rechazadas,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
