import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canEditProduct } from "@/lib/rbac";
import { headers } from "next/headers";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ImportWizard } from "@/components/statements/ImportWizard";
import { ImportOpenVexButton } from "@/components/statements/ImportOpenVexButton";

type Props = { params: Promise<{ productId: string }> };

export default async function ImportPage({ params }: Props) {
  const { productId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  if (!(await canEditProduct(session.user.id, productId))) notFound();

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) notFound();

  const existing = await db.statement.findMany({ where: { productId }, select: { vulnerabilityId: true } });

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Products", href: "/products" },
          { label: product.name, href: `/products/${productId}/statements` },
          { label: "Import Statements" },
        ]}
      />

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
