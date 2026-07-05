"use client";

import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Pencil } from "lucide-react";
import { format } from "date-fns";
import { statusColors, workflowColors } from "@/lib/vex/badges";
import { StatementActions } from "./StatementActions";
import { StatementForm, type StatementFormInitial } from "./StatementForm";

interface VersionEntry {
  id: string;
  versionNum: number;
  changeNote: string | null;
  createdAt: string | Date;
  changedById: string;
}

export function StatementDetailTabs({
  productId,
  statementId,
  vulnerabilityId,
  status,
  workflowState,
  justification,
  statusNotes,
  author,
  docVersion,
  vexDocId,
  rejectionNote,
  createdByName,
  approvedByName,
  purls,
  versions,
  changedByName,
  canEdit,
  adminUser,
  formInitial,
}: {
  productId: string;
  statementId: string;
  vulnerabilityId: string;
  status: string;
  workflowState: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED" | "REJECTED";
  justification: string | null;
  statusNotes: string | null;
  author: string;
  docVersion: number;
  vexDocId: string;
  rejectionNote: string | null;
  createdByName: string;
  approvedByName: string | null;
  purls: string[];
  versions: VersionEntry[];
  changedByName: Record<string, string>;
  canEdit: boolean;
  adminUser: boolean;
  formInitial: StatementFormInitial;
}) {
  const [tab, setTab] = useState("overview");
  const canEditNow = canEdit && workflowState !== "PUBLISHED";

  return (
    <Tabs.Root value={tab} onValueChange={setTab}>
      <Tabs.List className="flex gap-1 border-b mb-6">
        <Tabs.Trigger
          value="overview"
          className="px-3 py-2 text-sm font-medium text-muted-foreground border-b-2 border-transparent hover:text-foreground transition-colors data-[state=active]:text-foreground data-[state=active]:border-primary"
        >
          Overview
        </Tabs.Trigger>
        <Tabs.Trigger
          value="edit"
          disabled={!canEditNow}
          className="px-3 py-2 text-sm font-medium text-muted-foreground border-b-2 border-transparent hover:text-foreground transition-colors data-[state=active]:text-foreground data-[state=active]:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Edit
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="overview" className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight font-mono">{vulnerabilityId}</h1>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${statusColors[status] ?? ""}`}>
                {status.replace(/_/g, " ")}
              </span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${workflowColors[workflowState] ?? ""}`}>
                {workflowState.replace(/_/g, " ")}
              </span>
            </div>
          </div>
          {canEditNow && (
            <button
              onClick={() => setTab("edit")}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>

        <StatementActions
          productId={productId}
          statementId={statementId}
          workflowState={workflowState}
          canEdit={canEdit}
          isAdminUser={adminUser}
        />

        {workflowState === "REJECTED" && rejectionNote && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive mb-1">Rejection note</p>
            <p className="text-muted-foreground">{rejectionNote}</p>
          </div>
        )}

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm">Details</h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="Justification" value={justification?.replace(/_/g, " ") ?? "—"} />
            <Row label="Author" value={author} />
            <Row label="Doc Version" value={String(docVersion)} />
            <Row label="VEX Doc ID" value={vexDocId} mono />
            <Row label="Created by" value={createdByName} />
            {approvedByName && <Row label="Approved by" value={approvedByName} />}
          </dl>
          {statusNotes && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1">Status Notes</p>
              <p className="text-sm whitespace-pre-wrap">{statusNotes}</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="font-semibold text-sm">Affected Packages</h3>
          {purls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No package PURLs recorded.</p>
          ) : (
            <ul className="space-y-1">
              {purls.map((p) => (
                <li key={p} className="font-mono text-xs text-muted-foreground truncate">{p}</li>
              ))}
            </ul>
          )}
        </div>

        {versions.length > 0 && (
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-sm">Version History</h3>
            <ul className="divide-y">
              {versions.map((v) => (
                <li key={v.id} className="py-2 text-sm flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium">v{v.versionNum}</span>
                    <span className="text-muted-foreground"> — {v.changeNote}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    {changedByName[v.changedById] ?? "Unknown"} · {format(new Date(v.createdAt), "MMM d, yyyy, h:mm a")}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Tabs.Content>

      <Tabs.Content value="edit">
        {canEditNow ? (
          <StatementForm
            productId={productId}
            mode="edit"
            statementId={statementId}
            initial={formInitial}
            onSaved={() => setTab("overview")}
            onCancel={() => setTab("overview")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">This statement is published and can no longer be edited.</p>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground w-32 flex-shrink-0">{label}</dt>
      <dd className={`truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
