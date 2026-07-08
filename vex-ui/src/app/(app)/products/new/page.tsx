import { ProductForm } from "@/components/products/ProductForm";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Products", href: "/products" }, { label: "New Product" }]} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Product</h1>
        <p className="text-muted-foreground">Register a container image to manage VEX statements for</p>
      </div>

      <ProductForm />
    </div>
  );
}
