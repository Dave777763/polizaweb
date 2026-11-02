import { getDb, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { vigenciaChip } from "@/lib/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req) {
  try {
    const user = await getSessionUser();
    if (!user || user.rol !== "admin") {
      return Response.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }
    const db = await getDb();
    const docs = await db.collection("unidades").find({}).sort({ subido: -1 }).toArray();
    const filas = [
      ["archivo", "serie", "placa", "cis", "empleado", "poliza", "modelo", "descripcion", "propietario", "vigencia_desde", "vigencia_hasta", "subida_por", "subido"].join(","),
    ];
    docs.forEach((u) => {
      filas.push(
        [
          u.archivo?.nombre || "",
          u.serie, u.placa, u.cis, u.empleado, u.poliza || "", u.modelo || "",
          u.descripcion || "", u.propietario || "",
          u.vigenciaDesde ? u.vigenciaDesde.toISOString() : "",
          u.vigenciaHasta ? u.vigenciaHasta.toISOString() : "",
          u.ownerEmail || "",
          u.subido ? u.subido.toISOString() : "",
        ]
          .map(csvCell)
          .join(",")
      );
    });
    void vigenciaChip;
    const contenido = "\uFEFF" + filas.join("\r\n");
    return new Response(contenido, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="unidades.csv"',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
