"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/hooks/use-session";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/30 p-4">
        <div className="mb-8">
          <h2 className="text-lg font-bold">YouTuber Min</h2>
          <p className="text-xs text-muted-foreground truncate">
            {user.email}
          </p>
        </div>

        <nav className="space-y-1">
          <Link
            href="/projects"
            className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Projects
          </Link>
          <Link
            href="/longform"
            className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Longform
          </Link>
          <Link
            href="/analytics"
            className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Analytics
          </Link>
          <div className="pt-4">
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Settings
            </p>
            <Link
              href="/settings/api-keys"
              className="mt-1 block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              API Keys
            </Link>
          </div>
        </nav>

        <div className="mt-auto pt-8">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
