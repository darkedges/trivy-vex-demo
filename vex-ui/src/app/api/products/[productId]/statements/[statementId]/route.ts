import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProductEdit } from "@/lib/api-auth";
import { recordStatementVersion } from "@/lib/vex/statement";
import { buildProductsJson, JUSTIFICATIONS } from "@/lib/vex/openvex";
import { z } from "zod";

const updateSchema = z
  .object({
    status: z.enum(["NOT_AFFECTED", "AFFECTED", "FIXED", "UNDER_INVESTIGATION"]),
    justification: z.enum(JUSTIFICATIONS).optional(),
    statusNotes: z.string().max(2000).optional(),
    author: z.string().min(1).max(200),
    purls: z.array(z.string().min(1)).default([]),
  })
  .refine((data) => data.status !== "NOT_AFFECTED" || !!data.justification, {
    message: "Justification is required when status is not_affected",
    path: ["justification"],
  })
  .refine((data) => data.status === "NOT_AFFECTED" || !data.justification, {
    message: "Justification only applies when status is not_affected",
    path: ["justification"],
  });

type Params = { productId: string; statementId: string };

export const PUT = withProductEdit<Params>(async (request, { session, params: { productId, statementId } }) => {
  const existing = await db.statement.findUnique({ where: { id: statementId } });
  if (!existing || existing.productId !== productId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.workflowState === "PUBLISHED") {
    return NextResponse.json({ error: "Cannot edit a published statement" }, { status: 409 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versionNum = await recordStatementVersion(existing, session.user.id, "Edited");

  // Editing anything other than a DRAFT resets it back to DRAFT — an edit
  // invalidates any prior rejection or approval, so it must go through
  // submit/approve again before it counts as approved.
  const statement = await db.statement.update({
    where: { id: statementId },
    data: {
      status: parsed.data.status,
      justification: parsed.data.justification ?? null,
      statusNotes: parsed.data.statusNotes ?? null,
      author: parsed.data.author,
      productsJson: buildProductsJson(product.ociPurl, parsed.data.purls),
      docVersion: versionNum,
      workflowState: "DRAFT",
      rejectionNote: null,
      approvedById: null,
      approvedAt: null,
    },
  });

  return NextResponse.json(statement);
});
