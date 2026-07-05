import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "tar";

export interface RepoFile {
  /** Path relative to pkg/, e.g. "oci/pingaccess/vex.json" */
  path: string;
  content: string;
}

/**
 * Builds a vex-repo-spec v0.1 archive — index.json + pkg/ at the archive root,
 * gzipped — matching `tar -czf vex-data.tar.gz index.json pkg` from
 * scripts/generate-vex.sh exactly.
 */
export async function buildVexRepoArchive(indexJson: string, pkgFiles: RepoFile[]): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "vex-repo-"));
  try {
    await writeFile(path.join(dir, "index.json"), indexJson, "utf8");

    for (const file of pkgFiles) {
      const fullPath = path.join(dir, "pkg", file.path);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, "utf8");
    }

    const archivePath = path.join(dir, "vex-data.tar.gz");
    await create({ gzip: true, cwd: dir, file: archivePath }, ["index.json", "pkg"]);
    return await readFile(archivePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
