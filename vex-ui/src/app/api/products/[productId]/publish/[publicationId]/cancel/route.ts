import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProductEdit } from "@/lib/api-auth";

type Params = { productId: string; publicationId: string };

/**
 * Escape hatch for publications stuck in an in-flight state — e.g. a signing
 * workflow that died without calling back, or a server crash mid-publish.
 * Moves them to the matching failed state (which allows retry / a fresh
 * publish) instead of leaving their statements stranded by the in-flight
 * filter forever. A late signing callback after cancellation is rejected by
 * the callback route's state guard.
 */
export const POST = withProductEdit<Params>(async (_request, { session, params: { productId, publicationId } }) => {
  const publication = await db.publication.findUnique({ where: { id: publicationId } });
  if (!publication || publication.productId !== productId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cancellable: Record<string, "SIGNING_FAILED" | "PUBLISH_FAILED"> = {
    PENDING_SIGNING: "SIGNING_FAILED",
    SIGNING_IN_PROGRESS: "SIGNING_FAILED",
    PUBLISHING: "PUBLISH_FAILED",
  };

  const targetState = cancellable[publication.state];
  if (!targetState) {
    return NextResponse.json({ error: `Cannot cancel a publication in ${publication.state} state` }, { status: 409 });
  }

  const updated = await db.publication.update({
    where: { id: publicationId },
    data: { state: targetState, lastError: `Cancelled by ${session.user.name}` },
  });

  return NextResponse.json(updated);
});
