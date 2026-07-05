import Link from "next/link";
import { Package, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductWithMeta } from "@/types";

const registryColors: Record<string, string> = {
  dockerhub: "bg-blue-100 text-blue-700",
  ghcr: "bg-purple-100 text-purple-700",
  ecr: "bg-orange-100 text-orange-700",
  gcr: "bg-green-100 text-green-700",
  acr: "bg-sky-100 text-sky-700",
  generic: "bg-gray-100 text-gray-700",
};

export function ProductCard({ product }: { product: ProductWithMeta }) {
  const registryLabel = product.registryType.toUpperCase();
  const colorClass = registryColors[product.registryType] ?? registryColors.generic;

  return (
    <div className="rounded-lg border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Package className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <Link
              href={`/products/${product.id}`}
              className="font-semibold hover:text-primary transition-colors truncate block"
            >
              {product.name}
            </Link>
            {product.description && (
              <p className="text-xs text-muted-foreground truncate">{product.description}</p>
            )}
          </div>
        </div>
        <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0", colorClass)}>
          {registryLabel}
        </span>
      </div>

      <div className="text-xs text-muted-foreground font-mono truncate">
        {product.repository}
        {product.currentTag ? `:${product.currentTag}` : ""}
      </div>

      {product.currentDigest && (
        <div className="text-xs text-muted-foreground font-mono truncate">
          {product.currentDigest.slice(0, 19)}…
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t">
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{product._count.statements} statements</span>
          <span>{product.teams.length} team{product.teams.length !== 1 ? "s" : ""}</span>
        </div>
        <Link
          href={`/products/${product.id}/statements`}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          View statements
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
