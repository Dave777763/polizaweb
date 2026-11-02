"use client";

import { useState } from "react";
import { formatFecha } from "@/lib/util";

function etiquetaEstado(e) {
  if (e === "nueva") return <span className="chip azul">Nueva</span>;
  if (e === "renovacion") return <span className="chip amarilla">Renovación — sustituye la vigente</span>;
  if (e === "renovacion-en-lote") return <span className="chip amarilla">Repetida en lote — gana esta</span>;
  if (e === "rechazada") return <span className="chip roja">Rechazada: sin N.º de serie</span>;
  return <span className="chip gris">{e}</span>;
}

export default function SubirPage() {
  const [files, setFiles] = useState([]);
  const [analizando, setAnalizando] = useState(false);
  const [rows, setRows] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [arriba, setArriba] = useState(false);

  async function analizar(fileList) {
    const fs = Array.from(fileList || []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!fs.length) return;
    setError("");
    setExito("");
    setResumen(null);
    setRows([]);
    setFiles(fs);
    setAnalizando(true);
    try {
      const fd = new FormData();
      fs.forEach((f) => fd.append("files", f, f.name));
      const res = await fetch("/api/policies/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al analizar el PDF");
      setRows(data.rows || []);
      setResumen(data.resumen || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalizando(false);
    }
  }

  async function confirmar() {
    setGuardando(true);
    setError("");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f, f.name));
      const res = await fetch("/api/policies/confirm", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      setResumen(null);
      setRows([]);
      setFiles([]);
      setExito(
        `Subida completada: ${data.resumen.creadas} nuevas, ${data.resumen.renovadas} renovaciones` +
          (data.resumen.rechazadas ? `, ${data.resumen.rechazadas} filas rechazadas por falta de serie` : "")
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="contenedor">
      <h1 style={{ fontSize: 22 }}>Subir pólizas</h1>
      <p style={{ color: "var(--suave)" }}>
        Puedes subir el PDF completo de la carátula (todas las unidades) o los PDF separados por
        unidad. La app lee serie, placa, CIS y vigencias automáticamente.
        <br />
        <b>Regla de renovación:</b> si el N.º de serie ya existe, el registro y su PDF anterior
        quedan sustituidos por el nuevo (último subido gana).
      </p>

      <div
        className={`zona ${arriba ? "arriba" : ""}`}
        onClick={() => document.getElementById("f__input").click()}
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
        <h3>Arrastra aquí los PDF</h3>
        <p>o haz clic para elegir archivos (.pdf)</p>
        <input
          id="f__input"
          type="file"
          multiple
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => analizar(e.target.files)}
        />
      </div>

      {error && <div className="aviso">{error}</div>}
      {exito && <div className="exito">{exito}</div>}

      {analizando && (
        <p style={{ color: "var(--suave)" }}>
          <span className="girar" /> Leyendo pólizas del PDF…
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="fila-acciones">
            <b>{rows.length} filas detectadas</b>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn sec" onClick={() => { setRows([]); setFiles([]); setResumen(null); }}>
                Limpiar
              </button>
              <button className="btn" onClick={confirmar} disabled={guardando || analizando}>
                {guardando ? <span className="girar" /> : "Confirmar y guardar"}
              </button>
            </div>
          </div>
          <table className="tabla">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Págs</th>
                <th>Nº de serie</th>
                <th>Placa</th>
                <th>CIS</th>
                <th>Emp.</th>
                <th>Vigencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.archivo}</td>
                  <td>{r.paginas}</td>
                  <td className="mono">{r.serie || "—"}</td>
                  <td className="mono">{r.placa || "sin placa"}</td>
                  <td className="mono">{r.cis}</td>
                  <td>{r.empleado}</td>
                  <td>
                    {formatFecha(r.vigenciaDesde)} → {formatFecha(r.vigenciaHasta)}
                  </td>
                  <td>{etiquetaEstado(r.estado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: "var(--suave)", fontSize: 13 }}>
            Revisa la columna «Estado»: las renovaciones reemplazan la póliza vigente; las filas sin
            serie se rechazan.
          </p>
        </>
      )}
    </main>
  );
}
