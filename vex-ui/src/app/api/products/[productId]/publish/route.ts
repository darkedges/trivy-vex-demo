import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canEditProduct } from "@/lib/rbac";
import { buildMergedDocument } from "@/lib/vex/merge-doc";
import { getInFlightStatementIds } from "@/lib/vex/publication";
import { getResolvedSettings } from "@/lib/settings";
import { Octokit } from "@octokit/rest";
import path from "node:path";

type RouteContext = { params: Promise<{ productId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  if (!(await canEditProduct(session.user.id, productId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Exclude statements already caught up in an in-flight publication for this
  // product, so a second click can't create overlapping publications for the
  // same statements.
  const inFlightStatementIds = await getInFlightStatementIds(productId);

  const statements = await db.statement.findMany({
    where: { productId, workflowState: "APPROVED", id: { notIn: inFlightStatementIds } },
  });
  if (statements.length === 0) {
    return NextResponse.json({ error: "No approved statements to publish" }, { status: 400 });
  }

  const settings = await getResolvedSettings();
  const { json } = buildMergedDocument(product, statements, settings);

  const publication = await db.publication.create({
    data: {
      productId,
      state: "PENDING_SIGNING",
      documentJson: json,
      createdById: session.user.id,
      statements: {
        create: statements.map((s) => ({ statementId: s.id, snapshot: JSON.stringify(s) })),
      },
    },
  });

  const token = process.env.GITHUB_TOKEN;
  const org = settings.githubOrg;
  const workflowRepo = settings.signingWorkflowRepo;
  const workflowPath = settings.signingWorkflowPath;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Validate everything the whole pipeline needs — including what only the
  // callback will use — BEFORE dispatching, so a misconfiguration fails here
  // instead of stranding the publication after the workflow has already run.
  if (!token || !org || !workflowRepo || !appUrl || !settings.signingCallbackSecret) {
    const missing = [
      !token && "GITHUB_TOKEN",
      !org && "GitHub Organization (Settings or GITHUB_ORG)",
      !workflowRepo && "Signing Workflow Repo (Settings)",
      !appUrl && "NEXT_PUBLIC_APP_URL",
      !settings.signingCallbackSecret && "Callback Secret (Settings or SIGNING_CALLBACK_SECRET)",
    ]
      .filter(Boolean)
      .join(", ");
    const lastError = `Signing is not configured: missing ${missing}`;
    await db.publication.update({ where: { id: publication.id }, data: { state: "SIGNING_FAILED", lastError } });
    return NextResponse.json({ error: lastError }, { status: 400 });
  }

  try {
    const octokit = new Octokit({ auth: token });
    const repoInfo = await octokit.rest.repos.get({ owner: org, repo: workflowRepo });
    const workflowId = path.basename(workflowPath);

    // Transition BEFORE dispatching: the workflow fetches the document from
    // /api/publish/{id}/document, which only serves SIGNING_IN_PROGRESS —
    // dispatching first would race the workflow against our own update.
    // The document travels by URL rather than as a dispatch input because
    // GitHub caps each workflow_dispatch input at 65,535 chars (~70
    // statements base64-encoded).
    await db.publication.update({
      where: { id: publication.id },
      data: { state: "SIGNING_IN_PROGRESS" },
    });

    await octokit.rest.actions.createWorkflowDispatch({
      owner: org,
      repo: workflowRepo,
      workflow_id: workflowId,
      ref: repoInfo.data.default_branch,
      inputs: {
        publication_id: publication.id,
        document_url: `${appUrl}/api/publish/${publication.id}/document`,
        callback_url: `${appUrl}/api/publish/callback`,
      },
    });

    const updated = await db.publication.findUnique({ where: { id: publication.id } });
    return NextResponse.json(updated, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to dispatch signing workflow";
    await db.publication.update({
      where: { id: publication.id },
      data: { state: "SIGNING_FAILED", lastError: message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
