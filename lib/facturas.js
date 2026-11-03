// Lectura de facturas de proveedores de gas (ProPane y Amboise)
import { extractText, getDocumentProxy } from "unpdf";

export const PROVEEDORES = {
  propane: { nombre: "ProPane" },
  amboise: { nombre: "Amboise" },
};

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const RFC_RE = /([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/;

function detectarProveedor(t) {
  if (/PROPANE SERVICES/i.test(t)) return "propane";
  if (/AMBOISE/i.test(t)) return "amboise";
  return "";
}

function folio(t, proveedor) {
  if (proveedor === "propane") return /FACTURA FOLIO\s*\n\s*([A-Z]{1,4}\s*\d+)/.exec(t)?.[1]?.replace(/\s+/g, " ") || "";
  return /Folio:\s*(\S+)/.exec(t)?.[1] || "";
}

// Devuelve YYYY-MM-DD para el input de fecha
function fecha(t) {
  const m = /(\d{1,2})\/([A-Za-zÁÉÍÓÚáéíóú]{3})[A-Za-zÁÉÍÓÚáéíóú]*\/(\d{4})/.exec(t);
  if (!m) return "";
  const mes = MESES[m[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
  if (!mes) return "";
  return `${m[3]}-${String(mes).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

function rfcEmisor(t, proveedor) {
  if (proveedor === "propane") return /REG\.FED\.DE CONT\.\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/.exec(t)?.[1] || "";
  return /RFC:\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/.exec(t)?.[1] || "";
}

// Monto total (sin impuestos extra). ProPane: SUB-TOTAL / IVA / TOTAL con tres cifras seguidas.
function monto(t, proveedor) {
  if (proveedor === "propane") {
    const m = /SUB-TOTAL\s*\nIVA\s*\nTOTAL\s*\n\s*([\d,]+\.\d{2})\s*\n\s*([\d,]+\.\d{2})\s*\n\s*([\d,]+\.\d{2})/.exec(t);
    return m ? Number(m[3].replace(/,/g, "")) : null;
  }
  const m = /Total:\s*\$?\s*([\d,]+\.\d{2})/.exec(t);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export function parseFacturaTexto(texto) {
  const t = (texto || "").normalize("NFKC");
  const proveedor = detectarProveedor(t);
  return {
    proveedor,
    folio: proveedor ? folio(t, proveedor) : "",
    fecha: fecha(t),
    rfc: proveedor ? rfcEmisor(t, proveedor) : "",
    monto: proveedor ? monto(t, proveedor) : null,
    moneda: /\bUSD\b/.test(t) ? "USD" : "MXN",
  };
}

export async function leerFactura(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return parseFacturaTexto(text);
}
