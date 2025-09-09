import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_ACCESS_SECRET_KEY,
  },
});

async function test() {
  try {
    const result = await s3.send(new ListBucketsCommand({}));
    console.log("✅ Buckets:", result.Buckets.map(b => b.Name));
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

test();
