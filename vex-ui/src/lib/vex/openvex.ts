// Pure OpenVEX helpers — no server-only imports, safe to use from client components.

// OpenVEX's fixed justification vocabulary (only valid alongside status=not_affected).
export const JUSTIFICATIONS = [
  "component_not_present",
  "vulnerable_code_not_present",
  "vulnerable_code_not_in_execute_path",
  "vulnerable_code_cannot_be_controlled_by_adversary",
  "inline_mitigations_already_exist",
] as const;

export type Justification = (typeof JUSTIFICATIONS)[number];

export function buildVexDocId(vexDocBaseUrl: string | null | undefined, productSlug: string, vulnerabilityId: string) {
  const base = (vexDocBaseUrl || "https://darkedges.com/vex").replace(/\/$/, "");
  return `${base}/${productSlug}/${vulnerabilityId}`;
}

export function buildProductsJson(ociPurl: string, purls: string[]): string {
  return JSON.stringify([
    {
      "@id": ociPurl,
      subcomponents: purls.map((p) => ({ "@id": p })),
    },
  ]);
}

/** Extracts the subcomponent PURLs previously stored on a statement's productsJson. */
export function extractPurls(productsJson: string): string[] {
  try {
    const parsed = JSON.parse(productsJson);
    return (parsed?.[0]?.subcomponents ?? []).map((s: { "@id": string }) => s["@id"]);
  } catch {
    return [];
  }
}
