"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Upload, XCircle } from "lucide-react";

export function CreatePublicationButton({
  productId,
  disabled,
}: {
  productId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to start publication");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start publication");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={disabled || pending}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <Send className="h-4 w-4" />
        {pending ? "Starting…" : "Publish"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function PublishToPagesButton({
  productId,
  publicationId,
  label = "Publish to gh-pages",
}: {
  productId: string;
  publicationId: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/publish/${publicationId}/publish-to-pages`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to publish to gh-pages");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish to gh-pages");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
      >
        <Upload className="h-3.5 w-3.5" />
        {pending ? "Publishing…" : label}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function CancelPublicationButton({ productId, publicationId }: { productId: string; publicationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/publish/${publicationId}/cancel`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to cancel");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md border border-destructive/50 text-destructive px-2.5 py-1.5 text-xs font-medium hover:bg-destructive/10 disabled:opacity-50 transition-colors"
      >
        <XCircle className="h-3.5 w-3.5" />
        {pending ? "Cancelling…" : "Cancel"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
