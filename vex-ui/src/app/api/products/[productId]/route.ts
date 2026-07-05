import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanViewProduct, assertCanEditProduct } from "@/lib/rbac";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  ociPurl: z.string().min(1).optional(),
  dockerPurl: z.string().optional(),
  registryType: z.enum(["dockerhub", "ghcr", "ecr", "gcr", "acr", "generic"]).optional(),
  registryUrl: z.string().optional(),
  repository: z.string().min(1).optional(),
  currentTag: z.string().optional(),
  currentDigest: z.string().optional(),
});

type RouteContext = { params: Promise<{ productId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  try {
    await assertCanViewProduct(session.user.id, productId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      teams: { include: { team: true } },
      _count: { select: { statements: true, publications: true } },
    },
  });

  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  try {
    await assertCanEditProduct(session.user.id, productId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const product = await db.product.update({
    where: { id: productId },
    data: parsed.data,
    include: { teams: { include: { team: true } } },
  });

  return NextResponse.json(product);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  try {
    await assertCanEditProduct(session.user.id, productId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.product.delete({ where: { id: productId } });
  return NextResponse.json({ deleted: true });
}
