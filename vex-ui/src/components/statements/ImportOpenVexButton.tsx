"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderInput } from "lucide-react";

export function ImportOpenVexButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  async function handleImport() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/products/${productId}/statements/import-openvex`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setResult(json);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-6 space-y-3">
      <div>
        <h3 className="text-sm font-medium flex items-center gap-2">
          <FolderInput className="h-4 w-4" />
          Import existing OpenVEX statements
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Reads already-authored <code className="bg-muted px-1 rounded">.openvex.json</code> documents from the
          configured vex/statements/ path and imports them as approved statements.
        </p>
      </div>
      <button
        onClick={handleImport}
        disabled={pending}
        className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
      >
        {pending ? "Importing…" : "Import from vex/statements/"}
      </button>
      {result && (
        <div className="text-sm space-y-1">
          <p>
            Created <strong>{result.created}</strong> statement{result.created !== 1 ? "s" : ""}
            {result.skipped > 0 && <> — skipped {result.skipped} already present</>}.
          </p>
          {result.errors.length > 0 && (
            <ul className="text-xs text-destructive list-disc list-inside">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
