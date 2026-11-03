"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import pkg from "../../package.json";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [verPassword, setVerPassword] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) router.replace("/");
      })
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar sesión");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
    } catch {
      setError("Error de conexión");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="contenedor">
      <div className="centrado tarjeta">
        <h1 style={{ marginTop: 0 }}>
          Póliza<span style={{ color: "var(--marca)" }}>Web</span>
        </h1>
        <p style={{ color: "var(--suave)" }}>
          Sube y consulta las pólizas de la flotilla en cualquier momento.
        </p>
        {error && <div className="aviso">{error}</div>}
        <form className="form" style={{width:"100%"}} onSubmit={submit}>
          <div>
            <label>Usuario</label>
            <input
              type="text"
              value={email}
              placeholder="admin o tu correo"
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label>Contraseña</label>
            <div style={{ position: "relative" }}>
              <input
                type={verPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{ paddingRight: 46 }}
              />
              <button
                type="button"
                onClick={() => setVerPassword(!verPassword)}
                title={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                style={{
                  position: "absolute",
                  right: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 17,
                  lineHeight: 1,
                  padding: 7,
                }}
              >
                {verPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          <button className="btn" disabled={cargando}>
            {cargando ? <span className="girar" /> : "Iniciar sesión"}
          </button>
        </form>
        <p style={{ color: "var(--suave)", fontSize: 12, marginBottom: 0 }}>v{pkg.version}</p>
      </div>
    </main>
  );
}
