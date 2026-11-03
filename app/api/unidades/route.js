import { getDb, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { escapeRegExp } from "@/lib/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/unidades?q=texto  — todos los usuarios con sesión ven todas las pólizas
export async function GET(req) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ ok: false, error: "Sin sesión" }, { status: 401 });
    const db = await getDb();
    const col = db.collection("unidades");

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const campos = ["serie", "placa", "cis", "poliza", "descripcion", "propietario", "empleado"];
    const filter = q
      ? { $or: campos.map((c) => ({ [c]: { $regex: escapeRegExp(q), $options: "i" } })) }
      : {};

    const docs = await col
      .find(filter, {
        projection: {
          serie: 1, placa: 1, cis: 1, poliza: 1, empleado: 1, modelo: 1,
          descripcion: 1, propietario: 1, vigenciaHasta: 1, vigenciaDesde: 1,
          archivo: 1, ownerEmail: 1, subido: 1, _id: 1,
        },
      })
      .sort({ subido: -1 })
      .limit(300)
      .toArray();

    const unidades = docs.map((d) => ({
      id: d._id.toString(),
      serie: d.serie,
      placa: d.placa,
      cis: d.cis,
      poliza: d.poliza || null,
      empleado: d.empleado,
      modelo: d.modelo,
      descripcion: d.descripcion,
      propietario: d.propietario,
      vigenciaDesde: d.vigenciaDesde || null,
      vigenciaHasta: d.vigenciaHasta || null,
      archivo: { nombre: d.archivo?.nombre || null, tamano: d.archivo?.tamano || null },
      ownerEmail: d.ownerEmail,
      subido: d.subido,
      unidad5: (d.serie || "").slice(-5),
    }));
    return Response.json({ ok: true, unidades });
  } catch (e) {
    return errorResponse(e);
  }
}
