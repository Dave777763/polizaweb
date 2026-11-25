// Lectura de tarjetas de circulación del Estado de Morelos (PDF digital).
// El PDF limpio trae capa de texto OCR; de ahí se extraen los datos.
//
// Ojo: unpdf junta palabras vecinas ("02481532026", "NV6587BFECHA…"),
// por eso cada campo se busca con patrones de longitud fija y no solo \b.
import { extractText, getDocumentProxy } from "unpdf";

const RE_FECHA = /(\d{2})-(\d{2})-(\d{4})/;

// Palabras que nunca son el propietario (comparación sin acentos)
const RUIDO_PROPIETARIO = [
  "GOBIERNO", "GOBERNO", "COBIERNO", "GOSIERNO", "ESTADOS UNIDOS", "MORELOS",
  "TARJETA", "SERVICIO", "CIRCULACION", "MOVILIDAD", "TRANSPORTE", "COORDINACION",
  "LA TIERRA", "CODIFICACIONES", "HECHO EN", "ESTADO", "SECRETARIA", "DIRECCION",
  "OBSERVACIONES", "NOMBRE DEL", "NUMERO", "SERIE", "PROPIETARIO", "DEPENDENCIA",
  "MEXICO",
];

const RUIDO_REPUVE = new Set([
  "USO", "DEL", "VEHICULO", "SERVICIOS", "CLASE", "TIPO", "COMBUSTIBLE",
  "PUERTAS", "CLAVE", "MODELO", "MOTOR", "MARCA", "SUBMARCA",
]);

