import { ECRClient, DescribeImagesCommand } from "@aws-sdk/client-ecr";
import { RegistryTag, RegistryError } from "./types";

export async function listEcrTags(repository: string): Promise<RegistryTag[]> {
  const region = process.env.AWS_REGION;
  if (!region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new RegistryError(
      "not_configured",
      "ECR requires AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY to be set"
    );
  }

  const client = new ECRClient({ region });

  try {
    const res = await client.send(new DescribeImagesCommand({ repositoryName: repository, maxResults: 25 }));
    const tags: RegistryTag[] = [];
    for (const image of res.imageDetails ?? []) {
      for (const tag of image.imageTags ?? []) {
        tags.push({
          tag,
          digest: image.imageDigest ?? null,
          lastUpdated: image.imagePushedAt?.toISOString(),
        });
      }
    }
    return tags;
  } catch (err) {
    const name = err instanceof Error ? err.name : undefined;
    if (name === "RepositoryNotFoundException") {
      throw new RegistryError("not_found", `ECR repository ${repository} not found`);
    }
    if (name === "CredentialsProviderError" || name === "UnrecognizedClientException" || name === "InvalidSignatureException") {
      throw new RegistryError("not_configured", "AWS credentials are invalid or not configured for ECR");
    }
    throw new RegistryError("upstream_error", err instanceof Error ? err.message : "ECR request failed");
  }
}
