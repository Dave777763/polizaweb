"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatFecha, formatKB, vigenciaChip } from "@/lib/util";

export default function DetalleUnidad() {
  const { id } = useParams();
  const router = useRouter();
  const [unidad, setUnidad] = useState(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [menuWhats, setMenuWhats] = useState(false);
  const [tarjeta, setTarjeta] = useState(null);
  const [compartiendoTarjeta, setCompartiendoTarjeta] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => {});
    fetch(`/api/unidades/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) setError(d.error || "No encontrada");
        else setUnidad(d.unidad);
      })
      .catch(() => setError("Error de conexión"));
  }, [id]);

  useEffect(() => {
    if (!unidad?.serie) return;
    fetch(`/api/tarjetas?serie=${encodeURIComponent(unidad.serie)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.tarjetas?.length) setTarjeta(d.tarjetas[0]);
      })
      .catch(() => {});
  }, [unidad?.serie]);

  function esMovil() {
    return (
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) // iPadOS se hace pasar por Mac
    );
  }

  function mensaje() {
    const datos = `${unidad.placa ? unidad.placa + " · " : ""}${unidad.descripcion || "Póliza de la flota"} · vigente hasta ${formatFecha(unidad.vigenciaHasta)}`;
    return `${datos}\n🚨 Reportar siniestro (Inbursa) 24 h:\n☎ 800 911 9000\n☎ 55 5447 8080\n📱 App Inbursa Móvil (con un clic te localizan)`;
  }

  async function obtenerPdf() {
    const nombre = unidad.archivo?.nombre || `poliza-${unidad.placa || unidad.serie}.pdf`;
    const res = await fetch(`/api/unidades/${unidad.id}/pdf`);
    if (!res.ok) throw new Error("No se pudo obtener el PDF");
    const blob = await res.blob();
    return { blob, nombre };
  }

  // Abre WhatsApp para mandar texto: en PC la app web (navegador), en móvil la app instalada
  function abrirWhatsAppConTexto(texto) {
    window.open(
      esMovil()
        ? `https://wa.me/?text=${encodeURIComponent(texto)}`
        : `https://web.whatsapp.com/send?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener"
    );
  }

  // Descarga el PDF al disco y abre WhatsApp con el mensaje listo (vía web)
  function descargarYAbrirWeb(blob, nombre, texto) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    abrirWhatsAppConTexto(texto);
  }

  // Copia el mensaje completo (teléfonos de emergencia incluidos) al portapapeles
  async function copiarMensaje(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      return false; // sin permiso/soporte: seguimos sin bloquear el envío
    }
  }

  // 📎 App WhatsApp: panel nativo con el PDF adjunto (automático si la app está instalada).
  // Si nada lo soporta o el usuario cancela, rescata con la vía web.
  async function enviarPdfApp() {
    setMenuWhats(false);
    if (compartiendo) return;
    setCompartiendo(true);
    setAviso("");
    try {
      const texto = mensaje();
      // WhatsApp móvil descarta el texto que va pegado al adjuntar archivos: lo dejamos
      // copiado ANTES de todo (con el gesto fresco) para pegarlo en el chat si hace falta
      const copiado = await copiarMensaje(texto);
      const { blob, nombre } = await obtenerPdf();
      const file = new File([blob], nombre, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: nombre, text: texto });
          setAviso(
            copiado
              ? "📲 PDF compartido · El mensaje con los teléfonos quedó copiado al portapapeles: si no aparecieron en el chat, mantén presionada la caja de texto y pégalo."
              : "📲 PDF compartido."
          );
          return; // el sistema tomó el PDF
        } catch (e) {
          if (e?.name !== "AbortError") throw e;
          // cancelaron el panel -> seguimos a la vía web
        }
      }
      descargarYAbrirWeb(blob, nombre, texto);
      setAviso(
        copiado
          ? "📥 PDF descargado y WhatsApp abierto · arrastra el archivo; si hace falta el mensaje, mantén presionado el campo de texto y pégalo."
          : "📥 PDF descargado y WhatsApp abierto: arrastra el archivo al chat."
      );
    } catch (e) {
      if (e?.name === "AbortError") return;
      alert(e?.message || "No se pudo compartir");
    } finally {
      setCompartiendo(false);
    }
  }

  // 🌐 WhatsApp Web: descarga el PDF + abre web.whatsapp.com con el mensaje
  async function enviarPdfWeb() {
    setMenuWhats(false);
    if (compartiendo) return;
    setCompartiendo(true);
    setAviso("");
    try {
      const texto = mensaje();
      const { blob, nombre } = await obtenerPdf();
      descargarYAbrirWeb(blob, nombre, texto);
      setAviso("📥 PDF descargado y WhatsApp Web abierto: arrastra el archivo al chat.");
    } catch (e) {
      alert(e?.message || "No se pudo abrir");
    } finally {
      setCompartiendo(false);
    }
  }

  // 🪪 Tarjeta de circulación de esta serie (si ya se subió)
  async function compartirTarjeta() {
    if (compartiendoTarjeta || !tarjeta) return;
    setCompartiendoTarjeta(true);
    setAviso("");
    try {
      const texto = `🪪 Tarjeta de circulación · Placas ${tarjeta.placas} · Serie ${tarjeta.serie}${
        tarjeta.vigencia ? " · Vigencia " + tarjeta.vigencia : ""
      }`;
      const nombre = tarjeta.archivo?.nombre || `tarjeta-${tarjeta.placas || tarjeta.serie}.pdf`;
      const res = await fetch(`/api/tarjetas/${tarjeta.id}/pdf`);
      if (!res.ok) throw new Error("No se pudo obtener la tarjeta");
      const blob = await res.blob();
      const file = new File([blob], nombre, { type: "application/pdf" });
      if (esMovil() && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: nombre, text: texto });
          setAviso("📲 Tarjeta de circulación compartida.");
          return;
        } catch (e) {
          if (e?.name === "AbortError") return;
        }
      }
      descargarYAbrirWeb(blob, nombre, texto);
      setAviso("📥 Tarjeta descargada y WhatsApp abierto: arrastra el archivo al chat.");
    } catch (e) {
      alert(e?.message || "No se pudo compartir la tarjeta");
    } finally {
      setCompartiendoTarjeta(false);
    }
  }

  async function eliminar() {    if (!confirm("¿Eliminar esta unidad (registro y PDF)? Esto es permanente.")) return;
    const res = await fetch(`/api/unidades/${id}`, { method: "DELETE" });
    if (res.ok) router.replace("/");
    else {
      const d = await res.json();
      alert(d.error || "No se pudo eliminar");
    }
  }

  if (error) {
    return (
      <main className="contenedor">
        <div className="aviso">{error}</div>
        <Link href="/">← Volver</Link>
      </main>
    );
  }
  if (!unidad) {
    return (
      <main className="contenedor">
        <p style={{ color: "var(--suave)" }}>
          <span className="girar" /> Cargando…
        </p>
      </main>
    );
  }

  const chip = vigenciaChip(unidad.vigenciaHasta);

  return (
    <main className="contenedor">
      <div className="fila-acciones">
        <Link href="/">← Volver a la lista</Link>
        {me?.rol === "admin" && (
          <button className="btn peligro" onClick={eliminar}>
            Eliminar
          </button>
        )}
      </div>

      <div className="detalle-grid">
        <div className="tarjeta">
          <div className="placa" style={{ fontSize: 24 }}>{unidad.placa || "SIN PLACA"}</div>
          <span className={`chip ${chip.tone}`} style={{ marginTop: 8 }}>{chip.label}</span>
          <dl style={{ fontSize: 13, lineHeight: 1.9, marginTop: 14 }}>
            <dt style={{ color: "var(--suave)" }}>Nº de serie (VIN)</dt>
            <dd style={{ margin: 0 }} className="mono">{unidad.serie}</dd>
            <dt style={{ color: "var(--suave)" }}>Nº de unidad</dt>
            <dd style={{ margin: 0 }} className="mono">{unidad.unidad5 || (unidad.serie || "").slice(-5)}</dd>
            <dt style={{ color: "var(--suave)" }}>CIS</dt>
            <dd style={{ margin: 0 }} className="mono">{unidad.cis}</dd>
            <dt style={{ color: "var(--suave)" }}>Póliza Inbursa</dt>
            <dd style={{ margin: 0 }} className="mono">{unidad.poliza || "—"}</dd>
            <dt style={{ color: "var(--suave)" }}>Empleado</dt>
            <dd style={{ margin: 0 }}>{unidad.empleado}</dd>
            <dt style={{ color: "var(--suave)" }}>Vigencia</dt>
            <dd style={{ margin: 0 }}>
              {formatFecha(unidad.vigenciaDesde)} → {formatFecha(unidad.vigenciaHasta)}
            </dd>
            {(unidad.modelo || unidad.descripcion) && (
              <>
                <dt style={{ color: "var(--suave)" }}>Vehículo</dt>
                <dd style={{ margin: 0 }}>
                  {unidad.descripcion} {unidad.modelo && <span>· Modelo {unidad.modelo}</span>}
                </dd>
              </>
            )}
            <dt style={{ color: "var(--suave)" }}>Propietario</dt>
            <dd style={{ margin: 0 }}>{unidad.propietario || "—"}</dd>
            <dt style={{ color: "var(--suave)" }}>Archivo</dt>
            <dd style={{ margin: 0 }}>
              {unidad.archivo?.nombre} ({formatKB(unidad.archivo?.tamano)}) · pg. {unidad.paginas}
            </dd>
            <dt style={{ color: "var(--suave)" }}>Subida</dt>
            <dd style={{ margin: 0 }}>
              {formatFecha(unidad.subido)} por {unidad.ownerEmail}
            </dd>
          </dl>
          {aviso && <div className="exito" style={{ marginTop: 12 }}>{aviso}</div>}
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <button
              className="btn"
              style={{ background: "#25D366", width: "100%" }}
              onClick={() => (esMovil() ? enviarPdfApp() : setMenuWhats((m) => !m))}
              disabled={compartiendo}
            >
              {compartiendo ? <span className="girar" /> : "🟢 Compartir por WhatsApp"}
            </button>
            <a
              className="btn sec"
              style={{ width: "100%", textAlign: "center" }}
              href={`/api/unidades/${unidad.id}/pdf?download=1`}
            >
              ⬇ Descargar PDF
            </a>
          </div>
          {menuWhats && (
            <div style={{ marginTop: 10, display: "grid", gap: 8, maxWidth: 430 }}>
              <div style={{ fontSize: 13, color: "var(--suave)" }}>
                ¿Cómo quieres enviar la póliza?
              </div>
              <button className="btn" onClick={enviarPdfApp} disabled={compartiendo}>
                📎 App WhatsApp — PDF adjunto directo
              </button>
              <button
                className="btn"
                style={{ background: "#25D366" }}
                onClick={enviarPdfWeb}
                disabled={compartiendo}
              >
                🌐 WhatsApp Web — descarga + arrastre
              </button>
              <button className="btn sec" onClick={() => setMenuWhats(false)} disabled={compartiendo}>
                ✖ Cancelar
              </button>
            </div>
          )}

          {tarjeta && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--borde)" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>🪪 Tarjeta de circulación</div>
              <div className="linea-datos">
                <span>Placas {tarjeta.placas || "—"}</span>
                {tarjeta.vigencia && <span>Vigencia {tarjeta.vigencia}</span>}
                {tarjeta.folio && <span>Folio {tarjeta.folio}</span>}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <button
                  className="btn"
                  style={{ background: "#25D366" }}
                  onClick={compartirTarjeta}
                  disabled={compartiendoTarjeta}
                >
                  {compartiendoTarjeta ? <span className="girar" /> : "🟢 Compartir tarjeta por WhatsApp"}
                </button>
                <a
                  className="btn sec"
                  style={{ textAlign: "center" }}
                  href={`/api/tarjetas/${tarjeta.id}/pdf?download=1`}
                >
                  ⬇ Descargar tarjeta
                </a>
              </div>
            </div>
          )}
        </div>
        <div>
          <iframe className="visor" src={`/api/unidades/${unidad.id}/pdf`} title={`Póliza ${unidad.placa || unidad.serie}`} />
        </div>
      </div>
    </main>
  );
}
