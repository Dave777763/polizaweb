import { ObjectId } from "mongodb";
import { getDb, uploadPdfBuffer, deletePdf, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { PROVEEDORES } from "@/lib/facturas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function vista(d) {
  return {
    id: d._id.toString(),
    proveedor: d.proveedor,
    folio: d.folio,
    fecha: d.fecha,
    rfc: d.rfc,
    monto: d.monto,
    moneda: d.moneda,
    archivo: { nombre: d.archivo?.nombre || null, tamano: d.archivo?.tamano || null },
    ownerEmail: d.ownerEmail,
    subido: d.subido,
  };
}

// GET /api/facturas — la última factura de cada proveedor (sin historial)
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });
    const db = await getDb();
    const docs = await db.collection("facturas").find({}).toArray();
    return Response.json({ ok: true, facturas: docs.map(vista) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/facturas — guarda la factura y reemplaza la anterior del mismo proveedor
export async function POST(req) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });
    const form = await req.formData();
    const file = form.get("file");
    const proveedor = String(form.get("proveedor") || "");
    const folio = String(form.get("folio") || "").trim();
    const fecha = String(form.get("fecha") || "");
    const rfc = String(form.get("rfc") || "").trim().toUpperCase();
    const moneda = form.get("moneda") === "MXN" ? "MXN" : "USD";
    const monto = Number(form.get("monto"));

    if (!file || typeof file !== "object" || !file.name) {
      return Response.json({ ok: false, error: "Sin archivo" }, { status: 400 });
    }
    if (!PROVEEDORES[proveedor]) {
      return Response.json({ ok: false, error: "Proveedor no válido" }, { status: 400 });
    }
    if (!folio || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !(monto > 0)) {
      return Response.json({ ok: false, error: "Faltan folio, fecha o monto" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const nombreArchivo = `${proveedor}_${folio.replace(/\s+/g, "")}.pdf`;
    const fileId = await uploadPdfBuffer(buffer, nombreArchivo);

    const db = await getDb();
    const col = db.collection("facturas");
    const anterior = await col.findOne({ proveedor });
    await col.deleteMany({ proveedor });
    if (anterior) await deletePdf(anterior.archivo?.fileId);

    await col.insertOne({
      proveedor,
      folio,
      fecha: new Date(`${fecha}T12:00:00Z`),
      rfc,
      monto,
      moneda,
      archivo: { fileId, nombre: nombreArchivo, tamano: buffer.length },
      ownerId: new ObjectId(user.sub),
      ownerEmail: user.email,
      subido: new Date(),
    });
    return Response.json({ ok: true, reemplazo: Boolean(anterior) });
  } catch (e) {
    return errorResponse(e);
  }
}
