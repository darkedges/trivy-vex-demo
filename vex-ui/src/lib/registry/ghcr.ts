import { RegistryTag, RegistryError } from "./types";
import { getBearerToken, listTagsV2, getManifestDigest } from "./oci-v2";

export async function listGhcrTags(repository: string, registryUrl?: string | null): Promise<RegistryTag[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new RegistryError("not_configured", "GHCR requires GITHUB_TOKEN to be set in the environment");
  }

  const host = registryUrl || "ghcr.io";
  const bearer = await getBearerToken(host, repository, { username: "token", password: token });
  const allTags = await listTagsV2(host, repository, bearer);
  const recent = allTags.slice(-25);

  const withDigests = await Promise.all(
    recent.map(async (tag) => ({
      tag,
      digest: await getManifestDigest(host, repository, tag, bearer).catch(() => null),
    }))
  );
  return withDigests.reverse();
}
