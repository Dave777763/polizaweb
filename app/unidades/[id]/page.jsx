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

  // Imagen-banner con los teléfonos de emergencia (generada al vuelo con canvas)
  async function crearImagenTelefonos() {
    try {
      const ANCHO = 900;
      const ALTO = 300;
      const canvas = document.createElement("canvas");
      canvas.width = ANCHO;
      canvas.height = ALTO;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Fondo azul Inbursa con marco
      ctx.fillStyle = "#0b64c6";
      ctx.fillRect(0, 0, ANCHO, ALTO);
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 5;
      ctx.strokeRect(16, 16, ANCHO - 32, ALTO - 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 33px Arial, Helvetica, sans-serif";
      ctx.fillText("REPORTE DE SINIESTRO (INBURSA) 24 h", 44, 78);
      ctx.fillRect(44, 96, ANCHO - 88, 3);

      ctx.font = "bold 52px Arial, Helvetica, sans-serif";
      ctx.fillText("☎ 800 911 9000", 44, 160);
      ctx.fillText("☎ 55 5447 8080", 44, 222);

      ctx.font = "26px Arial, Helvetica, sans-serif";
      ctx.fillText("App Inbursa Móvil (con un clic te localizan)", 44, 272);

      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) return null;
      return new File([blob], "telefonos-emergencia-inbursa.png", { type: "image/png" });
    } catch {
      return null;
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
      const archivoPdf = new File([blob], nombre, { type: "application/pdf" });

      // Los teléfonos viajan como IMAGEN adjunta: al compartir archivos WhatsApp móvil
      // se come el texto, pero una imagen siempre se ve en el chat
      const imagen = await crearImagenTelefonos();
      const archivos = imagen ? [archivoPdf, imagen] : [archivoPdf];
      const compartibles =
        navigator.canShare && navigator.canShare({ files: archivos })
          ? archivos
          : navigator.canShare && navigator.canShare({ files: [archivoPdf] })
            ? [archivoPdf]
            : null;
      if (compartibles) {
        try {
          await navigator.share({ files: compartibles, title: nombre, text: texto });
          setAviso(
            compartibles.length === 2
              ? "📲 Carátula PDF + imagen de teléfonos de emergencia listos para el chat."
              : copiado
                ? "📲 PDF compartido · mensaje con teléfonos copiado al portapapeles: si no aparecieron, mantén presionada la caja de texto y pégalo."
                : "📲 PDF compartido."
          );
          return; // el sistema tomó los archivos
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

  async function eliminar() {
    if (!confirm("¿Eliminar esta unidad (registro y PDF)? Esto es permanente.")) return;
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button
              className="btn"
              style={{ background: "#25D366" }}
              onClick={() => (esMovil() ? enviarPdfApp() : setMenuWhats((m) => !m))}
              disabled={compartiendo}
            >
              {compartiendo ? <span className="girar" /> : "🟢 Compartir por WhatsApp"}
            </button>
            <a
              className="btn sec"
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
        </div>
        <div>
          <iframe className="visor" src={`/api/unidades/${unidad.id}/pdf`} title={`Póliza ${unidad.placa || unidad.serie}`} />
        </div>
      </div>
    </main>
  );
}
