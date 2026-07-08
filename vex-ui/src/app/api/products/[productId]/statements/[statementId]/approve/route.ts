import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/rbac";
import { recordStatementVersion } from "@/lib/vex/statement";

type RouteContext = { params: Promise<{ productId: string; statementId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId, statementId } = await params;

  if (!(await isAdmin(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
}
