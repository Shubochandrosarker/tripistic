import crypto from "node:crypto";

type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getS3Config(): S3Config {
  return {
    endpoint: requiredEnv("S3_ENDPOINT").replace(/\/+$/, ""),
    region: process.env.S3_REGION || "auto",
    bucket: requiredEnv("S3_BUCKET"),
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: requiredEnv("S3_PUBLIC_BASE_URL").replace(/\/+$/, ""),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signingKey(secret: string, date: string, region: string) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function publicObjectUrl(key: string, config = getS3Config()) {
  return `${config.publicBaseUrl}/${encodePath(key)}`;
}

export function createPresignedPutUrl({
  key,
  contentType,
  expiresSeconds = 600,
}: {
  key: string;
  contentType: string;
  expiresSeconds?: number;
}) {
  const config = getS3Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const endpoint = new URL(config.endpoint);
  const host = endpoint.host;
  const canonicalUri = config.forcePathStyle
    ? `/${encodePath(config.bucket)}/${encodePath(key)}`
    : `/${encodePath(key)}`;
  const url = new URL(config.forcePathStyle ? `${endpoint.origin}${canonicalUri}` : `${endpoint.protocol}//${config.bucket}.${host}${canonicalUri}`);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const signedHeaders = "content-type;host";

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  });

  const canonicalQuery = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonicalHeaders = `content-type:${contentType}\nhost:${url.host}\n`;
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", signingKey(config.secretAccessKey, dateStamp, config.region))
    .update(stringToSign)
    .digest("hex");

  params.set("X-Amz-Signature", signature);
  url.search = params.toString();
  return { uploadUrl: url.toString(), publicUrl: publicObjectUrl(key, config), expiresAt: new Date(now.getTime() + expiresSeconds * 1000) };
}
