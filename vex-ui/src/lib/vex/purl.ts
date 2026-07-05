import type { Product } from "@prisma/client";

type ProductRegistryFields = Pick<Product, "registryType" | "registryUrl" | "repository">;

/**
 * Derives the `repository_url` qualifier Trivy's --vex repo lookup keeps for
 * pkg:oci purls (see the main README's documented gotcha — a bare
 * pkg:oci/<name> is never matched; the qualifier must be present and match
 * what Trivy derives from the scanned image). Best-effort beyond
 * dockerhub/ghcr — verify against a real `trivy image --vex repo` run.
 */
export function buildRepositoryUrlQualifier(product: ProductRegistryFields): string | undefined {
  switch (product.registryType) {
    case "dockerhub":
      return `index.docker.io/${product.repository}`;
    case "ghcr":
      return `${product.registryUrl || "ghcr.io"}/${product.repository}`;
    default:
      return product.registryUrl ? `${product.registryUrl}/${product.repository}` : undefined;
  }
}

export function buildIndexPackageId(product: ProductRegistryFields & Pick<Product, "slug">): string {
  const qualifier = buildRepositoryUrlQualifier(product);
  const base = `pkg:oci/${product.slug}`;
  return qualifier ? `${base}?repository_url=${encodeURIComponent(qualifier)}` : base;
}
