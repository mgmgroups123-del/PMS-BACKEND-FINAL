import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Hash } from "@smithy/hash-node";
import dotenv from 'dotenv'

dotenv.config();

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_ACCESS_SECRET_KEY
  },
  forcePathStyle: true,   // ✅ avoids S3 Express
  signingEscapePath: false,
  sha256: Hash.bind(null, "sha256")
});

// Example: list files in the bucket "mgmproperties" inside folder "MGM/"
export async function listFiles() {
  const command = new ListObjectsV2Command({
    Bucket: "mgmpropertiesco",
    Prefix: "staticfiles/pms/"
  });

  const response = await s3.send(command);
  console.log("Files:", response.Contents);
}
