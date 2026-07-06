import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanEditProduct } from "@/lib/rbac";
import { buildVexDocId, buildProductsJson } from "@/lib/vex/openvex";
import { getResolvedSettings } from "@/lib/settings";
import { z } from "zod";

const importSchema = z.object({
  items: z
    .array(
      z.object({
        vulnerabilityId: z.string().min(1).max(100),
        purls: z.array(z.string().min(1)).default([]),
      })
    )
    .min(1),
});

const IMPORT_STATUS_NOTES = "Imported from a Trivy scan — under investigation; not yet assessed.";

type RouteContext = { params: Promise<{ productId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  try {
    await assertCanEditProduct(session.user.id, productId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await getResolvedSettings();

  const existing = await db.statement.findMany({ where: { productId }, select: { vulnerabilityId: true } });
  const existingIds = new Set(existing.map((s) => s.vulnerabilityId));

  const author = `${session.user.name} <${session.user.email}>`;

  let created = 0;
  let skipped = 0;

  // Sequential creates: Prisma's createMany({ skipDuplicates }) is not supported on
  // SQLite, and concurrent writes risk "database is locked" against the single file.
  for (const item of parsed.data.items) {
    if (existingIds.has(item.vulnerabilityId)) {
      skipped++;
      continue;
    }
    await db.statement.create({
      data: {
        productId,
        vexDocId: buildVexDocId(settings.vexDocBaseUrl, product.slug, item.vulnerabilityId),
        vulnerabilityId: item.vulnerabilityId,
        // Honest default for an unreviewed finding: an analyst must
        // deliberately assert not_affected + a justification via the editor
        // before this can be published as a suppression.
        status: "UNDER_INVESTIGATION",
        justification: null,
        statusNotes: IMPORT_STATUS_NOTES,
        productsJson: buildProductsJson(product.ociPurl, item.purls),
        author,
        createdById: session.user.id,
      },
    });
    existingIds.add(item.vulnerabilityId);
    created++;
  }

  return NextResponse.json({ created, skipped });
}
