import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics | YouTuber Min",
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
