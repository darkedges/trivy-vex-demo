import type { Statement, Product, AppSettings } from "@prisma/client";
import { buildVexDocId } from "./openvex";

export function buildMergedDocument(
  product: Pick<Product, "slug">,
  statements: Statement[],
  settings: Pick<AppSettings, "vexDocBaseUrl"> | null
): { doc: Record<string, unknown>; json: string } {
  const author = statements[0]?.author ?? "vex-ui";

  const doc = {
    "@context": "https://openvex.dev/ns/v0.2.0",
    "@id": buildVexDocId(settings?.vexDocBaseUrl, product.slug, "consolidated"),
    author,
    version: 1,
    statements: statements.map((s) => ({
      vulnerability: { name: s.vulnerabilityId },
      products: JSON.parse(s.productsJson),
      status: s.status.toLowerCase(),
      ...(s.statusNotes ? { status_notes: s.statusNotes } : {}),
      ...(s.justification ? { justification: s.justification } : {}),
      timestamp: s.statementTimestamp.toISOString(),
    })),
    timestamp: new Date().toISOString(),
  };

  return { doc, json: JSON.stringify(doc, null, 2) };
}
