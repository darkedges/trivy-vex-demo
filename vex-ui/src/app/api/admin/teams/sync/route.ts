import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-auth";
import { getResolvedSettings } from "@/lib/settings";
import { Octokit } from "@octokit/rest";

export const POST = withAdmin(async (_request, { session }) => {
  const { githubOrg: org } = await getResolvedSettings();
  if (!org) {
    return NextResponse.json({ error: "GitHub org not configured" }, { status: 400 });
  }

  const account = await db.account.findFirst({
    where: { userId: session.user.id, providerId: "github" },
    select: { accessToken: true },
  });

  if (!account?.accessToken) {
    return NextResponse.json({ error: "GitHub token not available" }, { status: 400 });
  }

  const octokit = new Octokit({ auth: account.accessToken });

  try {
    const { data: githubTeams } = await octokit.rest.teams.list({ org, per_page: 100 });

    const synced: string[] = [];

    for (const gt of githubTeams) {
      const team = await db.team.upsert({
        where: { slug: gt.slug },
        create: {
          name: gt.name,
          slug: gt.slug,
          githubTeamId: gt.id,
          description: gt.description ?? undefined,
        },
        update: {
          name: gt.name,
          githubTeamId: gt.id,
          description: gt.description ?? undefined,
        },
      });

      const { data: members } = await octokit.rest.teams.listMembersInOrg({
        org,
        team_slug: gt.slug,
        per_page: 100,
      });

      for (const member of members) {
        const user = await db.user.findFirst({
          where: { githubLogin: member.login },
        });
        if (user) {
          await db.teamMember.upsert({
            where: { teamId_userId: { teamId: team.id, userId: user.id } },
            create: { teamId: team.id, userId: user.id },
            update: {},
          });
        }
      }

      synced.push(gt.slug);
    }

    return NextResponse.json({ synced, count: synced.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "GitHub API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
