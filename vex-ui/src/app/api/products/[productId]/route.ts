import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProductView, withProductEdit } from "@/lib/api-auth";
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

type Params = { productId: string };

export const GET = withProductView<Params>(async (_request, { params: { productId } }) => {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      teams: { include: { team: true } },
      _count: { select: { statements: true, publications: true } },
    },
  });

  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
});

export const PUT = withProductEdit<Params>(async (request, { params: { productId } }) => {
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
});

export const DELETE = withProductEdit<Params>(async (_request, { params: { productId } }) => {
  await db.product.delete({ where: { id: productId } });
  return NextResponse.json({ deleted: true });
});
