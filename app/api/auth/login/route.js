import bcrypt from "bcryptjs";
import { getDb, errorResponse } from "@/lib/db";
import { createToken, TOKEN_COOKIE } from "@/lib/jwt";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ ok: false, error: "Correo y contraseña requeridos" }, { status: 400 });
    }
    const db = await getDb();
    const user = await db.collection("usuarios").findOne({ email: String(email).trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      return Response.json({ ok: false, error: "Credenciales incorrectas" }, { status: 401 });
    }
    const token = await createToken({
      sub: user._id.toString(),
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    });
    const res = Response.json({
      ok: true,
      user: { email: user.email, nombre: user.nombre, rol: user.rol },
    });
    res.headers.set(
      "Set-Cookie",
      `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
