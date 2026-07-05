import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/rbac";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/admin/SettingsForm";

export default async function AdminSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const admin = await isAdmin(session.user.id);
  if (!admin) redirect("/dashboard");

  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure VEX Manager — GitHub org, signing workflow, and filesystem paths
        </p>
      </div>

      <SettingsForm
        initialSettings={
          settings
            ? { ...settings, signingCallbackSecret: settings.signingCallbackSecret ? "••••••••" : null }
            : null
        }
      />
    </div>
  );
}
