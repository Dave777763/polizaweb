"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => {});
  }, [path]);

  if (!user || path === "/login") return null;

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <header className="cabecera">
      <Link href="/" className="logo">
        Póliza<span>Web</span>
      </Link>
      <nav>
        <Link className={`enlace ${path === "/" ? "activo" : ""}`} href="/">
          Consultar
        </Link>
        <Link className={`enlace ${path === "/subir" ? "activo" : ""}`} href="/subir">
          Subir
        </Link>
        {user.rol === "admin" && (
          <Link className={`enlace ${path === "/admin" ? "activo" : ""}`} href="/admin">
            Admin
          </Link>
        )}
      </nav>
      <div className="usuario-caja">
        <span>{user.nombre}</span>
        <span className="rol-pill">{user.rol}</span>
        <button className="btn sec" onClick={salir}>
          Salir
        </button>
      </div>
    </header>
  );
}
