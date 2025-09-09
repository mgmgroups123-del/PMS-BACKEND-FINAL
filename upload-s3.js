import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./src/config/bucket.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const uploadFile = async () => {
  try {
    // point to your test file inside public
    const filePath = path.resolve("./public/MGM_Logo.png");

    // read the file
    const fileContent = fs.readFileSync(filePath);

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: "staticfiles/pms/test.png", // S3 path
      Body: fileContent,
      ContentType: "image/png",
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);

    console.log("✅ File uploaded successfully to S3!");
  } catch (err) {
    console.error("❌ Error uploading file:", err);
  }
};

uploadFile();
