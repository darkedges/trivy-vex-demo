import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessibleProductIds } from "@/lib/rbac";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Package } from "lucide-react";
import { ProductCard } from "@/components/products/ProductCard";

export default async function ProductsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const access = await getAccessibleProductIds(session.user.id);
  const products = await db.product.findMany({
    where: access === "all" ? {} : { id: { in: access } },
    include: {
      teams: { include: { team: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { statements: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            {products.length} product{products.length !== 1 ? "s" : ""} — container images with VEX statements
          </p>
        </div>
        <Link
          href="/products/new"
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No products yet.</p>
          <Link href="/products/new" className="text-sm text-primary hover:underline">
            Create your first product
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
