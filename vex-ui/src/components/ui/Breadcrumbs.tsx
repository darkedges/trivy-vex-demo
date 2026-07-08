import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
  mono?: boolean;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {item.href ? (
            <Link href={item.href} className={`hover:text-foreground transition-colors ${item.mono ? "font-mono" : ""}`}>
              {item.label}
            </Link>
          ) : (
            <span className={`text-foreground ${item.mono ? "font-mono" : ""}`}>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
