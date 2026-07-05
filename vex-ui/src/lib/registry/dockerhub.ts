import { RegistryTag, RegistryError } from "./types";

interface DockerHubTagResult {
  name: string;
  last_updated?: string;
  digest?: string | null;
  images?: Array<{ digest?: string | null }>;
}

interface DockerHubTagsResponse {
  results: DockerHubTagResult[];
}

export async function listDockerHubTags(repository: string): Promise<RegistryTag[]> {
  const url = `https://hub.docker.com/v2/repositories/${repository}/tags?page_size=25&ordering=last_updated`;
  const res = await fetch(url);

  if (res.status === 404) {
    throw new RegistryError("not_found", `Repository ${repository} not found on Docker Hub`);
  }
  if (!res.ok) {
    throw new RegistryError("upstream_error", `Docker Hub returned HTTP ${res.status} for ${repository}`);
  }

  const json = (await res.json()) as DockerHubTagsResponse;
  return json.results.map((r) => ({
    tag: r.name,
    digest: r.digest ?? r.images?.[0]?.digest ?? null,
    lastUpdated: r.last_updated,
  }));
}
