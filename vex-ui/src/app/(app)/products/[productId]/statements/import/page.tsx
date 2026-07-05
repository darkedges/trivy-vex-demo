import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertCanEditProduct } from "@/lib/rbac";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ImportWizard } from "@/components/statements/ImportWizard";
import { ImportOpenVexButton } from "@/components/statements/ImportOpenVexButton";

type Props = { params: Promise<{ productId: string }> };

export default async function ImportPage({ params }: Props) {
  const { productId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  try {
    await assertCanEditProduct(session.user.id, productId);
  } catch {
    notFound();
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) notFound();

  const existing = await db.statement.findMany({ where: { productId }, select: { vulnerabilityId: true } });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/products/${productId}/statements`} className="hover:text-foreground transition-colors">{product.name}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Import Statements</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Statements</h1>
        <p className="text-muted-foreground">
          Bring in VEX statements from an existing OpenVEX document or a Trivy scan
        </p>
      </div>

      <ImportOpenVexButton productId={productId} />

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Import Trivy Scan</h2>
        <p className="text-muted-foreground text-sm">
          Or upload a Trivy JSON report to create draft VEX statements for detected CVEs
        </p>
      </div>

      <ImportWizard productId={productId} existingVulnIds={existing.map((s) => s.vulnerabilityId)} />
    </div>
  );
}
