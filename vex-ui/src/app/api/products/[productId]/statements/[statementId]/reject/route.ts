import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-auth";
import { recordStatementVersion } from "@/lib/vex/statement";
import { z } from "zod";

const rejectSchema = z.object({ note: z.string().min(1, "A rejection note is required").max(1000) });

type Params = { productId: string; statementId: string };

export const POST = withAdmin<Params>(async (request, { session, params: { productId, statementId } }) => {
  const body = await request.json();
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.statement.findUnique({ where: { id: statementId } });
  if (!existing || existing.productId !== productId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.workflowState !== "PENDING_APPROVAL") {
    return NextResponse.json(
      { error: `Cannot reject a statement in ${existing.workflowState} state` },
      { status: 409 }
    );
  }

  const versionNum = await recordStatementVersion(existing, session.user.id, `Rejected: ${parsed.data.note}`);

  const statement = await db.statement.update({
    where: { id: statementId },
    data: { workflowState: "REJECTED", docVersion: versionNum, rejectionNote: parsed.data.note },
  });

  return NextResponse.json(statement);
});
