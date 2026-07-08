import type { Product } from "@prisma/client";
import { RegistryTag, RegistryError } from "./types";
import { listDockerHubTags } from "./dockerhub";
import { listGhcrTags } from "./ghcr";
import { listEcrTags } from "./ecr";
import { listGenericTags } from "./generic";

export type { RegistryTag };
export { RegistryError };

type ProductRegistryFields = Pick<Product, "registryType" | "registryUrl" | "repository">;

/**
 * The canonical `<host>/<repository>` for a product — the single owner of
 * registry-type → host knowledge (Trivy's --vex repo lookup keys pkg:oci purls
 * on this via the repository_url qualifier). Returns undefined when the host
 * can't be determined (generic registry with no registryUrl set).
 */
export function canonicalRepositoryUrl(product: ProductRegistryFields): string | undefined {
  switch (product.registryType) {
    case "dockerhub":
      return `index.docker.io/${product.repository}`;
    case "ghcr":
      return `${product.registryUrl || "ghcr.io"}/${product.repository}`;
    default:
      return product.registryUrl ? `${product.registryUrl}/${product.repository}` : undefined;
  }
}

export async function listRegistryTags(
  product: Pick<Product, "registryType" | "registryUrl" | "repository">
): Promise<RegistryTag[]> {
  switch (product.registryType) {
    case "dockerhub":
      return listDockerHubTags(product.repository);
    case "ghcr":
      return listGhcrTags(product.repository, product.registryUrl);
    case "ecr":
      return listEcrTags(product.repository);
    case "gcr":
    case "acr":
    case "generic":
      return listGenericTags(product.repository, product.registryUrl);
    default:
      throw new RegistryError("not_configured", `Unsupported registry type: ${product.registryType}`);
  }
}
