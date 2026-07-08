import { db } from "@/lib/db";
import type { PublicationState } from "@prisma/client";

// A publication in any of these states still "owns" its statements — they must
// not be pulled into a second, overlapping publication.
export const IN_FLIGHT_PUBLICATION_STATES: PublicationState[] = [
  "PENDING_SIGNING",
  "SIGNING_IN_PROGRESS",
  "SIGNED",
  "PUBLISHING",
];

/** Statement IDs already tied up in a non-terminal publication for this product. */
export async function getInFlightStatementIds(productId: string): Promise<string[]> {
  const rows = await db.publicationStatement.findMany({
    where: { publication: { productId, state: { in: IN_FLIGHT_PUBLICATION_STATES } } },
    select: { statementId: true },
  });
  return rows.map((r) => r.statementId);
}
