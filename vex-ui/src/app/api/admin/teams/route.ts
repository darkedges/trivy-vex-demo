import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-auth";

export const GET = withAdmin(async () => {
  const teams = await db.team.findMany({
    include: {
      _count: { select: { members: true, products: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(teams);
});
