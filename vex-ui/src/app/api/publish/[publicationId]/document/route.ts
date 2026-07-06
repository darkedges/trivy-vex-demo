import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getResolvedSettings } from "@/lib/settings";
import { createHmac, timingSafeEqual } from "node:crypto";

type RouteContext = { params: Promise<{ publicationId: string }> };

/**
 * Fetched by the sign-vex.yml workflow instead of receiving the document as a
 * workflow_dispatch input — GitHub caps each input at 65,535 chars, which a
 * merged OpenVEX document exceeds at roughly 70 statements. Authenticated by
 * HMAC over the publicationId (same shared secret as the callback), and only
 * served while the publication is actually awaiting signing.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { publicationId } = await params;

  const { signingCallbackSecret: secret } = await getResolvedSettings();
  if (!secret) {
    return NextResponse.json({ error: "Signing callback is not configured" }, { status: 400 });
  }

  const signature = request.headers.get("x-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });

  const expected = createHmac("sha256", secret).update(publicationId).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== givenBuf.length || !timingSafeEqual(expectedBuf, givenBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const publication = await db.publication.findUnique({ where: { id: publicationId } });
  if (!publication || !publication.documentJson) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (publication.state !== "SIGNING_IN_PROGRESS") {
    return NextResponse.json(
      { error: `Publication is in ${publication.state} state, not awaiting signing` },
      { status: 409 }
    );
  }

  return new NextResponse(publication.documentJson, {
    headers: { "Content-Type": "application/json" },
  });
}
