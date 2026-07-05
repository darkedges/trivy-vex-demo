"use client";

import { useState } from "react";
import { RefreshCw, Users } from "lucide-react";

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  _count: { members: number; products: number };
}

interface Product {
  id: string;
  name: string;
  slug: string;
}

export function TeamManagement({
  initialTeams,
  products,
  githubOrg,
}: {
  initialTeams: Team[];
  products: Product[];
  githubOrg: string | null;
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function syncTeams() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/teams/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setSyncResult(`Synced ${data.count} team${data.count !== 1 ? "s" : ""} from GitHub org`);
      // Refresh teams list
      const teamsRes = await fetch("/api/admin/teams");
      if (teamsRes.ok) setTeams(await teamsRes.json());
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {githubOrg ? (
            <span>GitHub org: <strong>{githubOrg}</strong></span>
          ) : (
            <span className="text-destructive">No GitHub org configured — set it in Admin → Settings</span>
          )}
        </div>
        <button
          onClick={syncTeams}
          disabled={syncing || !githubOrg}
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync from GitHub"}
        </button>
      </div>

      {syncResult && (
        <p className="text-sm p-2 rounded bg-secondary text-secondary-foreground">{syncResult}</p>
      )}

      {teams.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No teams yet. Sync from GitHub to import your org teams.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Team</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Members</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Products</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {teams.map((team) => (
                <tr key={team.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{team.name}</div>
                    {team.description && (
                      <div className="text-xs text-muted-foreground">{team.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{team._count.members}</td>
                  <td className="px-4 py-3 text-muted-foreground">{team._count.products}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
