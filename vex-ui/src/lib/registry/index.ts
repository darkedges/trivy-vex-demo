import type { Product } from "@prisma/client";
import { RegistryTag, RegistryError } from "./types";
import { listDockerHubTags } from "./dockerhub";
import { listGhcrTags } from "./ghcr";
import { listEcrTags } from "./ecr";
import { listGenericTags } from "./generic";

export type { RegistryTag };
export { RegistryError };

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
