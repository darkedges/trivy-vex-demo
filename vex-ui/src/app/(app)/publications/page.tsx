import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessibleProductIds } from "@/lib/rbac";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { format } from "date-fns";
import { publicationStateColors } from "@/lib/vex/badges";
import { PublicationPoller } from "@/components/publications/PublicationPoller";

export default async function PublicationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const access = await getAccessibleProductIds(session.user.id);
  const publications = await db.publication.findMany({
    where: access === "all" ? {} : { productId: { in: access } },
    include: { product: { select: { id: true, name: true } }, _count: { select: { statements: true } } },
    orderBy: { createdAt: "desc" },
  });

  const hasInFlight = publications.some((p) =>
    ["PENDING_SIGNING", "SIGNING_IN_PROGRESS", "PUBLISHING"].includes(p.state)
  );

  return (
    <div className="space-y-6">
      <PublicationPoller active={hasInFlight} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Publications</h1>
        <p className="text-muted-foreground">History of signed and published VEX documents</p>
      </div>

      {publications.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No publications yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">State</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Statements</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {publications.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/products/${p.productId}/publish`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${publicationStateColors[p.state] ?? ""}`}>
                      {p.state.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p._count.statements}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {format(new Date(p.createdAt), "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
