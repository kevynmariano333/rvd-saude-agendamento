// File storage helpers backed by any S3-compatible bucket (AWS S3,
// Cloudflare R2, MinIO, ...). Uploads go straight to the bucket; downloads
// are served through /manus-storage/{key}, which redirects to a short-lived
// signed GET URL (see server/_core/storageProxy.ts).

import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";
import { getS3Client } from "./_core/s3Client";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

// The raw S3/R2 rejection is an opaque "Unauthorized"/"AccessDenied", which
// reaches the user as-is and looks like a login problem. Restate it as what it
// actually is: the bucket credentials are wrong or lack access to the bucket.
function describeStorageError(err: unknown): Error {
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  const name = (err as { name?: string })?.name ?? "";
  const message = err instanceof Error ? err.message : String(err);

  if (status === 401 || status === 403 || /Unauthorized|AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch/i.test(`${name} ${message}`)) {
    return new Error(
      `O armazenamento de arquivos recusou as credenciais (${message}). ` +
        `Confira S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT e se o token ` +
        `tem permissao de leitura/escrita no bucket "${ENV.s3Bucket}".`,
    );
  }

  if (status === 404 || /NoSuchBucket/i.test(`${name} ${message}`)) {
    return new Error(
      `O bucket "${ENV.s3Bucket}" nao foi encontrado no endpoint configurado. ` +
        `Confira S3_BUCKET e S3_ENDPOINT.`,
    );
  }

  return err instanceof Error ? err : new Error(message);
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const client = getS3Client();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: ENV.s3Bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  } catch (err) {
    console.error("[Storage] upload failed:", err);
    throw describeStorageError(err);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const client = getS3Client();
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }),
      { expiresIn: 300 },
    );
  } catch (err) {
    console.error("[Storage] signed url failed:", err);
    throw describeStorageError(err);
  }
}
