import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanEditProduct } from "@/lib/rbac";
import { recordStatementVersion } from "@/lib/vex/statement";

type RouteContext = { params: Promise<{ productId: string; statementId: string }> };

/**
 * Re-opens a PUBLISHED statement as a DRAFT so it can be corrected and
 * re-approved — the core VEX scenario of a prior assessment turning out
 * wrong. The already-published document is untouched until the revised
 * statement goes back through approve + publish.
 */
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
}
