import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getSessionUser();
    return Response.json({ user });
  } catch {
    return Response.json({ user: null });
  }
}
