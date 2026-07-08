import { RegistryError } from "./types";

function parseWwwAuthenticate(header: string): { realm: string; service?: string; scope?: string } {
  const params: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header))) {
    params[m[1]] = m[2];
  }
  if (!params.realm) {
    throw new RegistryError("upstream_error", "Unexpected WWW-Authenticate header from registry");
  }
  return { realm: params.realm, service: params.service, scope: params.scope };
}

async function exchangeChallengeForToken(
  authHeader: string,
  credentials?: { username: string; password: string }
): Promise<string> {
  const { realm, service, scope } = parseWwwAuthenticate(authHeader);
  const tokenUrl = new URL(realm);
  if (service) tokenUrl.searchParams.set("service", service);
  if (scope) tokenUrl.searchParams.set("scope", scope);

  const headers: Record<string, string> = {};
  if (credentials) {
    headers.Authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
  }

  const tokenRes = await fetch(tokenUrl, { headers });
  if (!tokenRes.ok) {
    throw new RegistryError("not_configured", `Failed to obtain a registry token from the token service (HTTP ${tokenRes.status})`);
  }
  const json = await tokenRes.json();
  const token = json.token ?? json.access_token;
  if (!token) {
    throw new RegistryError("upstream_error", "Registry token response is missing a token field");
  }
  return token;
}

/**
 * Lists tags via the OCI Distribution Spec v2 API, handling the bearer-token
 * challenge inline: an anonymous registry is read in ONE request, and an
 * authenticated one costs the 401 challenge + a single authed re-fetch (no
 * throwaway probe of the full tag list). The resolved token is returned so
 * callers can reuse it for manifest-digest lookups.
 */
export async function listTagsV2(
  host: string,
  repository: string,
  credentials?: { username: string; password: string }
): Promise<{ tags: string[]; token: string | null }> {
  const url = `https://${host}/v2/${repository}/tags/list`;
  let res = await fetch(url);
  let token: string | null = null;

  if (res.status === 401) {
    const authHeader = res.headers.get("www-authenticate");
    if (!authHeader) {
      throw new RegistryError("upstream_error", `${host} returned 401 without a WWW-Authenticate challenge`);
    }
    token = await exchangeChallengeForToken(authHeader, credentials);
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  if (res.status === 404) {
    throw new RegistryError("not_found", `Repository ${repository} not found on ${host}`);
  }
  if (!res.ok) {
    throw new RegistryError("upstream_error", `${host} returned HTTP ${res.status} listing tags for ${repository}`);
  }
  const json = await res.json();
  return { tags: json.tags ?? [], token };
}

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

export async function getManifestDigest(
  host: string,
  repository: string,
  tag: string,
  token: string | null
): Promise<string | null> {
  const headers: Record<string, string> = { Accept: MANIFEST_ACCEPT };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://${host}/v2/${repository}/manifests/${tag}`, { method: "HEAD", headers });
  if (!res.ok) return null;
  return res.headers.get("docker-content-digest");
}
