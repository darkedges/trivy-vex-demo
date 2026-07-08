import { NextRequest, NextResponse } from "next/server";
import { auth, type Session } from "@/lib/auth";
import { isAdmin, canViewProduct, canEditProduct } from "@/lib/rbac";

/**
 * Route-handler auth wrappers. Every mutating/reading API route wraps its
 * handler in exactly one of these so the session lookup (401) and RBAC check
 * (403) live in one place — and a route with no wrapper is visibly missing
 * its gate rather than silently unauthenticated.
 *
 * The wrapped handler receives the resolved (non-null) session and the awaited
 * route params, so bodies never re-derive either.
 *
 * NOT for the HMAC-authenticated webhooks (publish callback / document fetch)
 * or the better-auth catch-all — those authenticate differently and stay bare.
 */

export type AuthedHandler<P> = (
  request: NextRequest,
  ctx: { session: Session; params: P }
) => Promise<Response>;

type RawContext<P> = { params: Promise<P> };

function withGuard<P>(
  guard: ((session: Session, params: P) => boolean | Promise<boolean>) | null,
  handler: AuthedHandler<P>
) {
  return async (request: NextRequest, ctx: RawContext<P>): Promise<Response> => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const params = await ctx.params;
    if (guard && !(await guard(session, params))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return handler(request, { session, params });
  };
}

/** Any authenticated user. */
export const withSession = <P>(handler: AuthedHandler<P>) => withGuard<P>(null, handler);

/** Admin role required. */
export const withAdmin = <P>(handler: AuthedHandler<P>) =>
  withGuard<P>((session) => isAdmin(session.user.id), handler);

/** Caller must be able to view the product named by `params.productId`. */
export const withProductView = <P extends { productId: string }>(handler: AuthedHandler<P>) =>
  withGuard<P>((session, params) => canViewProduct(session.user.id, params.productId), handler);

/** Caller must be able to edit the product named by `params.productId`. */
export const withProductEdit = <P extends { productId: string }>(handler: AuthedHandler<P>) =>
  withGuard<P>((session, params) => canEditProduct(session.user.id, params.productId), handler);
