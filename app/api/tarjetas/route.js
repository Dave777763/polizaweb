import { ObjectId } from "mongodb";
import { getDb, uploadPdfBuffer, deletePdf, errorResponse, BUCKETS } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { claveTarjeta } from "@/lib/tarjetas";
import { escapeRegExp } from "@/lib/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CAMPOS_TEXTO = [
  "serie", "placas", "folio", "propietario", "marca", "submarca",
  "repuve", "claseTipo", "texto",
];

function fechaDeVigencia(vigencia) {
  const anio = Number(vigencia);
  if (!Number.isFinite(anio) || anio < 1980 || anio > 2100) return null;
  return new Date(Date.UTC(anio, 11, 31));
}

function vista(d) {
  return {
    id: d._id.toString(),
    serie: d.serie || "",
    placas: d.placas || "",
    folio: d.folio || "",
    propietario: d.propietario || "",
    marca: d.marca || "",
    submarca: d.submarca || "",
    anio: d.anio || "",
    repuve: d.repuve || "",
    claseTipo: d.claseTipo || "",
    capacidad: d.capacidad || "",
    fechaExpedicion: d.fechaExpedicion || null,
    vigencia: d.vigencia || "",
    vigenciaHasta: d.vigenciaHasta || null,
    archivo: { nombre: d.archivo?.nombre || null, tamano: d.archivo?.tamano || null },
    ownerEmail: d.ownerEmail,
    subido: d.subido,
  };
}

// GET /api/tarjetas?q=texto&serie=XXX
export async function GET(req) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });

    const db = await getDb();
    const col = db.collection("tarjetas");
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const serie = (req.nextUrl.searchParams.get("serie") || "").trim();

    const filtros = [];
    if (q) {
      filtros.push({
        $or: CAMPOS_TEXTO.map((c) => ({ [c]: { $regex: escapeRegExp(q), $options: "i" } })),
      });
    }
    if (serie) filtros.push({ serie: { $regex: `^${escapeRegExp(serie)}$`, $options: "i" } });

    const filter = filtros.length === 2 ? { $and: filtros } : filtros[0] || {};

    const docs = await col.find(filter).sort({ subido: -1 }).limit(500).toArray();
    return Response.json({ ok: true, tarjetas: docs.map(vista) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/tarjetas — guarda una tarjeta y reemplaza la anterior de la misma unidad
export async function POST(req) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file !== "object" || !file.name) {
      return Response.json({ ok: false, error: "Sin archivo" }, { status: 400 });
    }

    const datos = {
      serie: String(form.get("serie") || "").trim().toUpperCase(),
      placas: String(form.get("placas") || "").trim().toUpperCase(),
      folio: String(form.get("folio") || "").trim(),
      propietario: String(form.get("propietario") || "").trim(),
      marca: String(form.get("marca") || "").trim(),
      submarca: String(form.get("submarca") || "").trim(),
      anio: String(form.get("anio") || "").trim(),
      repuve: String(form.get("repuve") || "").trim().toUpperCase(),
      fechaExpedicion: String(form.get("fechaExpedicion") || "").trim(),
      vigencia: String(form.get("vigencia") || "").trim(),
      texto: String(form.get("texto") || "").slice(0, 1500),
    };

    const clave = claveTarjeta(datos);
    if (!clave) {
      return Response.json(
        { ok: false, error: "Falta la serie o la placa de la tarjeta" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const nombreArchivo = `tarjeta_${clave}.pdf`;
    const fileId = await uploadPdfBuffer(buffer, nombreArchivo, BUCKETS.tarjetas);

    const db = await getDb();
    const col = db.collection("tarjetas");
    const anterior = await col.findOne(
      datos.serie
        ? { serie: datos.serie }
        : { placas: datos.placas },
      { projection: { archivo: 1 } }
    );
    if (anterior) {
      await col.deleteOne({ _id: anterior._id });
      await deletePdf(anterior.archivo?.fileId, BUCKETS.tarjetas);
    }

    await col.insertOne({
      ...datos,
      vigenciaHasta: fechaDeVigencia(datos.vigencia),
      archivo: { fileId, nombre: nombreArchivo, tamano: buffer.length },
      ownerId: new ObjectId(user.sub),
      ownerEmail: user.email,
      subido: new Date(),
    });

    return Response.json({ ok: true, reemplazo: Boolean(anterior), clave });
  } catch (e) {
    return errorResponse(e);
  }
}
