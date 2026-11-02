import { SignJWT, jwtVerify } from "jose";

// Edge-safe (sin MongoDB): usado en middleware y en rutas del servidor
export const TOKEN_COOKIE = "pw_session";

function secret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "polizaweb-dev-secret-cambiar-en-produccion"
  );
}

export async function createToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload; // { sub, email, nombre, rol }
  } catch {
    return null;
  }
}
