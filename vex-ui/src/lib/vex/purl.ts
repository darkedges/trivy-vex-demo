import type { Product } from "@prisma/client";
import { canonicalRepositoryUrl } from "@/lib/registry";

type ProductPurlFields = Pick<Product, "registryType" | "registryUrl" | "repository" | "slug">;

/**
 * Builds the pkg:oci purl (with Trivy's required repository_url qualifier —
 * see the main README's documented gotcha) for a product's index.json entry.
 * Registry-host knowledge lives in lib/registry; this only assembles the purl.
 */
export function buildIndexPackageId(product: ProductPurlFields): string {
  const qualifier = canonicalRepositoryUrl(product);
  const base = `pkg:oci/${product.slug}`;
  return qualifier ? `${base}?repository_url=${encodeURIComponent(qualifier)}` : base;
}
