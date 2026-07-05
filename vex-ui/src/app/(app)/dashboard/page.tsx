import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessibleProductIds } from "@/lib/rbac";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldCheck, Package, FileText, Upload } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const access = await getAccessibleProductIds(session.user.id);
  const productWhere = access === "all" ? {} : { id: { in: access } };
  const statementWhere = access === "all" ? {} : { productId: { in: access } };

  const [productCount, statementCount, publishedCount, pendingCount] = await Promise.all([
    db.product.count({ where: productWhere }),
    db.statement.count({ where: statementWhere }),
    db.statement.count({ where: { ...statementWhere, workflowState: "PUBLISHED" } }),
    db.statement.count({ where: { ...statementWhere, workflowState: "PENDING_APPROVAL" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          VEX statement management and vulnerability suppression workflow
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} label="Products" value={productCount} />
        <StatCard icon={FileText} label="Statements" value={statementCount} />
        <StatCard icon={ShieldCheck} label="Published" value={publishedCount} />
        <StatCard icon={Upload} label="Pending Approval" value={pendingCount} />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-2">Getting Started</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
          <li>Configure your GitHub org and signing workflow in Admin → Settings</li>
          <li>Sync your GitHub org teams in Admin → Teams</li>
          <li>Create a product and import findings from a Trivy scan</li>
          <li>Review, approve, sign, and publish VEX statements</li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-4">
      <div className="rounded-full bg-primary/10 p-2">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
