import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canEditProduct, isAdmin } from "@/lib/rbac";
import { getResolvedSettings } from "@/lib/settings";
import { JUSTIFICATIONS } from "@/lib/vex/openvex";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type RouteContext = { params: Promise<{ productId: string }> };

interface OpenVexDoc {
  "@id": string;
  author: string;
  statements: Array<{
    vulnerability: { name: string };
    status: string;
    status_notes?: string;
    justification?: string;
    products?: Array<{ subcomponents?: Array<{ "@id": string }> }>;
  }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  if (!(await canEditProduct(session.user.id, productId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await getResolvedSettings();
  const dir = settings.vexStatementsPath;
  if (!dir) {
    return NextResponse.json(
      { error: "vex/statements/ path is not configured (Admin → Settings → Filesystem Paths)" },
      { status: 400 }
    );
  }

  let filenames: string[];
  try {
    filenames = (await readdir(dir)).filter((f) => f.endsWith(".openvex.json"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read directory";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const existing = await db.statement.findMany({ where: { productId }, select: { vulnerabilityId: true } });
  const existingIds = new Set(existing.map((s) => s.vulnerabilityId));

  // Only admins may import directly to APPROVED (the files carry a finished
  // assessment); everyone else lands imports as DRAFT so the normal
  // submit/approve gate still applies.
  const adminUser = await isAdmin(session.user.id);

  const VALID_STATUSES = new Set(["NOT_AFFECTED", "AFFECTED", "FIXED", "UNDER_INVESTIGATION"]);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const now = new Date();

  // Sequential creates: SQLite has a single writer, and concurrent create() calls
  // risk "database is locked" against the single file.
  for (const filename of filenames) {
    try {
      const raw = await readFile(path.join(dir, filename), "utf8");
      const doc = JSON.parse(raw) as OpenVexDoc;
      const stmt = doc.statements?.[0];
      const vulnerabilityId = stmt?.vulnerability?.name;
      if (!stmt || !vulnerabilityId) {
        errors.push(`${filename}: no vulnerability statement found`);
        continue;
      }

      if (existingIds.has(vulnerabilityId)) {
        skipped++;
        continue;
      }

      // Enforce the same invariants as the manual-create route: known status,
      // and justification present iff status is not_affected.
      const status = stmt.status?.toUpperCase();
      if (!status || !VALID_STATUSES.has(status)) {
        errors.push(`${filename}: unknown status "${stmt.status}"`);
        continue;
      }
      const justification = stmt.justification ?? null;
      if (status === "NOT_AFFECTED" && (!justification || !(JUSTIFICATIONS as readonly string[]).includes(justification))) {
        errors.push(`${filename}: not_affected requires a valid justification (got "${justification}")`);
        continue;
      }
      if (status !== "NOT_AFFECTED" && justification) {
        errors.push(`${filename}: justification is only valid with not_affected status`);
        continue;
      }

      const purls = stmt.products?.[0]?.subcomponents?.map((s) => s["@id"]) ?? [];

      await db.statement.create({
        data: {
          productId,
          vexDocId: doc["@id"],
          vulnerabilityId,
          status: status as "NOT_AFFECTED" | "AFFECTED" | "FIXED" | "UNDER_INVESTIGATION",
          justification,
          statusNotes: stmt.status_notes ?? null,
          productsJson: JSON.stringify([
            { "@id": product.ociPurl, subcomponents: purls.map((p) => ({ "@id": p })) },
          ]),
          author: doc.author,
          workflowState: adminUser ? "APPROVED" : "DRAFT",
          createdById: session.user.id,
          approvedById: adminUser ? session.user.id : null,
          approvedAt: adminUser ? now : null,
        },
      });
      existingIds.add(vulnerabilityId);
      created++;
    } catch (err) {
      errors.push(`${filename}: ${err instanceof Error ? err.message : "failed to parse"}`);
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
