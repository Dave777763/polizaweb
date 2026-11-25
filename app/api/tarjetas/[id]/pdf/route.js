import { Readable } from "node:stream";
import { ObjectId } from "mongodb";
import { getDb, getBucket, errorResponse, BUCKETS } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/tarjetas/[id]/pdf — sirve el PDF de la tarjeta
export async function GET(req, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) return new Response("Sin sesión", { status: 401 });

    const { id } = await params;
    if (!ObjectId.isValid(id)) return new Response("Id no válido", { status: 400 });

    const db = await getDb();
    const tarjeta = await db.collection("tarjetas").findOne({ _id: new ObjectId(id) });
    if (!tarjeta) return new Response("No existe la tarjeta", { status: 404 });

    const bucket = await getBucket(BUCKETS.tarjetas);
    const webStream = Readable.toWeb(bucket.openDownloadStream(tarjeta.archivo.fileId));
    const nombre = encodeURIComponent(tarjeta.archivo.nombre || `tarjeta-${id}.pdf`);
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
