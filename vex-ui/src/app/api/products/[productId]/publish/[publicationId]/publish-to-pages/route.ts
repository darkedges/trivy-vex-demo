import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanEditProduct } from "@/lib/rbac";
import { buildVexRepoArchive } from "@/lib/vex/repo-archive";
import { buildIndexPackageId } from "@/lib/vex/purl";
import { buildRepoIndexHtml } from "@/lib/vex/repo-index-page";
import { commitFilesToBranch } from "@/lib/gh/git-commit";
import { Octokit } from "@octokit/rest";
import { createHash } from "node:crypto";

type RouteContext = { params: Promise<{ productId: string; publicationId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId, publicationId } = await params;

  try {
    await assertCanEditProduct(session.user.id, productId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const publication = await db.publication.findUnique({ where: { id: publicationId } });
  if (!publication || publication.productId !== productId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (publication.state !== "SIGNED") {
    return NextResponse.json({ error: `Cannot publish from ${publication.state} state` }, { status: 409 });
  }
  if (!publication.documentJson) {
    return NextResponse.json({ error: "Publication has no document" }, { status: 409 });
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });
  const token = process.env.GITHUB_TOKEN;
  const ghPagesRepo = settings?.ghPagesRepo;
  const ghPagesBranch = settings?.ghPagesBranch || "gh-pages";

  if (!token || !ghPagesRepo) {
    const missing = [!token && "GITHUB_TOKEN", !ghPagesRepo && "Admin → Settings → GitHub Pages Repo"]
      .filter(Boolean)
      .join(", ");
    const lastError = `Publishing is not configured: missing ${missing}`;
    await db.publication.update({ where: { id: publicationId }, data: { state: "PUBLISH_FAILED", lastError } });
    return NextResponse.json({ error: lastError }, { status: 400 });
  }

  const [owner, repo] = ghPagesRepo.includes("/") ? ghPagesRepo.split("/") : [settings?.githubOrg, ghPagesRepo];
  if (!owner || !repo) {
    const lastError = "GitHub Pages Repo must be in owner/repo form (or set a GitHub Organization in Settings)";
    await db.publication.update({ where: { id: publicationId }, data: { state: "PUBLISH_FAILED", lastError } });
    return NextResponse.json({ error: lastError }, { status: 400 });
  }

  await db.publication.update({ where: { id: publicationId }, data: { state: "PUBLISHING" } });

  try {
    const currentSigningRecord = await db.signingRecord.findUnique({ where: { publicationId } });

    // Rebuild the full repo index across every product that has ever
    // published, so it stays authoritative rather than reflecting only this
    // one publish.
    const latestPublished = await db.publication.findMany({
      where: { state: "PUBLISHED", productId: { not: productId } },
      distinct: ["productId"],
      orderBy: { updatedAt: "desc" },
      include: { product: true, signingRecord: true },
    });

    const packages = [
      {
        product,
        documentJson: publication.documentJson,
        workflowRunUrl: publication.workflowRunUrl,
        signingRecord: currentSigningRecord,
      },
      ...latestPublished
        .filter((p) => p.documentJson)
        .map((p) => ({
          product: p.product,
          documentJson: p.documentJson as string,
          workflowRunUrl: p.workflowRunUrl,
          signingRecord: p.signingRecord,
        })),
    ];

    const updatedAt = new Date().toISOString();
    const indexJson = JSON.stringify(
      {
        updated_at: updatedAt,
        packages: packages.map(({ product: p }) => ({
          id: buildIndexPackageId(p),
          location: `pkg/oci/${p.slug}/vex.json`,
          format: "openvex",
        })),
      },
      null,
      2
    );

    const pkgFiles = [
      ...packages.map((p) => ({ path: `oci/${p.product.slug}/vex.json`, content: p.documentJson })),
      ...packages
        .filter((p) => p.signingRecord?.bundleJson)
        .map((p) => ({
          path: `oci/${p.product.slug}/vex.json.bundle`,
          content: p.signingRecord!.bundleJson as string,
        })),
    ];

    const tarGz = await buildVexRepoArchive(indexJson, pkgFiles);
    const tarGzSha256 = createHash("sha256").update(tarGz).digest("hex");

    const manifest = JSON.stringify(
      {
        name: settings?.vexRepoName || "VEX Repository",
        description: settings?.vexRepoDescription || "",
        versions: [
          {
            spec_version: "0.1",
            locations: [{ url: `${settings?.vexRepoPublicUrl || ""}/v0.1/vex-data.tar.gz` }],
            update_interval: settings?.vexRepoUpdateInterval || "1h",
          },
        ],
      },
      null,
      2
    );

    const indexHtml = buildRepoIndexHtml({
      repoName: settings?.vexRepoName || "VEX Repository",
      description: settings?.vexRepoDescription || "",
      updateInterval: settings?.vexRepoUpdateInterval || "1h",
      updatedAt,
      packages: packages.map(({ product: p, documentJson, workflowRunUrl, signingRecord }) => {
        let statementCount = 0;
        try {
          statementCount = (JSON.parse(documentJson).statements ?? []).length;
        } catch {
          // malformed/legacy document — fall back to 0 rather than fail the publish
        }
        return {
          name: p.name,
          slug: p.slug,
          statementCount,
          workflowRunUrl,
          rekorLogIndex: signingRecord?.rekorLogIndex ?? null,
          hasBundle: !!signingRecord?.bundleJson,
        };
      }),
    });

    const octokit = new Octokit({ auth: token });
    const commitFiles = [
      { path: "index.html", content: indexHtml },
      { path: ".well-known/vex-repository.json", content: manifest },
      { path: `pkg/oci/${product.slug}/vex.json`, content: publication.documentJson },
      { path: "v0.1/vex-data.tar.gz", content: tarGz },
    ];
    if (currentSigningRecord?.bundleJson) {
      commitFiles.push({
        path: `pkg/oci/${product.slug}/vex.json.bundle`,
        content: currentSigningRecord.bundleJson,
      });
    }

    const commitSha = await commitFilesToBranch(
      octokit,
      owner,
      repo,
      ghPagesBranch,
      commitFiles,
      `Publish VEX statements for ${product.name} (publication ${publication.id})`
    );

    const includedStatementIds = (
      await db.publicationStatement.findMany({ where: { publicationId }, select: { statementId: true } })
    ).map((ps) => ps.statementId);

    await db.$transaction([
      db.publication.update({
        where: { id: publicationId },
        data: { state: "PUBLISHED", ghPagesCommitSha: commitSha, tarGzSha256, lastError: null },
      }),
      db.statement.updateMany({
        where: { id: { in: includedStatementIds } },
        data: { workflowState: "PUBLISHED" },
      }),
    ]);

    const updated = await db.publication.findUnique({ where: { id: publicationId } });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to publish to gh-pages";
    await db.publication.update({
      where: { id: publicationId },
      data: { state: "PUBLISH_FAILED", lastError: message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
