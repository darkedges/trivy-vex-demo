"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Tabs from "@radix-ui/react-tabs";
import { Field, inputClass } from "@/components/ui/form";
import { tabTriggerClass, tabListClass } from "@/components/ui/tabs";

const schema = z.object({
  githubOrg: z.string().optional(),
  signingWorkflowRepo: z.string().optional(),
  signingWorkflowPath: z.string().optional(),
  signingCallbackSecret: z.string().optional(),
  vexRepoName: z.string().optional(),
  vexRepoDescription: z.string().optional(),
  vexRepoUpdateInterval: z.string().optional(),
  vexRepoPublicUrl: z.string().optional(),
  ghPagesBranch: z.string().optional(),
  ghPagesRepo: z.string().optional(),
  vexRepoSrcPath: z.string().optional(),
  vexRepoDirPath: z.string().optional(),
  vexStatementsPath: z.string().optional(),
  vexDocBaseUrl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Prisma returns null for unset fields; the form treats null and undefined the same.
export type SettingsFormInitial = { [K in keyof FormValues]?: string | null };

const TABS = [
  { value: "github", label: "GitHub" },
  { value: "signing", label: "Signing" },
  { value: "vex-repo", label: "VEX Repository" },
  { value: "paths", label: "Filesystem Paths" },
] as const;

export function SettingsForm({ initialSettings }: { initialSettings: SettingsFormInitial | null }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      githubOrg: initialSettings?.githubOrg ?? "",
      signingWorkflowRepo: initialSettings?.signingWorkflowRepo ?? "",
      signingWorkflowPath: initialSettings?.signingWorkflowPath ?? ".github/workflows/sign-vex.yml",
      signingCallbackSecret: initialSettings?.signingCallbackSecret ?? "",
      vexRepoName: initialSettings?.vexRepoName ?? "VEX Repository",
      vexRepoDescription: initialSettings?.vexRepoDescription ?? "",
      vexRepoUpdateInterval: initialSettings?.vexRepoUpdateInterval ?? "1h",
      vexRepoPublicUrl: initialSettings?.vexRepoPublicUrl ?? "",
      ghPagesBranch: initialSettings?.ghPagesBranch ?? "gh-pages",
      ghPagesRepo: initialSettings?.ghPagesRepo ?? "",
      vexRepoSrcPath: initialSettings?.vexRepoSrcPath ?? "",
      vexRepoDirPath: initialSettings?.vexRepoDirPath ?? "",
      vexStatementsPath: initialSettings?.vexStatementsPath ?? "",
      vexDocBaseUrl: initialSettings?.vexDocBaseUrl ?? "https://darkedges.com/vex",
    },
  });

  async function onSubmit(data: FormValues) {
    setSaved(false);
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to save settings");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl">
      <Tabs.Root defaultValue="github">
        <Tabs.List className={tabListClass}>
          {TABS.map((tab) => (
            <Tabs.Trigger key={tab.value} value={tab.value} className={tabTriggerClass}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="github" className="space-y-4">
          <Field label="Organization Name" hint="Your GitHub org slug, e.g. darkedges">
            <input {...register("githubOrg")} className={inputClass} placeholder="darkedges" />
          </Field>
          <Field label="Pages Repo" hint="owner/repo that hosts the VEX repository">
            <input {...register("ghPagesRepo")} className={inputClass} placeholder="darkedges/trivy-vex-demo" />
          </Field>
          <Field label="Pages Branch">
            <input {...register("ghPagesBranch")} className={inputClass} placeholder="gh-pages" />
          </Field>
        </Tabs.Content>

        <Tabs.Content value="signing" className="space-y-4">
          <p className="text-xs text-muted-foreground pb-2">
            Keyless VEX signing uses a GitHub Actions reusable workflow. Create{" "}
            <code className="bg-muted px-1 rounded">.github/workflows/sign-vex.yml</code> in your org&apos;s{" "}
            <code className="bg-muted px-1 rounded">.github</code> repository. The Fulcio cert SAN will be the workflow URL — this is your org-level signing identity.
          </p>
          <Field label="Signing Workflow Repo" hint="The repo in your org containing sign-vex.yml, e.g. .github">
            <input {...register("signingWorkflowRepo")} className={inputClass} placeholder=".github" />
          </Field>
          <Field label="Workflow File Path">
            <input {...register("signingWorkflowPath")} className={inputClass} placeholder=".github/workflows/sign-vex.yml" />
          </Field>
          <Field label="Callback Secret" hint="HMAC secret — must match VEX_UI_SIGNING_SECRET org secret in GitHub">
            <input {...register("signingCallbackSecret")} type="password" className={inputClass} placeholder="••••••••" />
          </Field>
        </Tabs.Content>

        <Tabs.Content value="vex-repo" className="space-y-4">
          <Field label="Repository Name">
            <input {...register("vexRepoName")} className={inputClass} placeholder="VEX Repository" />
          </Field>
          <Field label="Description">
            <input {...register("vexRepoDescription")} className={inputClass} placeholder="VEX statements for our container images" />
          </Field>
          <Field label="Update Interval" hint="How often consumers should refresh the repository">
            <input {...register("vexRepoUpdateInterval")} className={inputClass} placeholder="1h" />
          </Field>
          <Field label="Public URL" hint="The hosted URL of the VEX repository (for GitHub Pages)">
            <input {...register("vexRepoPublicUrl")} className={inputClass} placeholder="https://darkedges.github.io/trivy-vex-demo" />
          </Field>
          <Field label="VEX Document Base URL" hint="Base URL for VEX @id generation">
            <input {...register("vexDocBaseUrl")} className={inputClass} placeholder="https://darkedges.com/vex" />
          </Field>
        </Tabs.Content>

        <Tabs.Content value="paths" className="space-y-4">
          <p className="text-xs text-muted-foreground pb-2">
            These paths point to the local directories on the server where vex-ui is running.
          </p>
          <Field label="vex-repo-src/ path" hint="Source of truth for VEX repository content">
            <input {...register("vexRepoSrcPath")} className={inputClass} placeholder="E:/development/projects/vex/trivy-vex-demo/vex-repo-src" />
          </Field>
          <Field label="vex-repo/ path" hint="Webroot served by nginx/http.server">
            <input {...register("vexRepoDirPath")} className={inputClass} placeholder="E:/development/projects/vex/trivy-vex-demo/vex-repo" />
          </Field>
          <Field label="vex/statements/ path" hint="Per-CVE individual OpenVEX files">
            <input {...register("vexStatementsPath")} className={inputClass} placeholder="E:/development/projects/vex/trivy-vex-demo/vex/statements" />
          </Field>
        </Tabs.Content>
      </Tabs.Root>

      <div className="flex items-center gap-3 pt-6 mt-2 border-t">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? "Saving…" : "Save Settings"}
        </button>
        {saved && <p className="text-sm text-emerald-600 font-medium">Saved!</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
