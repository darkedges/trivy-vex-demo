import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-auth";
import { recordStatementVersion } from "@/lib/vex/statement";

type Params = { productId: string; statementId: string };

export const POST = withAdmin<Params>(async (_request, { session, params: { productId, statementId } }) => {
  const existing = await db.statement.findUnique({ where: { id: statementId } });
  if (!existing || existing.productId !== productId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.workflowState !== "PENDING_APPROVAL") {
    return NextResponse.json(
      { error: `Cannot approve a statement in ${existing.workflowState} state` },
      { status: 409 }
    );
  }

  const versionNum = await recordStatementVersion(existing, session.user.id, "Approved");

  const statement = await db.statement.update({
    where: { id: statementId },
    data: {
      workflowState: "APPROVED",
      docVersion: versionNum,
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  return NextResponse.json(statement);
});
