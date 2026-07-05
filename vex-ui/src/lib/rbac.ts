import { db } from "./db";
import { Role } from "@prisma/client";

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === Role.ADMIN;
}

export async function assertIsAdmin(userId: string): Promise<void> {
  if (!(await isAdmin(userId))) {
    throw new Error("FORBIDDEN");
  }
}

export async function getAccessibleProductIds(userId: string): Promise<string[] | "all"> {
  if (await isAdmin(userId)) return "all";

  const memberships = await db.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);

  const productTeams = await db.productTeam.findMany({
    where: { teamId: { in: teamIds } },
    select: { productId: true },
  });

  return [...new Set(productTeams.map((pt) => pt.productId))];
}

export async function canViewProduct(userId: string, productId: string): Promise<boolean> {
  const access = await getAccessibleProductIds(userId);
  if (access === "all") return true;
  return access.includes(productId);
}

export async function assertCanViewProduct(userId: string, productId: string): Promise<void> {
  if (!(await canViewProduct(userId, productId))) throw new Error("FORBIDDEN");
}

export async function canEditProduct(userId: string, productId: string): Promise<boolean> {
  if (await isAdmin(userId)) return true;

  const memberships = await db.teamMember.findMany({
    where: { userId },
    select: { teamId: true, role: true },
  });

  const maintainerTeamIds = memberships
    .filter((m) => m.role === "MAINTAINER")
    .map((m) => m.teamId);

  if (maintainerTeamIds.length === 0) return false;

  const productTeam = await db.productTeam.findFirst({
    where: { productId, teamId: { in: maintainerTeamIds } },
  });

  return !!productTeam;
}

export async function assertCanEditProduct(userId: string, productId: string): Promise<void> {
  if (!(await canEditProduct(userId, productId))) throw new Error("FORBIDDEN");
}
