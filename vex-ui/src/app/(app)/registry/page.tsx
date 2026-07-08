import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessibleProductIds, getEditableProductIds } from "@/lib/rbac";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Container } from "lucide-react";
import { RegistryBrowser } from "@/components/registry/RegistryBrowser";

export default async function RegistryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [access, editable] = await Promise.all([
    getAccessibleProductIds(session.user.id),
    getEditableProductIds(session.user.id),
  ]);
  const products = await db.product.findMany({
    where: access === "all" ? {} : { id: { in: access } },
    select: { id: true, name: true, repository: true, registryType: true, currentTag: true },
    orderBy: { name: "asc" },
  });

  const entries = products.map((p) => ({
    ...p,
    canEdit: editable === "all" || editable.has(p.id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registry Browser</h1>
        <p className="text-muted-foreground">Browse container image tags across registries</p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Container className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No products to browse yet.</p>
        </div>
      ) : (
        <RegistryBrowser products={entries} />
      )}
    </div>
  );
}
