"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatFecha, formatKB, vigenciaChip } from "@/lib/util";

function esMovil() {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function anioVigencia(t) {
  if (t.vigenciaHasta) return t.vigenciaHasta;
  return t.vigencia ? `${t.vigencia}-12-31T00:00:00Z` : null;
}

function etiquetaEstado(e) {
  if (e === "nueva") return <span className="chip azul">Nueva</span>;
  if (e === "renovacion") return <span className="chip amarilla">Renovación</span>;
  if (e === "renovacion-en-lote") return <span className="chip amarilla">Repetida en el lote</span>;
  if (e === "sin-clave") return <span className="chip roja">Sin serie ni placa</span>;
  return <span className="chip roja">No legible</span>;
}

const CAMPOS_EDITABLES = [
  { k: "placas", label: "Placas", ancho: 90 },
  { k: "serie", label: "N° de serie (VIN)", ancho: 160 },
  { k: "folio", label: "Folio", ancho: 85 },
  { k: "propietario", label: "Propietario", ancho: 190 },
  { k: "fechaExpedicion", label: "Expedición", ancho: 120, tipo: "date" },
  { k: "vigencia", label: "Vigencia", ancho: 80 },
];

export default function TarjetasPage() {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const [arriba, setArriba] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [rows, setRows] = useState([]);
  const [archivos, setArchivos] = useState(() => new Map());
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState("");

  const [compartiendo, setCompartiendo] = useState("");
  const [menu, setMenu] = useState("");
  const [me, setMe] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    fetch(`/api/tarjetas?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setLista(d.tarjetas || []);
          setError("");
        } else setError(d.error || "No se pudieron cargar las tarjetas");
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setCargando(false));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user || null))
      .catch(() => {});
  }, []);

  async function analizar(fileList) {
    const fs = Array.from(fileList || []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!fs.length) return;
    setError("");
    setExito("");
    setRows([]);
    setAnalizando(true);
    try {
      const fd = new FormData();
      fs.forEach((f) => fd.append("files", f, f.name));
      const res = await fetch("/api/tarjetas/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron leer los PDF");
      setArchivos(new Map(fs.map((f) => [f.name, f])));
      setRows(data.rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalizando(false);
    }
  }

  function editar(i, campo, valor) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));
  }

  async function guardarTodo() {
    const utiles = rows.filter((r) => r.estado !== "inlegible");
    if (!utiles.length) return;
    setGuardando(true);
    setError("");
    setExito("");
    let ok = 0;
    const fallos = [];
    try {
      for (let i = 0; i < utiles.length; i++) {
        const r = utiles[i];
        setProgreso(`Guardando ${i + 1}/${utiles.length}…`);
        const f = archivos.get(r.archivo);
        if (!f) {
          fallos.push(`${r.archivo}: archivo no disponible`);
          continue;
        }
        try {
          const fd = new FormData();
          fd.append("file", f, f.name);
          for (const c of ["serie", "placas", "folio", "propietario", "marca", "submarca",
            "anio", "repuve", "fechaExpedicion", "vigencia", "texto"]) {
            fd.append(c, r[c] ?? "");
          }
          const res = await fetch("/api/tarjetas", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "No se pudo guardar");
          ok++;
        } catch (e) {
          fallos.push(`${r.archivo}: ${e.message}`);
        }
      }
      setExito(
        `Tarjetas guardadas: ${ok}` + (fallos.length ? ` · con error: ${fallos.length}` : "")
      );
      if (fallos.length) setError(fallos.join(" · "));
      setRows([]);
      setArchivos(new Map());
      cargar();
    } finally {
      setGuardando(false);
      setProgreso("");
    }
  }

  function textoTarjeta(t) {
    const partes = [
      `🪪 Tarjeta de circulación`,
      t.placas ? `Placas ${t.placas}` : null,
      t.serie ? `Serie ${t.serie}` : null,
      t.marca ? `${t.marca}${t.anio ? " " + t.anio : ""}` : null,
      t.vigencia ? `Vigencia ${t.vigencia}` : null,
    ].filter(Boolean);
    return partes.join(" · ");
  }

  function abrirWhatsApp(texto) {
    window.open(
      esMovil()
        ? `https://wa.me/?text=${encodeURIComponent(texto)}`
        : `https://web.whatsapp.com/send?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener"
    );
  }

  async function obtenerPdf(t) {
    const nombre = t.archivo?.nombre || `tarjeta-${t.placas || t.serie}.pdf`;
    const res = await fetch(`/api/tarjetas/${t.id}/pdf`);
    if (!res.ok) throw new Error("No se pudo obtener el PDF");
    return { blob: await res.blob(), nombre };
  }

  function descargarYAbrir(blob, nombre, texto) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    abrirWhatsApp(texto);
  }

  async function compartirApp(t) {
    setMenu("");
    if (compartiendo) return;
    setCompartiendo(t.id);
    setError("");
    try {
      const texto = textoTarjeta(t);
      const { blob, nombre } = await obtenerPdf(t);
      const file = new File([blob], nombre, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: nombre, text: texto });
          setExito("📲 Tarjeta compartida.");
          return;
        } catch (e) {
          if (e?.name === "AbortError") return;
        }
      }
      descargarYAbrir(blob, nombre, texto);
      setExito("📥 PDF descargado y WhatsApp abierto: arrastra el archivo al chat.");
    } catch (e) {
      setError(e.message || "No se pudo compartir");
    } finally {
      setCompartiendo("");
    }
  }

  async function compartirWeb(t) {
    setMenu("");
    if (compartiendo) return;
    setCompartiendo(t.id);
    setError("");
    try {
      const texto = textoTarjeta(t);
      const { blob, nombre } = await obtenerPdf(t);
      descargarYAbrir(blob, nombre, texto);
      setExito("📥 PDF descargado y WhatsApp Web abierto: arrastra el archivo al chat.");
    } catch (e) {
      setError(e.message || "No se pudo compartir");
    } finally {
      setCompartiendo("");
    }
  }

  async function eliminar(t) {
    if (!confirm(`¿Eliminar la tarjeta de ${t.placas || t.serie}? Se borra el PDF.`)) return;
    const res = await fetch(`/api/tarjetas/${t.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setExito("Tarjeta eliminada");
      cargar();
    } else {
      setError(d.error || "No se pudo eliminar");
    }
  }

  const total = useMemo(() => lista.length, [lista]);

  return (
    <main className="contenedor">
      <h1 style={{ fontSize: 22 }}>Tarjetas de circulación</h1>
      <p style={{ color: "var(--suave)" }}>
        Sube la tarjeta de cada unidad y compártela por WhatsApp. Si vuelves a subir la misma
        serie (VIN) o placa, la anterior se sustituye (último archivo gana).
      </p>

      <input
        className="buscador"
        placeholder="Buscar por placa, serie, folio o propietario…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && <div className="aviso">{error}</div>}
      {exito && <div className="exito">{exito}</div>}

      {cargando && (
        <p style={{ color: "var(--suave)" }}>
          <span className="girar" /> Consultando…
        </p>
      )}

      {!cargando && total === 0 && !error && (
        <div className="nota">
          {q ? `Sin resultados para «${q}».` : "Aún no hay tarjetas. Sube el primer PDF abajo."}
        </div>
      )}

      <div className="grid-lista">
        {lista.map((t) => {
          const chip = vigenciaChip(anioVigencia(t));
          return (
            <div key={t.id} className="tarjeta">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span className="placa">{t.placas || "SIN PLACA"}</span>
                <span className="chip azul">{t.vigencia ? `Vigencia ${t.vigencia}` : "sin vigencia"}</span>
              </div>
              <div className="mono" style={{ fontSize: 12, color: "var(--suave)", marginTop: 6 }}>
                {t.serie || "—"}
              </div>
              <div style={{ marginTop: 8, fontSize: 14 }}>{t.propietario || "Propietario no detectado"}</div>
              <div className="linea-datos">
                {t.marca && <span>{t.marca}</span>}
                {t.anio && <span>Modelo {t.anio}</span>}
                {t.folio && <span>Folio {t.folio}</span>}
              </div>
              <div className="linea-datos">
                <span className={`chip ${chip.tone}`}>{chip.label}</span>
                {t.fechaExpedicion && <span>Expedida {formatFecha(t.fechaExpedicion)}</span>}
              </div>
              <div className="linea-datos" style={{ fontSize: 12 }}>
                <span>📄 {t.archivo?.nombre || "—"}</span>
                <span>{formatKB(t.archivo?.tamano)}</span>
              </div>
              <div className="linea-datos" style={{ fontSize: 12 }}>
                <span>Subida por {t.ownerEmail}</span>
                <span>{formatFecha(t.subido)}</span>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <a className="btn sec" href={`/api/tarjetas/${t.id}/pdf`} target="_blank" rel="noopener">
                  Ver PDF
                </a>
                <button
                  className="btn"
                  style={{ background: "#25D366" }}
                  onClick={() => (esMovil() ? compartirApp(t) : setMenu((m) => (m === t.id ? "" : t.id)))}
                  disabled={compartiendo === t.id}
                >
                  {compartiendo === t.id ? <span className="girar" /> : "🟢 Compartir por WhatsApp"}
                </button>
                {(me?.rol === "admin" || me?.email === t.ownerEmail) && (
                  <button className="btn sec" onClick={() => eliminar(t)} disabled={compartiendo === t.id}>
                    Eliminar
                  </button>
                )}
              </div>

              {menu === t.id && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--suave)" }}>¿Cómo quieres enviarla?</div>
                  <button className="btn" onClick={() => compartirApp(t)} disabled={!!compartiendo}>
                    📎 App WhatsApp — PDF adjunto directo
                  </button>
                  <button
                    className="btn"
                    style={{ background: "#25D366" }}
                    onClick={() => compartirWeb(t)}
                    disabled={!!compartiendo}
                  >
                    🌐 WhatsApp Web — descarga + arrastre
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="titulo-seccion">Subir tarjetas</h2>
      {rows.length === 0 && (
        <div
          className={`zona ${arriba ? "arriba" : ""}`}
          onClick={() => document.getElementById("tarjetas__input").click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArriba(true);
          }}
          onDragLeave={() => setArriba(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArriba(false);
            analizar(e.dataTransfer.files);
          }}
        >
          <h3>Arrastra aquí los PDF de las tarjetas</h3>
          <p>puedes soltar varias a la vez (.pdf)</p>
          <input
            id="tarjetas__input"
            type="file"
            multiple
            accept=".pdf"
            style={{ display: "none" }}
            onChange={(e) => analizar(e.target.files)}
          />
        </div>
      )}

      {analizando && (
        <p style={{ color: "var(--suave)" }}>
          <span className="girar" /> Leyendo tarjetas…
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="fila-acciones">
            <b>{rows.length} tarjetas detectadas</b>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn sec" onClick={() => { setRows([]); setArchivos(new Map()); }} disabled={guardando}>
                Limpiar
              </button>
              <button className="btn" onClick={guardarTodo} disabled={guardando}>
                {guardando ? <span className="girar" /> : progreso || "Guardar tarjetas"}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Archivo</th>
                  {CAMPOS_EDITABLES.map((c) => (
                    <th key={c.k}>{c.label}</th>
                  ))}
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{r.archivo}</td>
                    {r.estado === "inlegible" ? (
                      <td colSpan={CAMPOS_EDITABLES.length} style={{ color: "var(--peligro)", fontSize: 12 }}>
                        {r.mensaje}
                      </td>
                    ) : (
                      CAMPOS_EDITABLES.map((c) => (
                        <td key={c.k} style={{ padding: 4 }}>
                          <input
                            type={c.tipo || "text"}
                            value={r[c.k] || ""}
                            onChange={(e) => editar(i, c.k, e.target.value)}
                            style={{ width: c.ancho, padding: "6px 8px", border: "1px solid var(--borde)", borderRadius: 8, fontSize: 12 }}
                          />
                        </td>
                      ))
                    )}
                    <td>{etiquetaEstado(r.estado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: "var(--suave)", fontSize: 13 }}>
            Revisa placas, serie y folio antes de guardar: puedes corregir cualquier celda.
          </p>
        </>
      )}
    </main>
  );
}
