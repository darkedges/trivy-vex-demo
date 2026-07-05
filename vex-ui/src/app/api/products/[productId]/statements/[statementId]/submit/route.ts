import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanEditProduct } from "@/lib/rbac";
import { recordStatementVersion } from "@/lib/vex/statement";

type RouteContext = { params: Promise<{ productId: string; statementId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId, statementId } = await params;

  try {
    await assertCanEditProduct(session.user.id, productId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
}
