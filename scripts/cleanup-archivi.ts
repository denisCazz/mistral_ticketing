import "dotenv/config";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "../src/lib/db";

const ARCHIVE_EXTS = ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2"];

async function main() {
  const docs = await prisma.documento.findMany({
    select: {
      id: true,
      titoloOriginale: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
    },
  });

  const archives = docs.filter((d) => {
    const name = d.titoloOriginale.toLowerCase();
    const key = d.storageKey.toLowerCase();
    const mime = d.mimeType.toLowerCase();
    return ARCHIVE_EXTS.some(
      (ext) =>
        name.endsWith(`.${ext}`) ||
        key.endsWith(`.${ext}`) ||
        mime.includes(ext)
    );
  });

  console.log(`Archivi in DB: ${archives.length}`);
  if (archives.length === 0) {
    await prisma.$disconnect();
    return;
  }

  for (const a of archives) {
    console.log(`- ${a.titoloOriginale} (${a.sizeBytes} bytes)`);
  }

  const accountId = process.env.R2_ACCOUNT_ID ?? "";
  const bucket = process.env.R2_BUCKET ?? "";
  const endpoint =
    process.env.R2_ENDPOINT ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const canDeleteR2 = Boolean(
    process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      bucket &&
      endpoint
  );

  const s3 = canDeleteR2
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      })
    : null;

  for (const doc of archives) {
    await prisma.scadenza.deleteMany({ where: { documentoId: doc.id } });
    await prisma.documento.delete({ where: { id: doc.id } });

    if (s3) {
      try {
        await s3.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: doc.storageKey })
        );
        console.log(`R2 deleted: ${doc.storageKey}`);
      } catch (err) {
        console.warn(`R2 delete failed ${doc.storageKey}:`, err);
      }
    }
  }

  console.log(`Rimossi ${archives.length} archivi da DB${s3 ? " + R2" : ""}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
