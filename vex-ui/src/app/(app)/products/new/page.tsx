import { ProductForm } from "@/components/products/ProductForm";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">New Product</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Product</h1>
        <p className="text-muted-foreground">Register a container image to manage VEX statements for</p>
      </div>

      <ProductForm />
    </div>
  );
}
