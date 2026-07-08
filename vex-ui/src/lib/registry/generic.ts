import { RegistryTag, RegistryError } from "./types";
import { listTagsV2, getManifestDigest } from "./oci-v2";

/** Catch-all OCI Distribution Spec v2 client for gcr/acr/generic product types. */
export async function listGenericTags(repository: string, registryUrl?: string | null): Promise<RegistryTag[]> {
  if (!registryUrl) {
    throw new RegistryError("not_configured", "Registry URL is required for this registry type");
  }

  const { tags, token: bearer } = await listTagsV2(registryUrl, repository);
  const recent = tags.slice(-25);

  const withDigests = await Promise.all(
    recent.map(async (tag) => ({
      tag,
      digest: await getManifestDigest(registryUrl, repository, tag, bearer).catch(() => null),
    }))
  );
  return withDigests.reverse();
}
