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
