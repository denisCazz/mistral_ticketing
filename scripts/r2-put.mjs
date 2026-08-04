import { readFile } from "node:fs/promises";
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const [filePath, storageKey, mimeType] = process.argv.slice(2);

if (!filePath || !storageKey || !mimeType) {
  throw new Error("Uso: r2-put.mjs <filePath> <storageKey> <mimeType>");
}

const endpoint =
  process.env.R2_ENDPOINT ??
  (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "");
const bucket = process.env.R2_BUCKET;

if (
  !endpoint ||
  !bucket ||
  !process.env.R2_ACCESS_KEY_ID ||
  !process.env.R2_SECRET_ACCESS_KEY
) {
  throw new Error("R2 non configurato");
}

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

let exists = false;
try {
  await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: storageKey })
  );
  exists = true;
} catch (error) {
  const status = error?.$metadata?.httpStatusCode;
  if (status && status !== 404) throw error;
}

if (exists) {
  process.stdout.write("existing");
} else {
  const body = await readFile(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: body,
      ContentType: mimeType,
    })
  );
  process.stdout.write("uploaded");
}
