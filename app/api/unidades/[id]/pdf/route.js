import { ObjectId } from "mongodb";
import { Readable } from "node:stream";
import { getDb, getBucket, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/unidades/[id]/pdf — sirve el PDF desde GridFS
export async function GET(req, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) return new Response("Sin sesión", { status: 401 });
    const { id } = await params;
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      return new Response("Id inválido", { status: 400 });
    }
    const db = await getDb();
    const unidad = await db.collection("unidades").findOne({ _id: oid });
    if (!unidad) return new Response("No encontrada", { status: 404 });
    const bucket = await getBucket();
    const streamNode = bucket.openDownloadStream(unidad.archivo.fileId);
    const webStream = Readable.toWeb(streamNode);
    const nombre = encodeURIComponent(unidad.archivo.nombre || `poliza-${id}`);
    const download = req.nextUrl.searchParams.get("download");
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${nombre}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
