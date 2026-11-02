"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatFecha, vigenciaChip } from "@/lib/util";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [q, setQ] = useState("");
  const [unidades, setUnidades] = useState([]);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [form, setForm] = useState({ email: "", nombre: "", rol: "empleado", password: "" });
  const [creando, setCreando] = useState(false);

  const cargarUsuarios = useCallback(() => {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((d) => setUsuarios(d.usuarios || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => {});
    cargarUsuarios();
  }, [cargarUsuarios]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/unidades?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setUnidades(d.unidades || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // admin: users + all units
  if (user && user.rol !== "admin") {
    return (
      <main className="contenedor">
        <div className="aviso">Solo el administrador puede ver esta sección.</div>
        <Link href="/">← Volver</Link>
      </main>
    );
  }
  if (!user) return null;

  async function crearUsuario(e) {
    e.preventDefault();
    setCreando(true);
    setExito("");
    setError("");
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear");
      setForm({ email: "", nombre: "", rol: "empleado", password: "" });
      setExito(`Usuario ${data.usuario.email} creado`);
      cargarUsuarios();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreando(false);
    }
  }

  async function borrarUsuario(u) {
    if (!confirm(`¿Eliminar la cuenta de ${u.email}?`)) return;
    const res = await fetch(`/api/usuarios/${u.id}`, { method: "DELETE" });
    if (res.ok) cargarUsuarios();
    else {
      const d = await res.json();
      alert(d.error || "No se pudo eliminar");
    }
  }

  return (
    <main className="contenedor">
      <div className="fila-acciones">
        <h1 style={{ fontSize: 22, margin: 0 }}>Administración</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn" href="/api/export?formato=xlsx">
            📊 Relación Excel
          </a>
          <a className="btn sec" href="/api/export">
            ⬇ Exportar CSV (todas las unidades)
          </a>
        </div>
      </div>

      {error && <div className="aviso">{error}</div>}
      {exito && <div className="exito">{exito}</div>}

      <h2 className="titulo-seccion">Usuarios</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Creado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nombre}</td>
              <td>{u.email}</td>
              <td>
                <span className={u.rol === "admin" ? "chip azul" : "chip gris"}>{u.rol}</span>
              </td>
              <td>{formatFecha(u.creado)}</td>
              <td>
                {u.id !== user.sub && (
                  <button className="btn sec" onClick={() => borrarUsuario(u)}>
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="titulo-seccion">Agregar usuario</h2>
      <form className="form" onSubmit={crearUsuario}>
        <div>
          <label>Correo</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label>Nombre</label>
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </div>
        <div>
          <label>Rol</label>
          <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
            <option value="empleado">empleado</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div>
          <label>Contraseña inicial</label>
          <input
            type="text"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <button className="btn" disabled={creando}>
          {creando ? <span className="girar" /> : "Crear usuario"}
        </button>
      </form>

      <h2 className="titulo-seccion">Unidades (todas)</h2>
      <input className="buscador" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="tabla" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>N°</th>
            <th>Placa</th>
            <th>Serie</th>
            <th>CIS</th>
            <th>Vigencia</th>
            <th>Subida por</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {unidades.map((u) => {
            const chip = vigenciaChip(u.vigenciaHasta);
            return (
              <tr key={u.id}>
                <td className="mono">{u.unidad5}</td>
                <td className="mono">{u.placa || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{u.serie}</td>
                <td className="mono">{u.cis}</td>
                <td>
                  <span className={`chip ${chip.tone}`}>{chip.label}</span>
                </td>
                <td>{u.ownerEmail}</td>
                <td>
                  <Link href={`/unidades/${u.id}`}>Ver</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
