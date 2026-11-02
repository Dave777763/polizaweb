import { getSessionUser } from "@/lib/session";
import { errorResponse } from "@/lib/db";
import { leerArchivos, prepararFilas, marcarEstados } from "@/lib/policies";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/policies/preview — analiza los PDF y regresa filas con estado, sin guardar
export async function POST(req) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });
    const files = await leerArchivos(req);
    if (!files.length) return Response.json({ ok: false, error: "Sin archivos" }, { status: 400 });
    const rows = await prepararFilas(files);
    await marcarEstados(rows);
    // nunca regresar buffers al cliente
    const rowsLivianas = rows.map(({ buffer, ...rest }) => rest);
    const resumen = {
      filas: rowsLivianas.length,
      nuevas: rowsLivianas.filter((r) => r.estado === "nueva").length,
      renovaciones: rowsLivianas.filter((r) => r.estado === "renovacion" || r.estado === "renovacion-en-lote").length,
      rechazadas: rowsLivianas.filter((r) => r.estado === "rechazada").length,
    };
    return Response.json({ ok: true, rows: rowsLivianas, resumen });
  } catch (e) {
    return errorResponse(e);
  }
}
