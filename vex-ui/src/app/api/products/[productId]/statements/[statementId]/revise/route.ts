import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProductEdit } from "@/lib/api-auth";
import { recordStatementVersion } from "@/lib/vex/statement";

type Params = { productId: string; statementId: string };

/**
 * Re-opens a PUBLISHED statement as a DRAFT so it can be corrected and
 * re-approved — the core VEX scenario of a prior assessment turning out
 * wrong. The already-published document is untouched until the revised
 * statement goes back through approve + publish.
 */
export const POST = withProductEdit<Params>(async (_request, { session, params: { productId, statementId } }) => {
  const existing = await db.statement.findUnique({ where: { id: statementId } });
  if (!existing || existing.productId !== productId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.workflowState !== "PUBLISHED") {
    return NextResponse.json(
      { error: `Only published statements can be revised (this one is ${existing.workflowState})` },
      { status: 409 }
    );
  }

  const versionNum = await recordStatementVersion(existing, session.user.id, "Revised after publication");

  const statement = await db.statement.update({
    where: { id: statementId },
    data: {
      workflowState: "DRAFT",
      docVersion: versionNum,
      approvedById: null,
      approvedAt: null,
    },
  });

  return NextResponse.json(statement);
});
