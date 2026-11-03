import { Readable } from "node:stream";
import { getDb, getBucket, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { PROVEEDORES } from "@/lib/facturas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/facturas/[proveedor]/pdf — sirve el PDF de la última factura del proveedor
export async function GET(req, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) return new Response("Sin sesión", { status: 401 });
    const { proveedor } = await params;
    if (!PROVEEDORES[proveedor]) return new Response("Proveedor no válido", { status: 400 });
    const db = await getDb();
    const factura = await db.collection("facturas").findOne({ proveedor });
    if (!factura) return new Response("No hay factura", { status: 404 });
    const bucket = await getBucket();
    const webStream = Readable.toWeb(bucket.openDownloadStream(factura.archivo.fileId));
    const nombre = encodeURIComponent(factura.archivo.nombre || `factura-${proveedor}.pdf`);
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
