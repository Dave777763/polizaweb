// ============================================================
// Parser de carátulas de Inbursa (puerto del separa_polizas.py)
// Entrada: array de strings (texto por página del PDF)
// ============================================================

const NO_DATA = new Set(["S/N", "SN", "S", "N", ".", "", "-"]);

const HEADER_RE = /CAR\S?TULA DE LA P\S?LIZA DE SEGUROS DE AUTOM\S?VILES/;
const CIS_RE = /CIS\s+(\d{6,10})/;
const EMP_RE = /N\S?MERO DE EMPLEADO:\s*(\d+)/;
const PLACA_INLINE_RE = /PLACAS:\s*([A-Z0-9\-./]{1,9})(?=\s|$)/;
const PLACA_NEXT_RE = /^PLACAS:\s*$/m;
const SERIE_INLINE_RE = /SERIE:\s*([A-HJ-NPR-Z0-9]{8,17})(?=\s|$)/;
const SERIE_NEXT_RE = /^SERIE:\s*$/m;
const MODELO_RE = /MODELO:\s*(\d{4})/;
const DESC_RE = /CLAVE VEHICULAR:\s*([A-Z0-9]+)\s+(.+)/;
const OWNER_RE = /PROPIETARIO:\s*(.+)/;
const POLIZA_RE = /P\S?LIZA\s+(\d{3,6}\s+\d{4,10})(?=\s|$)/; // ej: PÓLIZA 16211 20016322

const DESDE_RE = /desde\s+las\s+\d{1,2}:\d{2}\s+horas\s+(\d{1,2})\/([a-z]{3})\/(\d{4})/i;
const HASTA_RE = /hasta\s+las\s+\d{1,2}:\d{2}\s+horas\s+(\d{1,2})\/([a-z]{3})\/(\d{4})/i;
const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };

// Valor en la misma línea del campo, o primer token de la línea siguiente
function valueAfter(inlineRe, nextRe, text) {
  const m = inlineRe.exec(text);
  if (m) return m[1].trim();
  const m2 = nextRe.exec(text);
  if (m2) {
    const after = text.slice(m2.index + m2[0].length).trim().split("\n")[0].trim();
    const tok = /^[A-Z0-9\-]{2,20}/.exec(after);
    if (tok) return tok[0].trim();
  }
  return "";
}

function clean(v) {
  const up = (v || "").toUpperCase().trim();
  return NO_DATA.has(up) ? "" : up;
}

function fecha(re, text) {
  const m = re.exec(text);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return new Date(Number(m[3]), mes - 1, Number(m[1])).toISOString();
}

function parseBloque(textoBloque) {
  const t = textoBloque;
  const mDesc = DESC_RE.exec(t);
  const mOwner = OWNER_RE.exec(t);
  return {
    cis: (CIS_RE.exec(t)?.[1]) || "",
    poliza: (POLIZA_RE.exec(t)?.[1]) || "",
    empleado: (EMP_RE.exec(t)?.[1]) || "",
    placa: clean(valueAfter(PLACA_INLINE_RE, PLACA_NEXT_RE, t)),
    serie: clean(valueAfter(SERIE_INLINE_RE, SERIE_NEXT_RE, t)),
    modelo: (MODELO_RE.exec(t)?.[1]) || "",
    descripcion: mDesc ? mDesc[2].trim().replace(/\s+/g, " ") : "",
    propietario: mOwner ? mOwner[1].trim().replace(/\s+/g, " ") : "",
    vigenciaDesde: fecha(DESDE_RE, t),
    vigenciaHasta: fecha(HASTA_RE, t),
  };
}

/**
 * @param {string[]} pagesText texto por página
 * @returns {{ records: Array<object & {paginas:number[]}>, totalPaginas:number, noAsignadas:number[] }}
 */
export function parsePolizasPdf(pagesText) {
  const pages = (pagesText || []).map((p) => (p || "").normalize("NFKC"));
  const starts = [];
  for (let i = 0; i < pages.length; i++) {
    if (HEADER_RE.test(pages[i])) starts.push(i);
  }
  const records = [];
  const covered = new Set();
  for (const s of starts) {
    const block = [s, s + 1, s + 2].filter((p) => p < pages.length);
    block.forEach((p) => covered.add(p));
    const texto = block.map((p) => pages[p]).join("\n");
    const rec = parseBloque(texto);
    rec.paginas = block.map((p) => p + 1); // 1-indexed
    records.push(rec);
  }
  const noAsignadas = [];
  for (let i = 0; i < pages.length; i++) {
    if (!covered.has(i)) noAsignadas.push(i + 1);
  }
  return { records, totalPaginas: pages.length, noAsignadas };
}
