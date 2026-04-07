"use client";

import { useSession as useBetterAuthSession } from "@/lib/auth-client";

export function useSession() {
  const { data, isPending, error } = useBetterAuthSession();

  return {
    user: data?.user ?? null,
    session: data?.session ?? null,
    isLoading: isPending,
    error: error ?? null,
  };
}
