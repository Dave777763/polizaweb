import { ObjectId } from "mongodb";
import { getDb, deletePdf, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });
    const { id } = await params;
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      return Response.json({ ok: false, error: "Id inválido" }, { status: 400 });
    }
    const db = await getDb();
    const unidad = await db.collection("unidades").findOne({ _id: oid });
    if (!unidad) return Response.json({ ok: false, error: "Unidad no encontrada" }, { status: 404 });
    if (user.rol !== "admin" && unidad.ownerId?.toString() !== user.sub) {
      return Response.json({ ok: false, error: "No tienes acceso a esta unidad" }, { status: 403 });
    }
    return Response.json({
      ok: true,
      unidad: {
        id: unidad._id.toString(),
        serie: unidad.serie,
        placa: unidad.placa,
        cis: unidad.cis,
        poliza: unidad.poliza,
        empleado: unidad.empleado,
        modelo: unidad.modelo,
        descripcion: unidad.descripcion,
        propietario: unidad.propietario,
        vigenciaDesde: unidad.vigenciaDesde,
        vigenciaHasta: unidad.vigenciaHasta,
        archivo: {
          nombre: unidad.archivo?.nombre,
          tamano: unidad.archivo?.tamano,
          paginas: unidad.archivo?.paginas?.length || unidad.archivo?.paginas,
        },
        ownerEmail: unidad.ownerEmail,
        subido: unidad.subido,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });
    const { id } = await params;
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      return Response.json({ ok: false, error: "Id inválido" }, { status: 400 });
    }
    const db = await getDb();
    const col = db.collection("unidades");
    const unidad = await col.findOne({ _id: oid });
    if (!unidad) return Response.json({ ok: false, error: "No encontrada" }, { status: 404 });
    if (user.rol !== "admin" && unidad.ownerId?.toString() !== user.sub) {
      return Response.json({ ok: false, error: "No tienes permiso" }, { status: 403 });
    }
    await deletePdf(unidad.archivo?.fileId);
    await col.deleteOne({ _id: oid });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
