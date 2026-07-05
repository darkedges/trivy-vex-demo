"use client";

import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";
import { Bell } from "lucide-react";

const labels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/products": "Products",
  "/registry": "Registry Browser",
  "/publications": "Publications",
  "/admin": "Admin",
  "/admin/teams": "Team Management",
  "/admin/publications": "Pending Approvals",
  "/admin/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();

  const title =
    Object.entries(labels).find(([path]) => pathname === path || pathname.startsWith(path + "/"))?.[1] ??
    "VEX Manager";

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 flex-shrink-0">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="flex items-center gap-2">
        <button className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground">
          <Bell className="h-4 w-4" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
