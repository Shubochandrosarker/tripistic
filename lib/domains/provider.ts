import { Prisma } from "@prisma/client";

export type ProviderHostname = {
  id: string | null;
  hostname: string;
  status: "pending" | "active" | "failed";
  sslStatus: "pending" | "active" | "failed";
  verificationName?: string | null;
  verificationValue?: string | null;
  httpUrl?: string | null;
  httpBody?: string | null;
  errors?: string[];
  message?: string | null;
};

export interface CustomHostnameProvider {
  readonly name: string;
  create(hostname: string): Promise<ProviderHostname>;
  get(providerId: string): Promise<ProviderHostname>;
  remove(providerId: string): Promise<void>;
}

type CloudflareCustomHostnameResponse = {
  id: string;
  hostname: string;
  status: string;
  verification_errors?: string[];
  ownership_verification?: { type?: string; name?: string; value?: string };
  ownership_verification_http?: { http_url?: string; http_body?: string };
  ssl?: {
    status?: string;
    validation_errors?: Array<{ message?: string } | string>;
  };
};

type CloudflareEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result: T;
};

function cloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID);
}

function mapStatus(status: string | undefined): ProviderHostname["status"] {
  if (status === "active") return "active";
  if (status === "deleted" || status === "blocked" || status === "failed") return "failed";
  return "pending";
}

function mapSslStatus(status: string | undefined): ProviderHostname["sslStatus"] {
  if (status === "active") return "active";
  if (status === "deleted" || status === "expired" || status === "failed") return "failed";
  return "pending";
}

function extractErrors(result: CloudflareCustomHostnameResponse) {
  return [
    ...(result.verification_errors ?? []),
    ...(result.ssl?.validation_errors ?? []).map((error) => (typeof error === "string" ? error : (error.message ?? "SSL validation error"))),
  ];
}

function mapCloudflareHostname(result: CloudflareCustomHostnameResponse): ProviderHostname {
  const errors = extractErrors(result);
  return {
    id: result.id,
    hostname: result.hostname,
    status: mapStatus(result.status),
    sslStatus: mapSslStatus(result.ssl?.status),
    verificationName: result.ownership_verification?.name ?? null,
    verificationValue: result.ownership_verification?.value ?? null,
    httpUrl: result.ownership_verification_http?.http_url ?? null,
    httpBody: result.ownership_verification_http?.http_body ?? null,
    errors,
    message: errors.length > 0 ? errors.join("; ") : null,
  };
}

class CloudflareHostnameProvider implements CustomHostnameProvider {
  readonly name = "cloudflare";

  private endpoint(path: string) {
    return `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}${path}`;
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(this.endpoint(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => null)) as CloudflareEnvelope<T> | null;
    if (!response.ok || !payload?.success) {
      const message = payload?.errors?.map((error) => error.message).filter(Boolean).join("; ") || "Cloudflare Custom Hostname request failed.";
      throw new Error(message);
    }
    return payload.result;
  }

  async create(hostname: string): Promise<ProviderHostname> {
    const result = await this.request<CloudflareCustomHostnameResponse>("/custom_hostnames", {
      method: "POST",
      body: JSON.stringify({
        hostname,
        ssl: {
          method: process.env.CLOUDFLARE_CUSTOM_HOSTNAME_DCV_METHOD || "txt",
          type: "dv",
          settings: {
            http2: "on",
            min_tls_version: "1.2",
          },
        },
        custom_metadata: {
          app: "tripistic",
        },
      }),
    });
    return mapCloudflareHostname(result);
  }

  async get(providerId: string): Promise<ProviderHostname> {
    return mapCloudflareHostname(await this.request<CloudflareCustomHostnameResponse>(`/custom_hostnames/${providerId}`));
  }

  async remove(providerId: string): Promise<void> {
    await this.request<unknown>(`/custom_hostnames/${providerId}`, { method: "DELETE" });
  }
}

class ManualHostnameProvider implements CustomHostnameProvider {
  readonly name = "manual";

  async create(hostname: string): Promise<ProviderHostname> {
    return {
      id: null,
      hostname,
      status: "pending",
      sslStatus: "pending",
      errors: [],
      message: "Manual provider mode: configure the custom hostname in the edge provider.",
    };
  }

  async get(providerId: string): Promise<ProviderHostname> {
    return {
      id: providerId,
      hostname: providerId,
      status: "pending",
      sslStatus: "pending",
      errors: [],
      message: "Manual provider mode has no remote status API.",
    };
  }

  async remove(): Promise<void> {
    return;
  }
}

export function providerErrorsJson(errors: string[] | undefined): Prisma.InputJsonArray {
  return (errors ?? []) as Prisma.InputJsonArray;
}

export function getCustomHostnameProvider(): CustomHostnameProvider {
  return cloudflareConfigured() ? new CloudflareHostnameProvider() : new ManualHostnameProvider();
}
