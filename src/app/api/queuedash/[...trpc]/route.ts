import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@queuedash/api";
import { Queue } from "bullmq";
import { getServerSession } from "@/lib/auth/get-session";
import { NextRequest, NextResponse } from "next/server";

const queue = new Queue("main-queue", {
  connection: {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: null,
  },
});

async function checkAdmin(): Promise<boolean> {
  const session = await getServerSession();
  if (!session?.user?.email) return false;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return session.user.email === adminEmail;
}

async function handler(req: NextRequest) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return fetchRequestHandler({
    endpoint: "/api/queuedash",
    req,
    router: appRouter,
    createContext: () => ({
      queues: [
        { queue, displayName: "Main Queue", type: "bullmq" as const },
      ],
    }),
  });
}

export { handler as GET, handler as POST };
