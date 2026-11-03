"use client";

import { useCallback, useEffect, useState } from "react";
import { formatFecha, formatKB } from "@/lib/util";

const PROVEEDORES = {
  propane: "ProPane",
  amboise: "Amboise",
};

function esMovil() {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function formatMonto(monto, moneda) {
  if (monto == null) return "—";
  return `${Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || ""}`.trim();
}

export default function FacturasPage() {
  const [facturas, setFacturas] = useState([]);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [compartiendo, setCompartiendo] = useState("");
  const [arriba, setArriba] = useState(false);
  const [borrador, setBorrador] = useState(null);

  const cargar = useCallback(() => {
    fetch("/api/facturas")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setFacturas(d.facturas || []);
        else setError(d.error || "No se pudieron cargar las facturas");
      })
      .catch(() => setError("Error de conexión"));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function actual(proveedor) {
    return facturas.find((f) => f.proveedor === proveedor) || null;
  }

  async function analizar(fileList) {
    const f = Array.from(fileList || []).find((x) => x.name.toLowerCase().endsWith(".pdf"));
    if (!f) return;
    setError("");
    setExito("");
    setBorrador(null);
    setAnalizando(true);
    try {
      const fd = new FormData();
      fd.append("file", f, f.name);
      const res = await fetch("/api/facturas/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al leer el PDF");
      setBorrador({
        file: f,
        proveedor: data.datos.proveedor || "",
        folio: data.datos.folio || "",
        fecha: data.datos.fecha || "",
        monto: data.datos.monto ?? "",
        moneda: data.datos.moneda || "USD",
        rfc: data.datos.rfc || "",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalizando(false);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    if (!borrador) return;
    const anterior = actual(borrador.proveedor);
    if (anterior) {
      const ok = confirm(
        `Esto reemplazará la factura anterior de ${PROVEEDORES[borrador.proveedor]} (folio ${anterior.folio}). ¿Continuar?`
      );
      if (!ok) return;
    }
    setGuardando(true);
    setError("");
    setExito("");
    try {
      const fd = new FormData();
      fd.append("file", borrador.file, borrador.file.name);
      fd.append("proveedor", borrador.proveedor);
      fd.append("folio", borrador.folio);
      fd.append("fecha", borrador.fecha);
      fd.append("monto", String(borrador.monto));
      fd.append("moneda", borrador.moneda);
      fd.append("rfc", borrador.rfc);
      const res = await fetch("/api/facturas", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setExito(`Factura de ${PROVEEDORES[borrador.proveedor]} guardada`);
      setBorrador(null);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
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

  async function compartir(f) {
    if (compartiendo) return;
    setCompartiendo(f.proveedor);
    setError("");
    setExito("");
    try {
      const texto = `Factura ${PROVEEDORES[f.proveedor]} · Folio ${f.folio} · ${formatFecha(f.fecha)} · ${formatMonto(f.monto, f.moneda)} · RFC ${f.rfc}`;
      const res = await fetch(`/api/facturas/${f.proveedor}/pdf`);
      if (!res.ok) throw new Error("No se pudo obtener el PDF");
      const blob = await res.blob();
      const nombre = f.archivo?.nombre || `factura-${f.proveedor}.pdf`;
      const file = new File([blob], nombre, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: nombre, text: texto });
          setExito("📲 Factura compartida.");
          return;
        } catch (e) {
          if (e?.name !== "AbortError") throw e;
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 6000);
      abrirWhatsApp(texto);
      setExito("📥 PDF descargado y WhatsApp abierto: arrastra el archivo al chat.");
    } catch (e) {
      setError(e.message || "No se pudo compartir");
    } finally {
      setCompartiendo("");
    }
  }

  return (
    <main className="contenedor">
      <h1 style={{ fontSize: 22 }}>Facturas de proveedores</h1>
      <p style={{ color: "var(--suave)" }}>
        Se guarda solo la última factura de cada proveedor. Al subir una nueva, reemplaza a la anterior.
      </p>

      {error && <div className="aviso">{error}</div>}
      {exito && <div className="exito">{exito}</div>}

      <div className="grid-lista">
        {Object.entries(PROVEEDORES).map(([clave, nombre]) => {
          const f = actual(clave);
          return (
            <div key={clave} className="tarjeta">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span className="placa" style={{ fontSize: 18 }}>{nombre}</span>
                {f && <span className="chip azul">Folio {f.folio}</span>}
              </div>
              {f ? (
                <>
                  <div className="linea-datos">
                    <span>Fecha {formatFecha(f.fecha)}</span>
                    <span>Monto {formatMonto(f.monto, f.moneda)}</span>
                  </div>
                  <div className="linea-datos">
                    <span>RFC {f.rfc || "—"}</span>
                  </div>
                  <div className="linea-datos" style={{ fontSize: 12 }}>
                    <span>📄 {f.archivo?.nombre || "—"}</span>
                    <span>{formatKB(f.archivo?.tamano)}</span>
                  </div>
                  <div className="linea-datos" style={{ fontSize: 12 }}>
                    <span>Subida por {f.ownerEmail}</span>
                    <span>{formatFecha(f.subido)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <a className="btn sec" href={`/api/facturas/${clave}/pdf`} target="_blank" rel="noopener">
                      Ver PDF
                    </a>
                    <button className="btn" onClick={() => compartir(f)} disabled={Boolean(compartiendo)}>
                      {compartiendo === clave ? <span className="girar" /> : "Compartir por WhatsApp"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="linea-datos" style={{ marginTop: 10 }}>
                  <span>Sin factura cargada</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="titulo-seccion">Subir factura</h2>
      {!borrador && (
        <div
          className={`zona ${arriba ? "arriba" : ""}`}
          onClick={() => document.getElementById("factura__input").click()}
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
          <h3>Arrastra aquí el PDF de la factura</h3>
          <p>o haz clic para elegir archivo (.pdf)</p>
          <input
            id="factura__input"
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={(e) => analizar(e.target.files)}
          />
        </div>
      )}

      {analizando && (
        <p style={{ color: "var(--suave)" }}>
          <span className="girar" /> Leyendo factura…
        </p>
      )}

      {borrador && (
        <form className="form tarjeta" style={{ maxWidth: 480, marginTop: 12 }} onSubmit={guardar}>
          <div>
            <label>Proveedor</label>
            <select
              required
              value={borrador.proveedor}
              onChange={(e) => setBorrador({ ...borrador, proveedor: e.target.value })}
            >
              <option value="">Selecciona…</option>
              {Object.entries(PROVEEDORES).map(([clave, nombre]) => (
                <option key={clave} value={clave}>{nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Folio</label>
            <input required value={borrador.folio} onChange={(e) => setBorrador({ ...borrador, folio: e.target.value })} />
          </div>
          <div>
            <label>Fecha</label>
            <input type="date" required value={borrador.fecha} onChange={(e) => setBorrador({ ...borrador, fecha: e.target.value })} />
          </div>
          <div>
            <label>Monto total</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={borrador.monto}
              onChange={(e) => setBorrador({ ...borrador, monto: e.target.value })}
            />
          </div>
          <div>
            <label>Moneda</label>
            <select value={borrador.moneda} onChange={(e) => setBorrador({ ...borrador, moneda: e.target.value })}>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
            </select>
          </div>
          <div>
            <label>RFC del emisor</label>
            <input value={borrador.rfc} onChange={(e) => setBorrador({ ...borrador, rfc: e.target.value })} />
          </div>
          <p style={{ color: "var(--suave)", fontSize: 12, margin: 0 }}>Archivo: {borrador.file.name}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn sec" onClick={() => setBorrador(null)}>
              Cancelar
            </button>
            <button className="btn" disabled={guardando}>
              {guardando ? <span className="girar" /> : "Guardar factura"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
