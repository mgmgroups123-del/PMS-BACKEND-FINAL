import express from 'express'
import { s3 } from '../../config/bucket.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from "dotenv";
import multer from 'multer';
import fs from 'fs'
import Upload from '../../models/Upload/index.js';
import { GetUUID } from '../../utils/authhelper.js';

dotenv.config();

const uploadRouter = express.Router();

const upload = multer();

uploadRouter.post('/', upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        const { user_id, entity } = req.body
        if (file.size > 1048576) {
            return res.status(500).json({ status: "failed", message: "upload file lesser than 1mb", data: null });
        }
        const uuid = await GetUUID();
        const file_name = uuid + "." + file.originalname.split(".").slice(-1)[0];
        console.log("File_name", file_name)
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: "staticfiles/pms/" + file_name,
            Body: file.buffer,
            ContentType: "Mimetype",
        };
        console.log("came before sending");

        const data = await s3.send(new PutObjectCommand(params));
        console.log("came after sending");

        const uuid1 = await GetUUID();

        const fileDataUrl = `staticfiles/pms/${file_name}`
        // const save_file_name = new Upload({ file: params.Key, uuid: uuid1,user:'68bbf79c6fdf3d22f86710c1',entity:'image' });
        // await save_file_name.save();
        res.status(200).json({
            status: "success", message: "file upload successfully", 
            data: fileDataUrl
        });
    } catch (error) {
        res.status(500).json({ status: "failed", message: error.message, data: null });
    }
});

export default uploadRouter;