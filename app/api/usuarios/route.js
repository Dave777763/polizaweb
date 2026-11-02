import bcrypt from "bcryptjs";
import { getDb, errorResponse } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || user.rol !== "admin") {
      return Response.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }
    const db = await getDb();
    const docs = await db
      .collection("usuarios")
      .find({}, { projection: { nombre: 1, email: 1, rol: 1, creado: 1 } })
      .sort({ creado: 1 })
      .toArray();
    return Response.json({
      ok: true,
      usuarios: docs.map((u) => ({
        id: u._id.toString(),
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        creado: u.creado,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req) {
  try {
    const me = await getSessionUser();
    if (!me || me.rol !== "admin") {
      return Response.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }
    const { email, nombre, password, rol } = await req.json();
    if (!email || !nombre || !password || password.length < 6) {
      return Response.json(
        { ok: false, error: "Faltan datos o la contraseña es muy corta (mínimo 6)" },
        { status: 400 }
      );
    }
    const db = await getDb();
    const correo = String(email).trim().toLowerCase();
    const dup = await db.collection("usuarios").findOne({ email: correo });
    if (dup) return Response.json({ ok: false, error: "Ese correo ya existe" }, { status: 409 });
    const passwordHash = await bcrypt.hash(String(password), 10);
    const res = await db.collection("usuarios").insertOne({
      email: correo,
      nombre: String(nombre).trim(),
      rol: rol === "admin" ? "admin" : "empleado",
      passwordHash,
      creado: new Date(),
    });
    return Response.json({ ok: true, usuario: { id: res.insertedId.toString(), email: correo } });
  } catch (e) {
    return errorResponse(e);
  }
}
