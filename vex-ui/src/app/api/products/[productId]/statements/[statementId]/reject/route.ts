import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertIsAdmin } from "@/lib/rbac";
import { recordStatementVersion } from "@/lib/vex/statement";
import { z } from "zod";

const rejectSchema = z.object({ note: z.string().min(1, "A rejection note is required").max(1000) });

type RouteContext = { params: Promise<{ productId: string; statementId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId, statementId } = await params;

  try {
    await assertIsAdmin(session.user.id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
}
