import * as XLSX from "xlsx";
import { getDb, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function fechaCorta(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getUTCFullYear()}`;
}

// Estado corto para el Excel (VIGENTE / VENCE PRONTO / VENCIDA)
function estadoDe(hasta) {
  if (!hasta) return "SIN VIGENCIA";
  const dias = Math.floor((new Date(hasta) - new Date()) / 86400000);
  if (dias < 0) return "VENCIDA";
  if (dias <= 30) return "VENCE PRONTO";
  return "VIGENTE";
}

function minDesde(docs) {
  return docs.reduce(
    (m, u) => (u.vigenciaDesde && (!m || u.vigenciaDesde < m) ? u.vigenciaDesde : m),
    null
  );
}

function maxHasta(docs) {
  return docs.reduce(
    (m, u) => (u.vigenciaHasta && (!m || u.vigenciaHasta > m) ? u.vigenciaHasta : m),
    null
  );
}

function filasUnidades(docs) {
  return docs.map((u) => ({
    n: (u.serie || "").slice(-5),
    placa: u.placa || "",
    serie: u.serie || "",
    cis: u.cis || "",
    poliza: u.poliza || "",
    descripcion: u.descripcion || "",
    modelo: u.modelo || "",
    empleado: u.empleado || "",
    propietario: u.propietario || "",
    desde: fechaCorta(u.vigenciaDesde),
    hasta: fechaCorta(u.vigenciaHasta),
    estado: estadoDe(u.vigenciaHasta),
    archivo: u.archivo?.nombre || "",
    subidaPor: u.ownerEmail || "",
    subida: fechaCorta(u.subido),
  }));
}

function respuestaExcel(docs) {
  const filas = filasUnidades(docs);

  const polizas = [...new Set(filas.map((f) => f.poliza).filter(Boolean))];
  const propietarios = [...new Set(filas.map((f) => f.propietario).filter(Boolean))];
  const estados = {};
  filas.forEach((f) => { estados[f.estado] = (estados[f.estado] || 0) + 1; });

  // Hoja 1: Resumen
  const resumen = [
    ["PÓLIZAWEB — RELACIÓN DE UNIDADES ASEGURADAS"],
    [],
    ["Póliza Inbursa", polizas.join(" / ")],
    ["Propietario(s)", propietarios.join(" / ")],
    ["Vigencia de la flota", docs.length ? `${fechaCorta(minDesde(docs))} → ${fechaCorta(maxHasta(docs))}` : ""],
    ["Total de unidades", filas.length],
    ...Object.entries(estados).sort().map(([k, v]) => [k, v]),
    [],
    ["Reporte generado", `${fechaCorta(new Date())}`],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 24 }, { wch: 56 }];

  // Hoja 2: Relación de unidades
  const cab = [
    "N°", "Placa", "Nº de serie (VIN)", "CIS", "Póliza Inbursa",
    "Vehículo (descripción)", "Modelo", "Empleado", "Propietario",
    "Vigencia desde", "Vigencia hasta", "Estado",
    "Archivo PDF", "Subida por", "Subida el",
  ];
  const cuerpo = filas.map((f) => [
    f.n, f.placa, f.serie, f.cis, f.poliza,
    f.descripcion, f.modelo, f.empleado, f.propietario,
    f.desde, f.hasta, f.estado,
    f.archivo, f.subidaPor, f.subida,
  ]);
  const wsRel = XLSX.utils.aoa_to_sheet([cab, ...cuerpo]);
  const anchos = [7, 12, 22, 12, 18, 36, 9, 20, 28, 14, 14, 14, 32, 24, 12];
  wsRel["!cols"] = anchos.map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
  XLSX.utils.book_append_sheet(wb, wsRel, "Relación de unidades");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const hoy = new Date().toISOString().slice(0, 10);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relacion-unidades-aseguradas-${hoy}.xlsx"`,
    },
  });
}

function respuestaCsv(docs) {
  const filas = [
    ["unidad", "archivo", "serie", "placa", "cis", "empleado", "poliza", "modelo", "descripcion", "propietario", "vigencia_desde", "vigencia_hasta", "subida_por", "subido"].join(","),
  ];
  docs.forEach((u) => {
    filas.push(
      [
        (u.serie || "").slice(-5),
        u.archivo?.nombre || "",
        u.serie, u.placa, u.cis, u.empleado, u.poliza || "", u.modelo || "",
        u.descripcion || "", u.propietario || "",
        u.vigenciaDesde ? u.vigenciaDesde.toISOString() : "",
        u.vigenciaHasta ? u.vigenciaHasta.toISOString() : "",
        u.ownerEmail || "",
        u.subido ? u.subido.toISOString() : "",
      ]
        .map(csvCell)
        .join(",")
    );
  });
  const contenido = "\uFEFF" + filas.join("\r\n");
  return new Response(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="unidades.csv"',
    },
  });
}

// GET /api/export            → CSV
// GET /api/export?formato=xlsx → Excel (.xlsx, 2 hojas)
export async function GET(req) {
  try {
    const user = await getSessionUser();
    if (!user || user.rol !== "admin") {
      return Response.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }
    const db = await getDb();
    const docs = await db.collection("unidades").find({}).sort({ subido: -1 }).toArray();
    const formato = (req.nextUrl.searchParams.get("formato") || "csv").toLowerCase();
    if (formato === "xlsx" || formato === "excel") return respuestaExcel(docs);
    return respuestaCsv(docs);
  } catch (e) {
    return errorResponse(e);
  }
}
