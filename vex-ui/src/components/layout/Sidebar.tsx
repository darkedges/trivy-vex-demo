"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  BookOpen,
  Upload,
  Shield,
  Settings,
  Users,
  Container,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/registry", label: "Registry", icon: Container },
  { href: "/publications", label: "Publications", icon: BookOpen },
];

const adminItems = [
  { href: "/admin", label: "Overview", icon: Shield },
  { href: "/admin/teams", label: "Teams", icon: Users },
  { href: "/admin/publications", label: "Approvals", icon: Upload },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 border-r bg-card flex flex-col h-screen">
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <Shield className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">VEX Manager</span>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
        ))}

        <div className="pt-4 pb-1 px-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Admin
          </p>
        </div>
        {adminItems.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
        ))}
      </nav>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </Link>
  );
}
