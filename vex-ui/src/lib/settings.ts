import { db } from "./db";

export interface ResolvedSettings {
  githubOrg: string | null;
  signingWorkflowRepo: string | null;
  signingWorkflowPath: string;
  signingCallbackSecret: string | null;
  vexRepoName: string;
  vexRepoDescription: string;
  vexRepoUpdateInterval: string;
  vexRepoPublicUrl: string | null;
  ghPagesBranch: string;
  ghPagesRepo: string | null;
  vexRepoSrcPath: string | null;
  vexRepoDirPath: string | null;
  vexStatementsPath: string | null;
  vexDocBaseUrl: string;
}

const pick = (...values: Array<string | null | undefined>) =>
  values.find((v) => v != null && v !== "") ?? null;

/**
 * Single config-resolution layer: the Admin → Settings DB row wins, with the
 * env vars documented in .env.example as fallbacks — so configuring either
 * place works, instead of the two silently disagreeing.
 */
export async function getResolvedSettings(): Promise<ResolvedSettings> {
  const s = await db.appSettings.findUnique({ where: { id: "singleton" } });
  const env = process.env;

  return {
    githubOrg: pick(s?.githubOrg, env.GITHUB_ORG),
    signingWorkflowRepo: pick(s?.signingWorkflowRepo, env.SIGNING_WORKFLOW_REPO),
    signingWorkflowPath: pick(s?.signingWorkflowPath, env.SIGNING_WORKFLOW_PATH) ?? ".github/workflows/sign-vex.yml",
    signingCallbackSecret: pick(s?.signingCallbackSecret, env.SIGNING_CALLBACK_SECRET),
    vexRepoName: pick(s?.vexRepoName) ?? "VEX Repository",
    vexRepoDescription: pick(s?.vexRepoDescription) ?? "",
    vexRepoUpdateInterval: pick(s?.vexRepoUpdateInterval) ?? "1h",
    vexRepoPublicUrl: pick(s?.vexRepoPublicUrl, env.VEX_REPO_PUBLIC_URL),
    ghPagesBranch: pick(s?.ghPagesBranch, env.GH_PAGES_BRANCH) ?? "gh-pages",
    ghPagesRepo: pick(s?.ghPagesRepo, env.GH_PAGES_REPO),
    vexRepoSrcPath: pick(s?.vexRepoSrcPath, env.VEX_REPO_SRC_PATH),
    vexRepoDirPath: pick(s?.vexRepoDirPath, env.VEX_REPO_DIR_PATH),
    vexStatementsPath: pick(s?.vexStatementsPath, env.VEX_STATEMENTS_PATH),
    vexDocBaseUrl: pick(s?.vexDocBaseUrl, env.VEX_DOC_BASE_URL) ?? "https://darkedges.com/vex",
  };
}
