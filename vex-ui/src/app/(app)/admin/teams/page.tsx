import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/rbac";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TeamManagement } from "@/components/admin/TeamManagement";

export default async function AdminTeamsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const admin = await isAdmin(session.user.id);
  if (!admin) redirect("/dashboard");

  const teams = await db.team.findMany({
    include: {
      _count: { select: { members: true, products: true } },
    },
    orderBy: { name: "asc" },
  });

  const products = await db.product.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
        <p className="text-muted-foreground">
          Sync GitHub org teams and assign products to control access
        </p>
      </div>

      <TeamManagement
        initialTeams={teams}
        products={products}
        githubOrg={settings?.githubOrg ?? null}
      />
    </div>
  );
}
