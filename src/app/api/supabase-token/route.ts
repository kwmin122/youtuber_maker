import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getServerSession } from "@/lib/auth/get-session";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);

  const token = await new SignJWT({
    sub: session.user.id,
    role: "authenticated",
    iss: "youtuber-min",
    aud: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  return NextResponse.json({ token });
}
