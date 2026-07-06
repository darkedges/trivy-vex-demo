"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Send, RotateCcw } from "lucide-react";

export function StatementActions({
  productId,
  statementId,
  workflowState,
  canEdit,
  isAdminUser,
}: {
  productId: string;
  statementId: string;
  workflowState: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED" | "REJECTED";
  canEdit: boolean;
  isAdminUser: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState("");

  async function post(path: string, body?: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/statements/${statementId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Action failed");
        return;
      }
      setShowReject(false);
      setNote("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const canSubmit = canEdit && (workflowState === "DRAFT" || workflowState === "REJECTED");
  const canReview = isAdminUser && workflowState === "PENDING_APPROVAL";
  const canRevise = canEdit && workflowState === "PUBLISHED";

  if (!canSubmit && !canReview && !canRevise)
    return error ? <p className="text-sm text-destructive">{error}</p> : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canRevise && (
          <button
            onClick={() => post("revise")}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
            title="Re-open this published statement as a draft for correction"
          >
            <RotateCcw className="h-4 w-4" />
            Revise
          </button>
        )}
        {canSubmit && (
          <button
            onClick={() => post("submit")}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4" />
            Submit for Approval
          </button>
        )}
        {canReview && (
          <>
            <button
              onClick={() => post("approve")}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Check className="h-4 w-4" />
              Approve
            </button>
            <button
              onClick={() => setShowReject((v) => !v)}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-md border border-destructive/50 text-destructive px-3 py-2 text-sm font-medium hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
          </>
        )}
      </div>

      {showReject && (
        <div className="space-y-2 rounded-md border p-3">
          <label className="text-sm font-medium">Rejection note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="Explain why this statement is being rejected…"
          />
          <button
            onClick={() => post("reject", { note })}
            disabled={pending || !note.trim()}
            className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            Confirm Reject
          </button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
