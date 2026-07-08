import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canEditProduct } from "@/lib/rbac";
import { headers } from "next/headers";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatementForm } from "@/components/statements/StatementForm";

type Props = { params: Promise<{ productId: string }> };

export default async function NewStatementPage({ params }: Props) {
  const { productId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  if (!(await canEditProduct(session.user.id, productId))) notFound();

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Products", href: "/products" },
          { label: product.name, href: `/products/${productId}/statements` },
          { label: "New Statement" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">New VEX Statement</h1>
        <p className="text-muted-foreground">Create a VEX statement for a vulnerability in {product.name}</p>
      </div>

      <StatementForm
        productId={productId}
        mode="create"
        defaultAuthor={`${session.user.name} <${session.user.email}>`}
      />
    </div>
  );
}
