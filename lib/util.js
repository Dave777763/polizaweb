export function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}

export function formatKB(bytes) {
  if (bytes == null) return "—";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function vigenciaChip(hastaIso) {
  if (!hastaIso) return { label: "sin vigencia", tone: "gris" };
  const hoy = new Date();
  const hasta = new Date(hastaIso);
  const dias = Math.floor((hasta - hoy) / 86400000);
  if (dias < 0) return { label: `vencida ${formatFecha(hastaIso)}`, tone: "roja" };
  if (dias <= 30) return { label: `vence en ${dias} días`, tone: "amarilla" };
  return { label: `vigente hasta ${formatFecha(hastaIso)}`, tone: "verde" };
}
