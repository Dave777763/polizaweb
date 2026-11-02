import { cookies } from "next/headers";
import { TOKEN_COOKIE, verifyToken } from "./jwt";

// Devuelve { sub, email, nombre, rol } o null (lado servidor)
export async function getSessionUser() {
  const c = await cookies();
  const token = c.get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}
