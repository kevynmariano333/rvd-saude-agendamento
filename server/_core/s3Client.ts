import { S3Client } from "@aws-sdk/client-s3";
import { ENV } from "./env";

let _client: S3Client | null = null;

export function isS3Configured(): boolean {
  return Boolean(ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey);
}

export function getS3Client(): S3Client {
  if (!isS3Configured()) {
    throw new Error(
      "Storage config missing: set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
    );
  }
  if (!_client) {
    _client = new S3Client({
      region: ENV.s3Region,
      endpoint: ENV.s3Endpoint || undefined,
      forcePathStyle: ENV.s3ForcePathStyle,
      credentials: {
        accessKeyId: ENV.s3AccessKeyId,
        secretAccessKey: ENV.s3SecretAccessKey,
      },
    });
  }
  return _client;
}

/**
 * Log the shape of the storage config at boot — never the values. A rejected
 * upload is otherwise indistinguishable between a swapped key pair, a stray
 * character in a paste, and an endpoint pointing at another account, none of
 * which can be told apart from the "Unauthorized" that R2 returns.
 */
export function logStorageConfig(): void {
  if (!ENV.s3Bucket && !ENV.s3AccessKeyId && !ENV.s3SecretAccessKey) {
    console.warn("[Storage] nenhuma variavel S3 configurada — upload de XML vai falhar");
    return;
  }

  const accountFromEndpoint = /^https:\/\/([0-9a-f]{32})\.r2\.cloudflarestorage\.com\/?$/i.exec(
    ENV.s3Endpoint,
  )?.[1];

  console.log("[Storage] configuracao:", {
    bucket: ENV.s3Bucket || "(vazio)",
    endpoint: ENV.s3Endpoint || "(vazio)",
    region: ENV.s3Region,
    forcePathStyle: ENV.s3ForcePathStyle,
    accessKeyIdLen: ENV.s3AccessKeyId.length,
    secretAccessKeyLen: ENV.s3SecretAccessKey.length,
  });

  // Cloudflare R2 issues a 32-char access key id and a 64-char secret. Any other
  // shape means the wrong value landed in the field.
  if (ENV.s3AccessKeyId.length === ENV.s3SecretAccessKey.length) {
    console.warn(
      "[Storage] ATENCAO: S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY tem o mesmo tamanho — " +
        "provavelmente o mesmo valor foi colado nos dois campos.",
    );
  }
  if (ENV.s3Endpoint.includes("r2.cloudflarestorage.com")) {
    if (ENV.s3AccessKeyId.length !== 32) {
      console.warn(
        `[Storage] ATENCAO: no R2 o Access Key ID tem 32 caracteres, este tem ${ENV.s3AccessKeyId.length}.`,
      );
    }
    if (ENV.s3SecretAccessKey.length !== 64) {
      console.warn(
        `[Storage] ATENCAO: no R2 a Secret Access Key tem 64 caracteres, esta tem ${ENV.s3SecretAccessKey.length}.`,
      );
    }
    if (ENV.s3Endpoint.replace(/\/+$/, "").endsWith(`/${ENV.s3Bucket}`)) {
      console.warn(
        "[Storage] ATENCAO: S3_ENDPOINT termina com o nome do bucket — ele deve conter apenas o account id.",
      );
    }
    if (!accountFromEndpoint) {
      console.warn(
        "[Storage] ATENCAO: S3_ENDPOINT nao tem o formato https://<account-id>.r2.cloudflarestorage.com",
      );
    }
  }
}
