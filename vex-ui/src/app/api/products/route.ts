import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccessibleProductIds, isAdmin } from "@/lib/rbac";
import { withSession } from "@/lib/api-auth";
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

export const GET = withSession(async (_request, { session }) => {
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
});

export const POST = withSession(async (request, { session }) => {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { teamIds, ...data } = parsed.data;

  // Admins can create anything; otherwise the caller must be a MAINTAINER of
  // every team the product is being attached to (and must attach at least
  // one, or the product would be visible only to admins).
  if (!(await isAdmin(session.user.id))) {
    if (!teamIds?.length) {
      return NextResponse.json(
        { error: "Non-admin users must assign the product to at least one of their teams" },
        { status: 403 }
      );
    }
    const maintainerOf = await db.teamMember.findMany({
      where: { userId: session.user.id, role: "MAINTAINER", teamId: { in: teamIds } },
      select: { teamId: true },
    });
    if (maintainerOf.length !== new Set(teamIds).size) {
      return NextResponse.json(
        { error: "You must be a maintainer of every team you assign this product to" },
        { status: 403 }
      );
    }
  }

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
});
