import { ObjectId } from "mongodb";
import { getDb, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req, { params }) {
  try {
    const me = await getSessionUser();
    if (!me || me.rol !== "admin") {
      return Response.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }
    const { id } = await params;
    if (id === me.sub) {
      return Response.json({ ok: false, error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
    }
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      return Response.json({ ok: false, error: "Id inválido" }, { status: 400 });
    }
    const db = await getDb();
    const r = await db.collection("usuarios").deleteOne({ _id: oid });
    if (!r.deletedCount) return Response.json({ ok: false, error: "No encontrado" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
