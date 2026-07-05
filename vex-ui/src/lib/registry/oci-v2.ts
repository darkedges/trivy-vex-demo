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

/**
 * Performs the OCI Distribution Spec v2 bearer-token challenge/response dance.
 * Returns null when the registry allows anonymous access (no challenge issued).
 */
export async function getBearerToken(
  host: string,
  repository: string,
  credentials?: { username: string; password: string }
): Promise<string | null> {
  const probe = await fetch(`https://${host}/v2/${repository}/tags/list`);
  if (probe.status !== 401) return null;

  const authHeader = probe.headers.get("www-authenticate");
  if (!authHeader) {
    throw new RegistryError("upstream_error", `${host} returned 401 without a WWW-Authenticate challenge`);
  }

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
    throw new RegistryError("not_configured", `Failed to obtain a registry token from ${host} (HTTP ${tokenRes.status})`);
  }
  const json = await tokenRes.json();
  const token = json.token ?? json.access_token;
  if (!token) {
    throw new RegistryError("upstream_error", `${host} token response is missing a token field`);
  }
  return token;
}

export async function listTagsV2(host: string, repository: string, token: string | null): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://${host}/v2/${repository}/tags/list`, { headers });
  if (res.status === 404) {
    throw new RegistryError("not_found", `Repository ${repository} not found on ${host}`);
  }
  if (!res.ok) {
    throw new RegistryError("upstream_error", `${host} returned HTTP ${res.status} listing tags for ${repository}`);
  }
  const json = await res.json();
  return json.tags ?? [];
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
