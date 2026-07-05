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

export interface TeamWithMeta {
  id: string;
  name: string;
  slug: string;
  githubTeamId: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { members: number; products: number };
}

export interface StatementWithMeta {
  id: string;
  productId: string;
  vexDocId: string;
  vulnerabilityId: string;
  status: "NOT_AFFECTED" | "AFFECTED" | "FIXED" | "UNDER_INVESTIGATION";
  justification: string | null;
  statusNotes: string | null;
  productsJson: string;
  author: string;
  docVersion: number;
  statementTimestamp: string;
  workflowState: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED" | "REJECTED";
  createdById: string;
  approvedById: string | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettingsData {
  id: string;
  githubOrg: string | null;
  signingWorkflowRepo: string | null;
  signingWorkflowPath: string | null;
  signingCallbackSecret: string | null;
  vexRepoName: string | null;
  vexRepoDescription: string | null;
  vexRepoUpdateInterval: string;
  vexRepoPublicUrl: string | null;
  ghPagesBranch: string;
  ghPagesRepo: string | null;
  vexRepoSrcPath: string | null;
  vexRepoDirPath: string | null;
  vexStatementsPath: string | null;
  vexDocBaseUrl: string;
  updatedAt: string;
}
