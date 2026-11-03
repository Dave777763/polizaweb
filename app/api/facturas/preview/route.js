import { getSessionUser } from "@/lib/session";
import { errorResponse } from "@/lib/db";
import { leerFactura } from "@/lib/facturas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/facturas/preview — lee el PDF y devuelve los datos sin guardar
export async function POST(req) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file !== "object" || !file.name) {
      return Response.json({ ok: false, error: "Sin archivo" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    let datos;
    try {
      datos = await leerFactura(buffer);
    } catch {
      return Response.json({ ok: false, error: "No se pudo leer el PDF" }, { status: 400 });
    }
    return Response.json({ ok: true, datos });
  } catch (e) {
    return errorResponse(e);
  }
}
