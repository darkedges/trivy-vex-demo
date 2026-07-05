import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertCanEditProduct } from "@/lib/rbac";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatementForm } from "@/components/statements/StatementForm";

type Props = { params: Promise<{ productId: string }> };

export default async function NewStatementPage({ params }: Props) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/products/${productId}/statements`} className="hover:text-foreground transition-colors">{product.name}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">New Statement</span>
      </div>

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
