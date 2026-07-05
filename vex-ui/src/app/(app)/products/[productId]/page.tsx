import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertCanViewProduct } from "@/lib/rbac";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronRight, FileText, Upload, Package, Send } from "lucide-react";

type Props = { params: Promise<{ productId: string }> };

export default async function ProductPage({ params }: Props) {
  const { productId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  try {
    await assertCanViewProduct(session.user.id, productId);
  } catch {
    notFound();
  }

  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      teams: { include: { team: true } },
      _count: { select: { statements: true, publications: true } },
    },
  });

  if (!product) notFound();

  const statsByState = await db.statement.groupBy({
    by: ["workflowState"],
    where: { productId },
    _count: true,
  });

  const stateMap = Object.fromEntries(statsByState.map((s) => [s.workflowState, s._count]));
  const hasApprovedStatements = (stateMap["APPROVED"] ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{product.name}</span>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
            {product.description && (
              <p className="text-muted-foreground">{product.description}</p>
            )}
          </div>
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
            href={`/products/${productId}/statements`}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Statements
          </Link>
          {hasApprovedStatements ? (
            <Link
              href={`/products/${productId}/publish`}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <Send className="h-4 w-4" />
              Publish
            </Link>
          ) : (
            <span
              title="No approved statements to publish yet"
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
              Publish
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm">Image</h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="Registry" value={product.registryType.toUpperCase()} />
            <Row label="Repository" value={product.repository} mono />
            {product.currentTag && <Row label="Tag" value={product.currentTag} mono />}
            {product.currentDigest && (
              <Row label="Digest" value={`${product.currentDigest.slice(0, 19)}…`} mono />
            )}
          </dl>
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm">VEX Statements</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { label: "Draft", key: "DRAFT" },
              { label: "Pending", key: "PENDING_APPROVAL" },
              { label: "Approved", key: "APPROVED" },
              { label: "Published", key: "PUBLISHED" },
            ].map((s) => (
              <div key={s.key} className="rounded border p-2 text-center">
                <div className="text-2xl font-bold">{stateMap[s.key] ?? 0}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">PURLs</h3>
        <dl className="space-y-1.5 text-sm">
          <Row label="OCI (Trivy / Wiz)" value={product.ociPurl} mono />
          {product.dockerPurl && <Row label="Docker (Scout)" value={product.dockerPurl} mono />}
        </dl>
      </div>

      {product.teams.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="font-semibold text-sm">Owning Teams</h3>
          <div className="flex flex-wrap gap-2">
            {product.teams.map((pt) => (
              <span key={pt.team.id} className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded">
                {pt.team.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground w-28 flex-shrink-0">{label}</dt>
      <dd className={`truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
