// Shared TypeScript types for API responses

export interface ProductWithMeta {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ociPurl: string;
  dockerPurl: string | null;
  registryType: string;
  registryUrl: string | null;
  repository: string;
  currentTag: string | null;
  currentDigest: string | null;
  vexRepoPath: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  teams: Array<{
    id: string;
    team: { id: string; name: string; slug: string };
  }>;
  _count: { statements: number; publications?: number };
}
