import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canViewProduct } from "@/lib/rbac";
import { headers } from "next/headers";
import Link from "next/link";
import { Plus, Upload, FileText } from "lucide-react";
import { statusColors, workflowColors } from "@/lib/vex/badges";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { format } from "date-fns";

type Props = { params: Promise<{ productId: string }> };

export default async function StatementsPage({ params }: Props) {
  const { productId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  if (!(await canViewProduct(session.user.id, productId))) notFound();

  const [product, statements] = await Promise.all([
    db.product.findUnique({ where: { id: productId } }),
    db.statement.findMany({
      where: { productId },
      orderBy: [{ workflowState: "asc" }, { vulnerabilityId: "asc" }],
    }),
  ]);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Products", href: "/products" },
          { label: product.name, href: `/products/${productId}` },
          { label: "Statements" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">VEX Statements</h1>
          <p className="text-muted-foreground">{statements.length} statement{statements.length !== 1 ? "s" : ""} for {product.name}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/products/${productId}/statements/import`}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            <Upload className="h-4 w-4" />
            Import Scan
          </Link>
          <Link
            href={`/products/${productId}/statements/new`}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Statement
          </Link>
        </div>
      </div>

      {statements.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No statements yet.</p>
          <Link
            href={`/products/${productId}/statements/import`}
            className="text-sm text-primary hover:underline"
          >
            Import from a Trivy scan to get started
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Vulnerability</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Workflow</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {statements.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/products/${productId}/statements/${s.id}`}
                      className="font-mono text-xs font-medium text-primary hover:underline"
                    >
                      {s.vulnerabilityId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge value={s.status} colors={statusColors} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge value={s.workflowState} colors={workflowColors} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {format(new Date(s.updatedAt), "MMM d, yyyy")}
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
