import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessibleProductIds } from "@/lib/rbac";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  ociPurl: z.string().min(1),
  dockerPurl: z.string().optional(),
  registryType: z.enum(["dockerhub", "ghcr", "ecr", "gcr", "acr", "generic"]),
  registryUrl: z.string().optional(),
  repository: z.string().min(1),
  currentTag: z.string().optional(),
  currentDigest: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAccessibleProductIds(session.user.id);

  const products = await db.product.findMany({
    where: access === "all" ? {} : { id: { in: access } },
    include: {
      teams: { include: { team: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { statements: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { teamIds, ...data } = parsed.data;

  const existing = await db.product.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
  }

  const product = await db.product.create({
    data: {
      ...data,
      vexRepoPath: `pkg/oci/${data.slug}/vex.json`,
      teams: teamIds?.length
        ? { create: teamIds.map((teamId) => ({ teamId })) }
        : undefined,
    },
    include: {
      teams: { include: { team: { select: { id: true, name: true, slug: true } } } },
    },
  });

  return NextResponse.json(product, { status: 201 });
}
