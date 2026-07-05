export interface RegistryTag {
  tag: string;
  digest: string | null;
  lastUpdated?: string;
}

export type RegistryErrorCode = "not_configured" | "not_found" | "upstream_error";

export class RegistryError extends Error {
  code: RegistryErrorCode;

  constructor(code: RegistryErrorCode, message: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
  }
}
