import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanEditProduct } from "@/lib/rbac";
import { buildVexDocId, buildProductsJson, JUSTIFICATIONS } from "@/lib/vex/openvex";
import { z } from "zod";

const createSchema = z
  .object({
    vulnerabilityId: z.string().min(1).max(100),
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await db.statement.findUnique({
    where: { productId_vulnerabilityId: { productId, vulnerabilityId: parsed.data.vulnerabilityId } },
  });
  if (existing) {
    return NextResponse.json({ error: "A statement for this vulnerability already exists" }, { status: 409 });
  }

  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });

  const statement = await db.statement.create({
    data: {
      productId,
      vexDocId: buildVexDocId(settings?.vexDocBaseUrl, product.slug, parsed.data.vulnerabilityId),
      vulnerabilityId: parsed.data.vulnerabilityId,
      status: parsed.data.status,
      justification: parsed.data.justification ?? null,
      statusNotes: parsed.data.statusNotes ?? null,
      productsJson: buildProductsJson(product.ociPurl, parsed.data.purls),
      author: parsed.data.author,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(statement, { status: 201 });
}
