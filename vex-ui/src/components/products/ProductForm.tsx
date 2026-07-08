"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, inputClass } from "@/components/ui/form";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  description: z.string().max(500).optional(),
  ociPurl: z.string().min(1, "OCI PURL is required"),
  dockerPurl: z.string().optional(),
  registryType: z.enum(["dockerhub", "ghcr", "ecr", "gcr", "acr", "generic"]),
  registryUrl: z.string().optional(),
  repository: z.string().min(1, "Repository is required"),
  currentTag: z.string().optional(),
  currentDigest: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ProductForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { registryType: "dockerhub" },
  });

  const name = watch("name");
  const registryType = watch("registryType");

  function autoSlug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function onSubmit(data: FormValues) {
    setError(null);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to create product");
      return;
    }
    const product = await res.json();
    router.push(`/products/${product.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-lg">
      <Field label="Product Name" error={errors.name?.message}>
        <input
          {...register("name", {
            onChange: (e) => setValue("slug", autoSlug(e.target.value)),
          })}
          className={inputClass}
          placeholder="PingAccess"
        />
      </Field>

      <Field label="Slug" error={errors.slug?.message} hint="URL-safe identifier (auto-filled from name)">
        <input {...register("slug")} className={inputClass} placeholder="pingaccess" />
      </Field>

      <Field label="Description" error={errors.description?.message}>
        <textarea {...register("description")} className={inputClass} rows={2} placeholder="Optional" />
      </Field>

      <Field label="Registry Type" error={errors.registryType?.message}>
        <select {...register("registryType")} className={inputClass}>
          <option value="dockerhub">Docker Hub</option>
          <option value="ghcr">GitHub Container Registry (ghcr.io)</option>
          <option value="ecr">AWS ECR</option>
          <option value="gcr">Google Container Registry</option>
          <option value="acr">Azure Container Registry</option>
          <option value="generic">Generic OCI Registry</option>
        </select>
      </Field>

      {registryType !== "dockerhub" && (
        <Field label="Registry URL" error={errors.registryUrl?.message} hint="Base URL e.g. ghcr.io">
          <input {...register("registryUrl")} className={inputClass} placeholder="ghcr.io" />
        </Field>
      )}

      <Field label="Repository" error={errors.repository?.message} hint="e.g. pingidentity/pingaccess">
        <input {...register("repository")} className={inputClass} placeholder="pingidentity/pingaccess" />
      </Field>

      <Field label="Current Tag" error={errors.currentTag?.message}>
        <input {...register("currentTag")} className={inputClass} placeholder="8.3.4-edge" />
      </Field>

      <Field label="Current Digest" error={errors.currentDigest?.message} hint="sha256:... from registry">
        <input {...register("currentDigest")} className={inputClass} placeholder="sha256:01e8aa…" />
      </Field>

      <Field label="OCI PURL (Trivy / Wiz)" error={errors.ociPurl?.message} hint="pkg:oci/…@sha256:…">
        <input {...register("ociPurl")} className={inputClass} placeholder="pkg:oci/pingidentity/pingaccess@sha256:..." />
      </Field>

      <Field label="Docker PURL (Scout)" error={errors.dockerPurl?.message} hint="pkg:docker/…@tag">
        <input {...register("dockerPurl")} className={inputClass} placeholder="pkg:docker/pingidentity/pingaccess@8.3.4-edge" />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? "Creating…" : "Create Product"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
