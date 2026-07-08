"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JUSTIFICATIONS } from "@/lib/vex/openvex";
import { Field, inputClass } from "@/components/ui/form";

const schema = z
  .object({
    vulnerabilityId: z.string().min(1, "Required").max(100),
    status: z.enum(["NOT_AFFECTED", "AFFECTED", "FIXED", "UNDER_INVESTIGATION"]),
    justification: z.enum(JUSTIFICATIONS).optional(),
    statusNotes: z.string().max(2000).optional(),
    author: z.string().min(1, "Required").max(200),
    purlsText: z.string().optional(),
  })
  .refine((data) => data.status !== "NOT_AFFECTED" || !!data.justification, {
    message: "Justification is required when status is not affected",
    path: ["justification"],
  });

type FormValues = z.infer<typeof schema>;

export interface StatementFormInitial {
  vulnerabilityId: string;
  status: FormValues["status"];
  justification: string | null;
  statusNotes: string | null;
  author: string;
  purls: string[];
}

export function StatementForm({
  productId,
  mode,
  statementId,
  initial,
  defaultAuthor,
  onSaved,
  onCancel,
}: {
  productId: string;
  mode: "create" | "edit";
  statementId?: string;
  initial?: StatementFormInitial;
  defaultAuthor?: string;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vulnerabilityId: initial?.vulnerabilityId ?? "",
      status: initial?.status ?? "NOT_AFFECTED",
      justification: (initial?.justification as FormValues["justification"]) ?? "vulnerable_code_not_in_execute_path",
      statusNotes: initial?.statusNotes ?? "",
      author: initial?.author ?? defaultAuthor ?? "",
      purlsText: initial?.purls.join("\n") ?? "",
    },
  });

  const status = watch("status");

  async function onSubmit(data: FormValues) {
    setError(null);
    const purls = (data.purlsText ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const payload = {
      ...(mode === "create" ? { vulnerabilityId: data.vulnerabilityId } : {}),
      status: data.status,
      justification: data.status === "NOT_AFFECTED" ? data.justification : undefined,
      statusNotes: data.statusNotes || undefined,
      author: data.author,
      purls,
    };

    const url =
      mode === "create"
        ? `/api/products/${productId}/statements`
        : `/api/products/${productId}/statements/${statementId}`;

    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to save statement");
      return;
    }

    const statement = await res.json();
    if (onSaved) {
      onSaved();
    } else {
      router.push(`/products/${productId}/statements/${statement.id}`);
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-lg">
      <Field label="Vulnerability ID" error={errors.vulnerabilityId?.message} hint="e.g. CVE-2025-52999 or GHSA-…">
        <input
          {...register("vulnerabilityId")}
          disabled={mode === "edit"}
          className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed font-mono`}
          placeholder="CVE-2025-52999"
        />
      </Field>

      <Field label="Status" error={errors.status?.message}>
        <select {...register("status")} className={inputClass}>
          <option value="NOT_AFFECTED">Not Affected</option>
          <option value="AFFECTED">Affected</option>
          <option value="FIXED">Fixed</option>
          <option value="UNDER_INVESTIGATION">Under Investigation</option>
        </select>
      </Field>

      {status === "NOT_AFFECTED" && (
        <Field label="Justification" error={errors.justification?.message} hint="Required by OpenVEX for not_affected">
          <select {...register("justification")} className={inputClass}>
            {JUSTIFICATIONS.map((j) => (
              <option key={j} value={j}>
                {j.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Status Notes" error={errors.statusNotes?.message} hint="Analyst assessment / rationale">
        <textarea {...register("statusNotes")} className={inputClass} rows={4} />
      </Field>

      <Field label="Author" error={errors.author?.message} hint="OpenVEX document author, e.g. Name <email>">
        <input {...register("author")} className={inputClass} />
      </Field>

      <Field
        label="Affected Package PURLs"
        error={errors.purlsText?.message}
        hint="One PURL per line, e.g. pkg:maven/com.fasterxml.jackson.core/jackson-core@2.11.1"
      >
        <textarea {...register("purlsText")} className={`${inputClass} font-mono text-xs`} rows={5} />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? "Saving…" : mode === "create" ? "Create Statement" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => (onCancel ? onCancel() : router.back())}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
