import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "sqlite" }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  user: {
    additionalFields: {
      // Persisted from the GitHub profile at sign-in; /api/admin/teams/sync
      // matches org team members against this column.
      githubLogin: { type: "string", required: false, input: false },
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ["read:org", "read:user", "user:email"],
      mapProfileToUser: (profile) => ({ githubLogin: profile.login }),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // refresh if older than 1 day
  },
});

export type Session = typeof auth.$Infer.Session;
