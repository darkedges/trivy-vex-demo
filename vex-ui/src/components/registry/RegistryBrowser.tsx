"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Package, RefreshCw, Check } from "lucide-react";
import { format } from "date-fns";

interface RegistryTag {
  tag: string;
  digest: string | null;
  lastUpdated?: string;
}

interface ProductEntry {
  id: string;
  name: string;
  repository: string;
  registryType: string;
  currentTag: string | null;
  canEdit: boolean;
}

const registryLabels: Record<string, string> = {
  dockerhub: "Docker Hub",
  ghcr: "GHCR",
  ecr: "ECR",
  gcr: "GCR",
  acr: "ACR",
  generic: "Generic",
};

export function RegistryBrowser({ products }: { products: ProductEntry[] }) {
  return (
    <div className="space-y-3">
      {products.map((p) => (
        <RegistryProductRow key={p.id} product={p} />
      ))}
    </div>
  );
}

function RegistryProductRow({ product }: { product: ProductEntry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<RegistryTag[] | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && tags === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/products/${product.id}/registry/tags`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load tags");
        setTags(json.tags);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tags");
      } finally {
        setLoading(false);
      }
    }
  }

  async function applyTag(tag: RegistryTag) {
    setApplying(tag.tag);
    setError(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentTag: tag.tag, currentDigest: tag.digest ?? undefined }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to apply tag");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply tag");
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
          <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate">{product.name}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">{product.repository}</div>
          </div>
        </div>
        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground flex-shrink-0">
          {registryLabels[product.registryType] ?? product.registryType}
        </span>
      </button>

      {open && (
        <div className="border-t px-4 py-3">
          {loading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Loading tags…
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && tags && tags.length === 0 && (
            <p className="text-sm text-muted-foreground">No tags found.</p>
          )}
          {!loading && tags && tags.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left font-medium pb-2">Tag</th>
                  <th className="text-left font-medium pb-2">Digest</th>
                  <th className="text-left font-medium pb-2">Last Updated</th>
                  {product.canEdit && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {tags.map((t) => (
                  <tr key={t.tag}>
                    <td className="py-1.5 font-mono text-xs">
                      {t.tag}
                      {t.tag === product.currentTag && <span className="ml-1.5 text-xs text-primary">(current)</span>}
                    </td>
                    <td className="py-1.5 font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                      {t.digest ? `${t.digest.slice(0, 19)}…` : "—"}
                    </td>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {t.lastUpdated ? format(new Date(t.lastUpdated), "MMM d, yyyy") : "—"}
                    </td>
                    {product.canEdit && (
                      <td className="py-1.5 text-right">
                        <button
                          onClick={() => applyTag(t)}
                          disabled={applying !== null || t.tag === product.currentTag}
                          className="flex items-center gap-1 text-xs rounded border px-2 py-1 hover:bg-accent disabled:opacity-40 transition-colors ml-auto"
                        >
                          {t.tag === product.currentTag ? (
                            <>
                              <Check className="h-3 w-3" /> In use
                            </>
                          ) : applying === t.tag ? (
                            "Applying…"
                          ) : (
                            "Use this tag"
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
