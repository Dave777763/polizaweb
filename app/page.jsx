"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatFecha, formatKB, vigenciaChip } from "../lib/util";

export default function Home() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/unidades?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (cancel) return;
        if (!res.ok) throw new Error(data.error || "Error al consultar");
        setItems(data.unidades || []);
        setError("");
      } catch (e) {
        if (!cancel) setError(e.message);
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 300);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <main className="contenedor">
      <h1 style={{ fontSize: 22 }}>Pólizas de la flotilla</h1>
      <input
        className="buscador"
        placeholder="Buscar por placa, serie, CIS, póliza o descripción…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && <div className="aviso">{error}</div>}
      {loading && (
        <p style={{ color: "var(--suave)" }}>
          <span className="girar" /> Consultando…
        </p>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="nota">
          {q
            ? `Sin resultados para «${q}».` : "Aún no hay pólizas. Ve a Subir y arrastra el PDF de la carátula."}
        </div>
      )}

      <div className="grid-lista">
        {items.map((u) => {
          const chip = vigenciaChip(u.vigenciaHasta);
          return (
            <Link key={u.id} href={`/unidades/${u.id}`} className="tarjeta" style={{ display: "block", color: "inherit", textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span className="placa">{u.placa || "SIN PLACA"}</span>
                <span className={`chip ${chip.tone}`}>{chip.label}</span>
              </div>
              <div className="mono" style={{ fontSize: 12, color: "var(--suave)", marginTop: 6 }}>
                {u.serie}
              </div>
              <div className="linea-datos">
                <span>CIS {u.cis}</span>
                {u.empleado && <span>Emp. {u.empleado}</span>}
                {u.modelo && <span>Modelo {u.modelo}</span>}
              </div>
              <div style={{ fontSize: 13, marginTop: 8 }}>{u.descripcion}</div>
              <div className="linea-datos" style={{ marginTop: 8 }}>
                <span>📄 {u.archivo?.nombre || "—"}</span>
                <span>{formatKB(u.archivo?.tamano)}</span>
              </div>
              {u.ownerEmail && (
                <div className="linea-datos" style={{ fontSize: 12 }}>
                  <span>Subida por {u.ownerEmail}</span>
                  <span>{formatFecha(u.subido)}</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
