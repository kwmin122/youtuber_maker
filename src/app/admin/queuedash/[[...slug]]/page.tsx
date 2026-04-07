"use client";

import { QueueDashApp } from "@queuedash/ui";
import "@queuedash/ui/dist/styles.css";

export default function QueueDashPage() {
  return (
    <div className="min-h-screen">
      <div className="border-b p-4">
        <h1 className="text-xl font-bold">Queue Dashboard (Admin)</h1>
      </div>
      <QueueDashApp apiUrl="/api/queuedash" basename="/admin/queuedash" />
    </div>
  );
}
