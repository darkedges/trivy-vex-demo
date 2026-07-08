import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProductView } from "@/lib/api-auth";
import { listRegistryTags, RegistryError } from "@/lib/registry";

export const GET = withProductView<{ productId: string }>(async (_request, { params: { productId } }) => {
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
});
