import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function verifySignature(rawBody: string, signatureHex: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(signatureHex, "hex");
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}

interface CallbackBody {
  publicationId: string;
  success: boolean;
  // Two bundle shapes get sent in practice: the legacy cosign `--bundle`
  // format (rekorBundle.Payload.logIndex, a number) and the newer
  // sigstore-bundle spec (verificationMaterial.tlogEntries[].logIndex, a
  // string) — different cosign versions/flags produce different shapes.
  bundle?: {
    rekorBundle?: { Payload?: { logIndex?: number } };
    verificationMaterial?: { tlogEntries?: Array<{ logIndex?: string }> };
  };
  error?: string;
  workflowRunId?: string;
  workflowRunUrl?: string;
}

/**
 * Called by the sign-vex.yml GitHub Actions workflow after it attempts to
 * sign a publication's document. Authenticated via HMAC (X-Signature header)
 * rather than a session, since the caller is a workflow run, not a browser.
 */
export async function POST(request: NextRequest) {
  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });
  const secret = settings?.signingCallbackSecret;
  if (!secret) {
    return NextResponse.json({ error: "Signing callback is not configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");
  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: CallbackBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const publication = await db.publication.findUnique({ where: { id: body.publicationId } });
  if (!publication) return NextResponse.json({ error: "Publication not found" }, { status: 404 });

  // Only accept a callback for a publication that's actually mid-flight —
  // guards against a stray/replayed callback resurrecting an already
  // failed/signed/published record.
  if (publication.state !== "SIGNING_IN_PROGRESS") {
    return NextResponse.json(
      { error: `Publication is in ${publication.state} state, not awaiting a signing callback` },
      { status: 409 }
    );
  }

  if (!body.success) {
    await db.publication.update({
      where: { id: publication.id },
      data: {
        state: "SIGNING_FAILED",
        lastError: body.error ?? "Signing workflow reported failure",
        workflowRunId: body.workflowRunId,
        workflowRunUrl: body.workflowRunUrl,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (!publication.documentJson) {
    return NextResponse.json({ error: "Publication has no document to sign against" }, { status: 409 });
  }

  const documentHash = createHash("sha256").update(publication.documentJson).digest("hex");

  // Best-effort: sigstore bundles vary by client/version in exactly how the
  // Rekor transparency log entry is shaped. We check both the legacy cosign
  // format and the newer sigstore-bundle spec — no cert parsing for
  // signerIdentity/signerIssuer, no cryptographic re-verification of the
  // bundle here (demo-grade).
  const legacyLogIndex = body.bundle?.rekorBundle?.Payload?.logIndex;
  const tlogLogIndex = body.bundle?.verificationMaterial?.tlogEntries?.[0]?.logIndex;
  const rekorLogIndex =
    legacyLogIndex != null ? Number(legacyLogIndex) : tlogLogIndex != null ? Number(tlogLogIndex) : null;

  await db.$transaction([
    db.signingRecord.create({
      data: {
        publicationId: publication.id,
        documentHash,
        documentContent: publication.documentJson,
        bundleJson: JSON.stringify(body.bundle ?? null),
        rekorLogIndex: Number.isFinite(rekorLogIndex) ? rekorLogIndex : null,
      },
    }),
    db.publication.update({
      where: { id: publication.id },
      data: {
        state: "SIGNED",
        workflowRunId: body.workflowRunId,
        workflowRunUrl: body.workflowRunUrl,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
