"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileJson } from "lucide-react";

interface CandidateRow {
  vulnerabilityId: string;
  severity: string;
  purls: string[];
  title: string;
  alreadyExists: boolean;
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  UNKNOWN: 4,
};

const severityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-blue-100 text-blue-700",
  UNKNOWN: "bg-gray-100 text-gray-700",
};

interface TrivyVulnerability {
  VulnerabilityID: string;
  Severity?: string;
  Title?: string;
  PkgIdentifier?: { PURL?: string };
}

interface TrivyReport {
  Results?: Array<{ Vulnerabilities?: TrivyVulnerability[] }>;
}

function parseTrivyReport(report: TrivyReport, existingVulnIds: Set<string>): CandidateRow[] {
  const byId = new Map<string, { severity: string; purls: Set<string>; title: string }>();

  for (const result of report.Results ?? []) {
    for (const vuln of result.Vulnerabilities ?? []) {
      const entry = byId.get(vuln.VulnerabilityID) ?? {
        severity: vuln.Severity ?? "UNKNOWN",
        purls: new Set<string>(),
        title: vuln.Title ?? "",
      };
      if (vuln.PkgIdentifier?.PURL) entry.purls.add(vuln.PkgIdentifier.PURL);
      if (SEVERITY_ORDER[vuln.Severity ?? "UNKNOWN"] < SEVERITY_ORDER[entry.severity]) {
        entry.severity = vuln.Severity ?? "UNKNOWN";
      }
      byId.set(vuln.VulnerabilityID, entry);
    }
  }

  return [...byId.entries()]
    .map(([vulnerabilityId, v]) => ({
      vulnerabilityId,
      severity: v.severity,
      purls: [...v.purls],
      title: v.title,
      alreadyExists: existingVulnIds.has(vulnerabilityId),
    }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.vulnerabilityId.localeCompare(b.vulnerabilityId));
}

export function ImportWizard({ productId, existingVulnIds }: { productId: string; existingVulnIds: string[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<CandidateRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const existingSet = new Set(existingVulnIds);

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const text = await file.text();
      const report = JSON.parse(text) as TrivyReport;
      if (!Array.isArray(report.Results)) {
        throw new Error("Not a valid Trivy JSON report (missing Results array)");
      }
      const parsed = parseTrivyReport(report, existingSet);
      setRows(parsed);
      setSelected(new Set(parsed.filter((r) => !r.alreadyExists).map((r) => r.vulnerabilityId)));
    } catch (err) {
      setRows(null);
      setParseError(err instanceof Error ? err.message : "Failed to parse file");
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!rows) return;
    const selectable = rows.filter((r) => !r.alreadyExists).map((r) => r.vulnerabilityId);
    setSelected((prev) => (prev.size === selectable.length ? new Set() : new Set(selectable)));
  }

  async function handleImport() {
    if (!rows) return;
    setImporting(true);
    setImportError(null);
    try {
      const items = rows
        .filter((r) => selected.has(r.vulnerabilityId))
        .map((r) => ({ vulnerabilityId: r.vulnerabilityId, purls: r.purls }));

      const res = await fetch(`/api/products/${productId}/statements/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Import failed");
      }
      const json = await res.json();
      setResult(json);
      router.refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <FileJson className="h-4 w-4" />
          Trivy JSON report
        </label>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="text-sm"
        />
        {parseError && <p className="text-sm text-destructive">{parseError}</p>}
      </div>

      {result && (
        <div className="rounded-lg border bg-card p-4 text-sm">
          Created <strong>{result.created}</strong> draft statement{result.created !== 1 ? "s" : ""}
          {result.skipped > 0 && <> — skipped {result.skipped} already present</>}.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {rows.length} CVE{rows.length !== 1 ? "s" : ""} found — {selected.size} selected
            </p>
            <button onClick={toggleAll} className="text-sm text-primary hover:underline">
              Toggle all
            </button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="w-8 px-4 py-2.5" />
                  <th className="text-left px-2 py-2.5 font-medium text-muted-foreground">Vulnerability</th>
                  <th className="text-left px-2 py-2.5 font-medium text-muted-foreground">Severity</th>
                  <th className="text-left px-2 py-2.5 font-medium text-muted-foreground">Packages</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.vulnerabilityId} className={r.alreadyExists ? "opacity-50" : "hover:bg-muted/30 transition-colors"}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.vulnerabilityId)}
                        disabled={r.alreadyExists}
                        onChange={() => toggle(r.vulnerabilityId)}
                      />
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs">
                      {r.vulnerabilityId}
                      {r.alreadyExists && <span className="ml-2 text-muted-foreground">(imported)</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${severityColors[r.severity] ?? severityColors.UNKNOWN}`}>
                        {r.severity}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">{r.purls.length} package{r.purls.length !== 1 ? "s" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importError && <p className="text-sm text-destructive">{importError}</p>}

          <button
            onClick={handleImport}
            disabled={importing || selected.size === 0}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {importing ? "Importing…" : `Import ${selected.size} Selected as Draft Statements`}
          </button>
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No vulnerabilities found in this report.</p>
      )}
    </div>
  );
}
