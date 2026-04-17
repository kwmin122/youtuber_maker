"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: "/settings/api-keys", label: "API Keys" },
    { href: "/settings/connected-accounts", label: "연결된 계정" },
  ];

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b pb-0">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 text-sm font-medium rounded-t-md -mb-px border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="pt-6">{children}</div>
    </div>
  );
}
