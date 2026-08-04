import * as AwsS3Module from "@aws-sdk/client-s3";
import type { S3Client as S3ClientType } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// `tsx` carica alcune versioni AWS SDK CJS sotto `default`; Next.js usa named exports.
const AwsS3 = (
  "S3Client" in AwsS3Module
    ? AwsS3Module
    : (AwsS3Module as unknown as { default: typeof AwsS3Module }).default
) as typeof AwsS3Module;
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} = AwsS3;

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET = process.env.R2_BUCKET ?? "";
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ??
  (R2_ACCOUNT_ID
    ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "");

let client: S3ClientType | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_ENDPOINT
  );
}

function getClient(): S3ClientType {
  if (!isR2Configured()) {
    throw new Error("R2 non configurato");
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export function buildStorageKey(
  entity: string,
  entityId: string,
  ext: string
): string {
  const safeExt = ext.replace(/^\./, "").toLowerCase().slice(0, 10);
  return `${entity}/${entityId}/${randomUUID()}.${safeExt}`;
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  mimeType: string
): Promise<void> {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeType,
    })
  );
}

export async function getPresignedUploadUrl(
  key: string,
  mimeType: string,
  expiresIn = 3600
): Promise<string> {
  const s3 = getClient();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: mimeType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const s3 = getClient();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function headR2Object(key: string): Promise<boolean> {
  const s3 = getClient();
  try {
    await s3.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })
    );
    return true;
  } catch {
    return false;
  }
}

export async function downloadFromR2(key: string): Promise<Buffer> {
  const s3 = getClient();
  const res = await s3.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("File vuoto");
  return Buffer.from(bytes);
}