const sinAcentos = (s) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function normalizar(texto) {
  return (texto || "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const lineas = (t) => t.split("\n").map((l) => l.trim()).filter(Boolean);

function limpiarValor(v, max = 90) {
  return (v || "")
    .replace(/\s+/g, " ")
    .replace(/^[:.\-|\s]+/, "")
    .replace(/[|]+$/, "")
    .trim()
    .slice(0, max);
}

function esRuido(linea) {
  const l = sinAcentos(linea).toUpperCase().replace(/\s+/g, "");
  return RUIDO_PROPIETARIO.some((p) => l.includes(p.replace(/\s+/g, "")));
}

// Algunas tarjetas reflotan el nombre partido: "CONSTRUCCIONES ... SA DE CV CARTER"
function reordenarRazonSocial(v) {
  const m = /^(.+?)\bSA DE CV\b\.?\s+([A-ZÁÉÍÓÚÑ]{3,})$/i.exec(v);
  if (!m) return v;
  return `${m[2]} ${m[1]} SA DE CV`;
}

// Válido como nombre de propietario: ≥2 palabras, letras, sin dígitos
function parecePropietario(v) {
  if (!v || v.length < 6) return false;
  if (/\d/.test(v)) return false;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ&.,'\- ]+$/.test(v)) return false;
  const letras = (v.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  if (letras < 12) return false;
  if (!/^[A-ZÁÉÍÓÚÑ]/.test(v)) return false;
  const palabras = v.replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  if (palabras.filter((p) => p.length >= 3).length < 2) return false;
  if (esRuido(v)) return false;
  return true;
}

function completarParentesis(inicial, resto, max = 2) {
  let valor = inicial;
  let abiertos = (valor.match(/\(/g) || []).length - (valor.match(/\)/g) || []).length;
  for (let i = 0; i < resto.length && abiertos > 0 && i < max; i++) {
    valor += " " + resto[i];
    abiertos = (valor.match(/\(/g) || []).length - (valor.match(/\)/g) || []).length;
  }
  return valor;
}

function extraerPropietario(t, serie) {
  const ls = lineas(t);
  const idx = ls.findIndex((l) => /PROPIETARIO/i.test(l));
  const candidatos = [];

  if (idx >= 0) {
    const misma = limpiarEtiqueta(ls[idx]);
    if (misma) candidatos.push(misma);
    for (let k = 1; k <= 2 && idx + k < ls.length; k++) candidatos.push(ls[idx + k]);
  }

  // respaldo: cualquier línea con forma de razón social antes de MARCA
  const iMarca = ls.findIndex((l) => /\bMARCA\b/i.test(l));
  const limite = iMarca > 0 ? iMarca : Math.min(ls.length, 30);
  for (let i = 0; i < limite; i++) candidatos.push(ls[i]);

  for (let c of candidatos) {
    if (!c) continue;
    if (serie) c = c.split(serie).join(" ");
    c = c.replace(/\b\d{4,}\b/g, " "); // quita números sueltos (folio, año)
    c = c.replace(/\s+/g, " ").trim();
    if (parecePropietario(c)) return limpiarValor(reordenarRazonSocial(c), 120);
  }
  return "";
}

// "NOMBRE DEL PROPIETARIO NÚMERO SENE:" → "" (no hay valor en esa línea)
function limpiarEtiqueta(linea) {
  const m = /PROPIETARIO[:.]?\s*(.*)$/i.exec(linea);
  const v = limpiarValor(m?.[1] || "");
  if (!v) return "";
  if (/^(N[UÚ]MERO|NO\.|SERIE|NOMBRE)/i.test(v)) return "";
  return v;
}

function extraerPlacas(t, mayus, serie) {
  const sinSerie = serie ? mayus.split(serie).join(" ") : mayus;
  const esPlaca = (tok) =>
    tok.length >= 6 &&
    tok.length <= 8 &&
    /^[A-Z]{2,3}\d{3,4}[A-Z]?$/.test(tok) &&
    !/^(19|20)\d{2}/.test(tok) &&
    !/^[A-Z]{2,3}20\d{2}$/.test(tok);

  // 1) ventana inmediata después de la etiqueta PLACAS (a veces "PUCAS")
  const mEtiqueta = /(?:PLACAS|PUCAS|PLACAS?)\s*[:.]?\s*([A-Z0-9 .\-]{0,60})/i.exec(t);
  if (mEtiqueta) {
    const win = mEtiqueta[1].toUpperCase().replace(serie, " ");
    for (const m of win.matchAll(/([A-Z]{2,3}\d{3,4}[A-Z]?)/g)) {
      if (esPlaca(m[1])) return m[1];
    }
  }

  // 2) cualquier token con forma de placa en el bloque de la tarjeta
  const bloque = sinSerie.slice(0, 1600);
  for (const m of bloque.matchAll(/([A-Z]{2,3}\d{3,4}[A-Z]?)/g)) {
    if (esPlaca(m[1])) return m[1];
  }
  return "";
}

function extraerFolio(mayus) {
  const simple = /\b0\d{6}\b/.exec(mayus);
  if (simple) return simple[0];
  // pegado a la vigencia: "02481532026"
  const pegado = /(0\d{6})(?=\d{4}\b)/.exec(mayus);
  return pegado ? pegado[1] : "";
}

function extraerMarca(t) {
  const ls = lineas(t);
  const i = ls.findIndex((l) => /(?<!SUB)\bMARCA\b/i.test(l));
  if (i < 0) return "";
  let linea = ls[i].replace(/^[\s\S]*?(?<!SUB)\bMARCA\b[:.]?\s*/i, "");
  linea = linea.split(/SUBMARCA|MODELO|N[UÚ]MERO/i)[0];
  const valor = completarParentesis(linea.trim(), ls.slice(i + 1));
  return limpiarValor(valor, 120);
}

function extraerSubmarca(t) {
  const m = /SUBMARCA[:.]?\s*([^\n]{1,70})/i.exec(t);
  if (!m) return "";
  return limpiarValor(m[1].split(/MODELO|MARCA|N[UÚ]MERO/i)[0], 60);
}

function extraerAnio(mayus, vigencia, fechaAnio) {
  const excluir = new Set([2024, 2030, vigencia, fechaAnio].filter(Boolean));
  const cuenta = new Map();
  for (const m of mayus.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) {
    const y = Number(m[0]);
    if (excluir.has(y)) continue;
    cuenta.set(y, (cuenta.get(y) || 0) + 1);
  }
  if (cuenta.size) {
    const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return String(orden[0][0]);
  }
  const etiqueta = /(?:A[ÑN]O|ARO|MODELO)[:.]?\s*(19[5-9]\d|20[0-4]\d)/.exec(mayus);
  return etiqueta ? etiqueta[1] : "";
}

function extraerRepuve(t, mayus) {
  const m = /\bREPUVE\b[:.]?\s*([A-Z0-9]{5,14})/i.exec(mayus);
  if (m) {
    const v = m[1];
    if (!RUIDO_REPUVE.has(v) && /\d/.test(v)) return v;
  }
  return "";
}

function extraerSerie(mayus) {
  const bloque = mayus.slice(0, 1400);
  // unpdf puede pegar la serie con el texto siguiente ("3C7WRAKT8KG532644CARTER"),
  // así que se buscan corridas y se valida una ventana de 17 caracteres.
  for (const run of bloque.match(/[0-9A-Z]{17,24}/g) || []) {
    for (let i = 0; i + 17 <= run.length; i++) {
      const cand = run.slice(i, i + 17);
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cand)) continue;
      const digitos = (cand.match(/\d/g) || []).length;
      const letras = (cand.match(/[A-Z]/g) || []).length;
      if (digitos >= 5 && letras >= 6) return cand;
    }
  }
  return (bloque.match(/\b[A-HJ-NPR-Z0-9]{17}\b/) || [])[0] || "";
}

export function parseTarjetaTexto(textoOriginal) {
  const t = normalizar(textoOriginal);
  const mayus = t.toUpperCase();

  const serie = extraerSerie(mayus);
  const folio = extraerFolio(mayus);
  const placas = extraerPlacas(t, mayus, serie);

  let fechaExpedicion = "";
  let vigencia = "";
  const mf = RE_FECHA.exec(t);
  if (mf) {
    const [, dd, mm, yyyy] = mf;
    fechaExpedicion = `${yyyy}-${mm}-${dd}`;
    const despues = mayus.slice(mf.index + mf[0].length);
    vigencia = (/(20\d{2})/.exec(despues) || [])[1] || "";
  }
  if (!vigencia) {
    const anios = [...mayus.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
    if (anios.length) vigencia = String(Math.max(...anios));
  }

  const fechaAnio = fechaExpedicion ? Number(fechaExpedicion.slice(0, 4)) : 0;

  return {
    serie,
    placas,
    folio,
    propietario: extraerPropietario(t, serie),
    marca: extraerMarca(t),
    submarca: extraerSubmarca(t),
    anio: extraerAnio(mayus, Number(vigencia) || 0, fechaAnio),
    repuve: extraerRepuve(t, mayus),
    claseTipo: (mayus.match(/\b2-\d{1,2}\b/) || [])[0] || "",
    capacidad: (mayus.match(/\b(\d{1,2})\s*P\./) || [])[1] || "",
    fechaExpedicion,
    vigencia,
    texto: t.slice(0, 1500),
  };
}

export async function leerTarjeta(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { ...parseTarjetaTexto(text), paginas: totalPages };
}

// Clave de unicidad: la serie (VIN) o, si el OCR no la leyó, la placa
export function claveTarjeta(d) {
  return (d?.serie || d?.placas || "").toUpperCase();
}
