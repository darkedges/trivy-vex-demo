import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-auth";
import { z } from "zod";

const settingsSchema = z.object({
  githubOrg: z.string().optional(),
  signingWorkflowRepo: z.string().optional(),
  signingWorkflowPath: z.string().optional(),
  signingCallbackSecret: z.string().optional(),
  vexRepoName: z.string().optional(),
  vexRepoDescription: z.string().optional(),
  vexRepoUpdateInterval: z.string().optional(),
  vexRepoPublicUrl: z.string().url().optional().or(z.literal("")),
  ghPagesBranch: z.string().optional(),
  ghPagesRepo: z.string().optional(),
  vexRepoSrcPath: z.string().optional(),
  vexRepoDirPath: z.string().optional(),
  vexStatementsPath: z.string().optional(),
  vexDocBaseUrl: z.string().url().optional().or(z.literal("")),
});

export const GET = withAdmin(async () => {
  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });
  // Mask the callback secret
  const safe = settings
    ? { ...settings, signingCallbackSecret: settings.signingCallbackSecret ? "••••••••" : null }
    : null;

  return NextResponse.json(safe ?? {});
});

export const PUT = withAdmin(async (request) => {
  const body = await request.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  // Don't overwrite secret if masked value submitted
  const data = { ...parsed.data };
  if (data.signingCallbackSecret === "••••••••") {
    delete data.signingCallbackSecret;
  }

  const settings = await db.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ ...settings, signingCallbackSecret: settings.signingCallbackSecret ? "••••••••" : null });
});
