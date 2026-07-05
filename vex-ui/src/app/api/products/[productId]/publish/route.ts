import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanEditProduct } from "@/lib/rbac";
import { buildMergedDocument } from "@/lib/vex/merge-doc";
import { Octokit } from "@octokit/rest";
import path from "node:path";

type RouteContext = { params: Promise<{ productId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  try {
    await assertCanEditProduct(session.user.id, productId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Exclude statements already caught up in an in-flight publication for this
  // product, so a second click can't create overlapping publications for the
  // same statements.
  const inFlightStatementIds = (
    await db.publicationStatement.findMany({
      where: {
        publication: {
          productId,
          state: { in: ["PENDING_SIGNING", "SIGNING_IN_PROGRESS", "SIGNED", "PUBLISHING"] },
        },
      },
      select: { statementId: true },
    })
  ).map((ps) => ps.statementId);

  const statements = await db.statement.findMany({
    where: { productId, workflowState: "APPROVED", id: { notIn: inFlightStatementIds } },
  });
  if (statements.length === 0) {
    return NextResponse.json({ error: "No approved statements to publish" }, { status: 400 });
  }

  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });
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
  const org = settings?.githubOrg;
  const workflowRepo = settings?.signingWorkflowRepo;
  const workflowPath = settings?.signingWorkflowPath || ".github/workflows/sign-vex.yml";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!token || !org || !workflowRepo || !appUrl) {
    const missing = [
      !token && "GITHUB_TOKEN",
      !org && "Admin → Settings → GitHub Organization",
      !workflowRepo && "Admin → Settings → Signing Workflow Repo",
      !appUrl && "NEXT_PUBLIC_APP_URL",
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

    await octokit.rest.actions.createWorkflowDispatch({
      owner: org,
      repo: workflowRepo,
      workflow_id: workflowId,
      ref: repoInfo.data.default_branch,
      inputs: {
        publication_id: publication.id,
        document_b64: Buffer.from(json, "utf8").toString("base64"),
        callback_url: `${appUrl}/api/publish/callback`,
      },
    });

    const updated = await db.publication.update({
      where: { id: publication.id },
      data: { state: "SIGNING_IN_PROGRESS" },
    });
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
