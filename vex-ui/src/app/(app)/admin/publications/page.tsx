import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/rbac";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Upload } from "lucide-react";
import { workflowColors, statusColors } from "@/lib/vex/badges";
import { StatementActions } from "@/components/statements/StatementActions";

export default async function AdminPublicationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const admin = await isAdmin(session.user.id);
  if (!admin) redirect("/dashboard");

  const statements = await db.statement.findMany({
    where: { workflowState: "PENDING_APPROVAL" },
    include: { product: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pending Approvals</h1>
        <p className="text-muted-foreground">Review and approve VEX statements before publication</p>
      </div>

      {statements.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No pending approvals.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {statements.map((s) => (
            <div key={s.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Link
                    href={`/products/${s.productId}/statements/${s.id}`}
                    className="font-mono text-sm font-medium text-primary hover:underline"
                  >
                    {s.vulnerabilityId}
                  </Link>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">{s.product.name}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${statusColors[s.status] ?? ""}`}>
                      {s.status.replace(/_/g, " ")}
                    </span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${workflowColors[s.workflowState] ?? ""}`}>
                      {s.workflowState.replace(/_/g, " ")}
                    </span>
                  </div>
                  {s.statusNotes && <p className="text-xs text-muted-foreground line-clamp-2">{s.statusNotes}</p>}
                </div>
              </div>
              <StatementActions
                productId={s.productId}
                statementId={s.id}
                workflowState={s.workflowState}
                canEdit={false}
                isAdminUser={admin}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
