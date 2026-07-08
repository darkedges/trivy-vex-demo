import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProductEdit } from "@/lib/api-auth";
import { recordStatementVersion } from "@/lib/vex/statement";

type Params = { productId: string; statementId: string };

export const POST = withProductEdit<Params>(async (_request, { session, params: { productId, statementId } }) => {
  const existing = await db.statement.findUnique({ where: { id: statementId } });
  if (!existing || existing.productId !== productId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.workflowState !== "DRAFT" && existing.workflowState !== "REJECTED") {
    return NextResponse.json(
      { error: `Cannot submit a statement in ${existing.workflowState} state` },
      { status: 409 }
    );
  }

  const versionNum = await recordStatementVersion(existing, session.user.id, "Submitted for approval");

  const statement = await db.statement.update({
    where: { id: statementId },
    data: { workflowState: "PENDING_APPROVAL", docVersion: versionNum, rejectionNote: null },
  });

  return NextResponse.json(statement);
});
