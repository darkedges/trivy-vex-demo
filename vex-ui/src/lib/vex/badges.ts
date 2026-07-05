export const statusColors: Record<string, string> = {
  NOT_AFFECTED: "bg-green-100 text-green-700",
  AFFECTED: "bg-red-100 text-red-700",
  FIXED: "bg-blue-100 text-blue-700",
  UNDER_INVESTIGATION: "bg-yellow-100 text-yellow-700",
};

export const workflowColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_APPROVAL: "bg-orange-100 text-orange-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  PUBLISHED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-red-100 text-red-700",
};

export const publicationStateColors: Record<string, string> = {
  PENDING_SIGNING: "bg-gray-100 text-gray-700",
  SIGNING_IN_PROGRESS: "bg-orange-100 text-orange-700",
  SIGNING_FAILED: "bg-red-100 text-red-700",
  SIGNED: "bg-emerald-100 text-emerald-700",
  PUBLISHING: "bg-orange-100 text-orange-700",
  PUBLISHED: "bg-blue-100 text-blue-700",
  PUBLISH_FAILED: "bg-red-100 text-red-700",
};
