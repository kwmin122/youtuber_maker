import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { LongformDetailClient } from "@/components/longform/longform-detail-client";
import type { LongformPollingState } from "@/hooks/use-longform-polling";

async function getInitialState(
  id: string
): Promise<LongformPollingState | null> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${host}`;
  try {
    const res = await fetch(`${base}/api/longform/sources/${id}`, {
      headers: { cookie: h.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as LongformPollingState;
  } catch {
    return null;
  }
}

export default async function LongformDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await getInitialState(id);
  if (!initial) notFound();

  return <LongformDetailClient sourceId={id} initialState={initial} />;
}
