import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertCanViewProduct, canEditProduct } from "@/lib/rbac";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronRight, FileCheck2 } from "lucide-react";
import { format } from "date-fns";
import { publicationStateColors } from "@/lib/vex/badges";
import {
  CreatePublicationButton,
  PublishToPagesButton,
  CancelPublicationButton,
} from "@/components/publications/PublicationActions";
import { PublicationPoller } from "@/components/publications/PublicationPoller";

type Props = { params: Promise<{ productId: string }> };

export default async function PublishPage({ params }: Props) {
  const { productId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  try {
    await assertCanViewProduct(session.user.id, productId);
  } catch {
    notFound();
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) notFound();

  const canEdit = await canEditProduct(session.user.id, productId);

  const inFlightStatementIds = (
    await db.publicationStatement.findMany({
      where: {
        publication: {
          productId,
          state: { in: ["PENDING_SIGNING", "SIGNING_IN_PROGRESS", "SIGNED", "PUBLISHING"] },
        },
      },
      select: { statementId: true },
    })
  ).map((ps) => ps.statementId);

  const eligibleCount = await db.statement.count({
    where: { productId, workflowState: "APPROVED", id: { notIn: inFlightStatementIds } },
  });

  const publications = await db.publication.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { statements: true } } },
  });

  const hasInFlight = publications.some((p) =>
    ["PENDING_SIGNING", "SIGNING_IN_PROGRESS", "PUBLISHING"].includes(p.state)
  );

  return (
    <div className="space-y-6">
      <PublicationPoller active={hasInFlight} />

      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/products/${productId}`} className="hover:text-foreground transition-colors">{product.name}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Publish</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Publish VEX Statements</h1>
        <p className="text-muted-foreground">Sign and publish approved statements for {product.name}</p>
      </div>

      <div className="rounded-lg border bg-card p-4 flex items-center justify-between gap-4">
        <p className="text-sm">
          <strong>{eligibleCount}</strong> approved statement{eligibleCount !== 1 ? "s" : ""} ready to publish
        </p>
        {canEdit && <CreatePublicationButton productId={productId} disabled={eligibleCount === 0} />}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Publication History</h2>

        {publications.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center">
            <FileCheck2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No publications yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {publications.map((p) => (
              <div key={p.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${publicationStateColors[p.state] ?? ""}`}>
                        {p.state.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p._count.statements} statement{p._count.statements !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {format(new Date(p.createdAt), "MMM d, yyyy, h:mm a")}
                    </p>
                    {p.lastError && <p className="text-xs text-destructive">{p.lastError}</p>}
                    {p.workflowRunUrl && (
                      <a
                        href={p.workflowRunUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline block"
                      >
                        View workflow run
                      </a>
                    )}
                    {p.ghPagesCommitSha && (
                      <p className="text-xs text-muted-foreground font-mono">
                        Commit {p.ghPagesCommitSha.slice(0, 12)}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex flex-col gap-2 items-end">
                      {p.state === "SIGNED" && <PublishToPagesButton productId={productId} publicationId={p.id} />}
                      {p.state === "PUBLISH_FAILED" && (
                        <PublishToPagesButton productId={productId} publicationId={p.id} label="Retry publish" />
                      )}
                      {p.state === "PUBLISHED" && (
                        <PublishToPagesButton productId={productId} publicationId={p.id} label="Re-publish" />
                      )}
                      {["PENDING_SIGNING", "SIGNING_IN_PROGRESS", "PUBLISHING"].includes(p.state) && (
                        <CancelPublicationButton productId={productId} publicationId={p.id} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
