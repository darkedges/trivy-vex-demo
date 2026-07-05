import type { Octokit } from "@octokit/rest";

export interface CommitFile {
  path: string;
  /** string = utf-8 text blob, Buffer = binary blob (base64-encoded) */
  content: string | Buffer;
}

/**
 * Atomically commits a set of files to a branch via the Git Data API,
 * creating the branch from the repo's default branch if it doesn't exist yet.
 * Returns the new commit SHA.
 */
export async function commitFilesToBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  files: CommitFile[],
  message: string
): Promise<string> {
  let baseSha: string;
  try {
    const ref = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    baseSha = ref.data.object.sha;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status !== 404) throw err;

    const repoInfo = await octokit.rest.repos.get({ owner, repo });
    const defaultRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${repoInfo.data.default_branch}`,
    });
    baseSha = defaultRef.data.object.sha;
    await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha });
  }

  const baseCommit = await octokit.rest.git.getCommit({ owner, repo, commit_sha: baseSha });
  const baseTreeSha = baseCommit.data.tree.sha;

  const treeItems = await Promise.all(
    files.map(async (file) => {
      const isBuffer = Buffer.isBuffer(file.content);
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: isBuffer ? (file.content as Buffer).toString("base64") : (file.content as string),
        encoding: isBuffer ? "base64" : "utf-8",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.data.sha,
      };
    })
  );

  const newTree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  const newCommit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.data.sha,
    parents: [baseSha],
  });

  await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.data.sha });

  return newCommit.data.sha;
}
