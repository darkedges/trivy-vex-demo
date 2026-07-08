import { db } from "./db";
import { Role } from "@prisma/client";

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === Role.ADMIN;
}

export async function getAccessibleProductIds(userId: string): Promise<string[] | "all"> {
  if (await isAdmin(userId)) return "all";

  // One relation-filtered query instead of loading the user's memberships and
  // then their products separately.
  const productTeams = await db.productTeam.findMany({
    where: { team: { members: { some: { userId } } } },
    select: { productId: true },
  });

  return [...new Set(productTeams.map((pt) => pt.productId))];
}

/** Products the user may edit (maintainer of an owning team), or "all" for admins. */
export async function getEditableProductIds(userId: string): Promise<Set<string> | "all"> {
  if (await isAdmin(userId)) return "all";

  const productTeams = await db.productTeam.findMany({
    where: { team: { members: { some: { userId, role: "MAINTAINER" } } } },
    select: { productId: true },
  });

  return new Set(productTeams.map((pt) => pt.productId));
}

export async function canViewProduct(userId: string, productId: string): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  const pt = await db.productTeam.findFirst({
    where: { productId, team: { members: { some: { userId } } } },
    select: { id: true },
  });
  return !!pt;
}

export async function canEditProduct(userId: string, productId: string): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  const pt = await db.productTeam.findFirst({
    where: { productId, team: { members: { some: { userId, role: "MAINTAINER" } } } },
    select: { id: true },
  });
  return !!pt;
}

export interface ProductPermissions {
  isAdmin: boolean;
  canView: boolean;
  canEdit: boolean;
}

/**
 * Resolves all three permission flags for one product in a single membership
 * query (plus the admin short-circuit) — for pages that would otherwise call
 * isAdmin / canView / canEdit separately and re-run the same lookups.
 */
export async function getProductPermissions(userId: string, productId: string): Promise<ProductPermissions> {
  if (await isAdmin(userId)) return { isAdmin: true, canView: true, canEdit: true };

  const memberships = await db.teamMember.findMany({
    where: { userId, team: { products: { some: { productId } } } },
    select: { role: true },
  });

  const canView = memberships.length > 0;
  const canEdit = memberships.some((m) => m.role === "MAINTAINER");
  return { isAdmin: false, canView, canEdit };
}
