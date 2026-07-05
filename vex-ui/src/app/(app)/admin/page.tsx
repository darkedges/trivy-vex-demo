import Link from "next/link";
import { Users, Upload, Settings, Shield } from "lucide-react";

const adminSections = [
  { href: "/admin/teams", icon: Users, label: "Team Management", desc: "Sync GitHub org teams and assign products" },
  { href: "/admin/publications", icon: Upload, label: "Pending Approvals", desc: "Review and approve VEX statements" },
  { href: "/admin/settings", icon: Settings, label: "Settings", desc: "Configure signing workflow and repository paths" },
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Console</h1>
          <p className="text-muted-foreground">Manage teams, approvals, and settings</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {adminSections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all space-y-2"
          >
            <div className="flex items-center gap-2">
              <s.icon className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">{s.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
