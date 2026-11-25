import { ObjectId } from "mongodb";
import { getDb, deletePdf, errorResponse, BUCKETS } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/tarjetas/[id] — borra registro y PDF (admin o quien la subió)
export async function DELETE(req, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return Response.json({ ok: false, error: "Id no válido" }, { status: 400 });
    }

    const db = await getDb();
    const col = db.collection("tarjetas");
    const doc = await col.findOne({ _id: new ObjectId(id) });
    if (!doc) return Response.json({ ok: false, error: "No existe" }, { status: 404 });

    const esDueno = doc.ownerId && doc.ownerId.toString() === user.sub;
    if (user.rol !== "admin" && !esDueno) {
      return Response.json({ ok: false, error: "Solo el admin o quien la subió" }, { status: 403 });
    }

    await col.deleteOne({ _id: doc._id });
    await deletePdf(doc.archivo?.fileId, BUCKETS.tarjetas);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
