import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewProduct } from "@/lib/rbac";
import { listRegistryTags, RegistryError } from "@/lib/registry";

type RouteContext = { params: Promise<{ productId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  if (!(await canViewProduct(session.user.id, productId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const tags = await listRegistryTags(product);
    return NextResponse.json({ tags });
  } catch (err) {
    if (err instanceof RegistryError) {
      const status = err.code === "not_found" ? 404 : err.code === "not_configured" ? 400 : 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to list registry tags";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
