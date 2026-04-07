"use client";

import { useState } from "react";
import { ApiKeyForm } from "@/components/api-key-form";
import { ApiKeyList } from "@/components/api-key-list";

export default function ApiKeysPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  function handleSuccess() {
    setRefreshTrigger((prev) => prev + 1);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">API Key Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Register your own API keys (BYOK). Keys are encrypted server-side and
          never stored in plaintext.
        </p>
      </div>

      <ApiKeyForm onSuccess={handleSuccess} />
      <ApiKeyList refreshTrigger={refreshTrigger} />
    </div>
  );
}
