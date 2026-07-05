import { db } from "@/lib/db";
import type { Statement } from "@prisma/client";

/**
 * Snapshots a statement's current (pre-change) state as a StatementVersion row
 * and returns the version number the caller should write as the new docVersion.
 */
export async function recordStatementVersion(
  statement: Statement,
  changedById: string,
  changeNote: string
): Promise<number> {
  const versionNum = statement.docVersion + 1;
  await db.statementVersion.create({
    data: {
      statementId: statement.id,
      versionNum,
      snapshot: JSON.stringify(statement),
      changedById,
      changeNote,
    },
  });
  return versionNum;
}
