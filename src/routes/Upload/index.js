import express from 'express';
import { s3 } from '../../config/bucket.js';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import dotenv from "dotenv";
import multer from 'multer';
import { pipeline } from "stream";
import { promisify } from "util";
import { GetUUID } from '../../utils/authhelper.js';

dotenv.config();

const uploadRouter = express.Router();
const upload = multer();
const streamPipeline = promisify(pipeline);

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const REGION = process.env.AWS_REGION;

/**
 * Upload file to S3
 */
uploadRouter.post('/', upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { user_id, entity } = req.body;

    // Validate file size (1 MB max)
    if (file.size > 1048576) {
      return res.status(400).json({
        status: "failed",
        message: "Upload file must be less than 1 MB",
        data: null
      });
    }

    const uuid = await GetUUID();
    const extension = file.originalname.split(".").pop();
    const file_name = `${uuid}.${extension}`;

    const params = {
      Bucket: BUCKET_NAME,
      Key: `staticfiles/pms/${file_name}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    // Upload to S3
    await s3.send(new PutObjectCommand(params));

    // Full S3 URL
    const fileUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/staticfiles/pms/${file_name}`;

    return res.status(200).json({
      status: "success",
      message: "File uploaded successfully",
      data: fileUrl
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      status: "failed",
      message: error.message,
      data: null
    });
  }
});

/**
 * Optional: Serve files via backend (proxy S3)
 * Example: http://localhost:3002/staticfiles/pms/<filename>
 */
uploadRouter.get('/staticfiles/:folder/:filename', async (req, res) => {
  try {
    const { folder, filename } = req.params;
    const key = `staticfiles/${folder}/${filename}`;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const s3Response = await s3.send(command);

    res.setHeader("Content-Type", s3Response.ContentType || "application/octet-stream");
    await streamPipeline(s3Response.Body, res);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(404).json({ error: "File not found or access denied" });
  }
});

export default uploadRouter;
