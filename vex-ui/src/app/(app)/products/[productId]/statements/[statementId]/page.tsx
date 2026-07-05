import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertCanViewProduct, canEditProduct, isAdmin } from "@/lib/rbac";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { extractPurls } from "@/lib/vex/openvex";
import { StatementDetailTabs } from "@/components/statements/StatementDetailTabs";

type Props = { params: Promise<{ productId: string; statementId: string }> };

export default async function StatementDetailPage({ params }: Props) {
  const { productId, statementId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  try {
    await assertCanViewProduct(session.user.id, productId);
  } catch {
    notFound();
  }

  const [product, statement] = await Promise.all([
    db.product.findUnique({ where: { id: productId } }),
    db.statement.findUnique({
      where: { id: statementId },
      include: {
        versions: { orderBy: { versionNum: "desc" } },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    }),
  ]);

  if (!product || !statement || statement.productId !== productId) notFound();

  // StatementVersion.changedById is a plain string column (no FK relation), so
  // resolve display names with a separate lookup.
  const changedByIds = [...new Set(statement.versions.map((v) => v.changedById))];
  const changedByUsers = await db.user.findMany({
    where: { id: { in: changedByIds } },
    select: { id: true, name: true },
  });
  const changedByName = Object.fromEntries(changedByUsers.map((u) => [u.id, u.name]));

  const [canEdit, adminUser] = await Promise.all([
    canEditProduct(session.user.id, productId),
    isAdmin(session.user.id),
  ]);

  const purls = extractPurls(statement.productsJson);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/products/${productId}/statements`} className="hover:text-foreground transition-colors">{product.name}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-mono">{statement.vulnerabilityId}</span>
      </div>

      <StatementDetailTabs
        productId={productId}
        statementId={statementId}
        vulnerabilityId={statement.vulnerabilityId}
        status={statement.status}
        workflowState={statement.workflowState}
        justification={statement.justification}
        statusNotes={statement.statusNotes}
        author={statement.author}
        docVersion={statement.docVersion}
        vexDocId={statement.vexDocId}
        rejectionNote={statement.rejectionNote}
        createdByName={statement.createdBy.name}
        approvedByName={statement.approvedBy?.name ?? null}
        purls={purls}
        versions={statement.versions}
        changedByName={changedByName}
        canEdit={canEdit}
        adminUser={adminUser}
        formInitial={{
          vulnerabilityId: statement.vulnerabilityId,
          status: statement.status,
          justification: statement.justification,
          statusNotes: statement.statusNotes,
          author: statement.author,
          purls,
        }}
      />
    </div>
  );
}
