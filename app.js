import express from "express";
import dotenv from "dotenv";
import db from "./src/config/database.js";
import bodyParser from "body-parser";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import routes from "./src/routes/index.js";
import http from "http";
import { Server } from "socket.io";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./src/config/bucket.js";
import Mime from "mime-types";

dotenv.config();

const app = express();

app.use(helmet());
app.use(morgan("combined"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://mgmproperties.co.in",
    "https://mgmproperties.co.in",
];
app.use(
    cors({
        origin: allowedOrigins,
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);

app.get("/ping", (req, res) => {
    res.send("Server is healthy");
});

app.use("/api", routes);

function determineContentType(filename) {
    return Mime.lookup(filename) || "application/octet-stream";
}
async function streamS3File(res, bucket, key, download = false) {
    const params = { Bucket: bucket, Key: key };

    try {
        const command = new GetObjectCommand(params);
        const response = await s3.send(command);

        const contentType = determineContentType(key);
        res.set("Content-Type", contentType);

        // 🔑 Fix: allow cross-origin image loading
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Cross-Origin-Resource-Policy", "cross-origin");

        if (download) {
            res.set(
                "Content-Disposition",
                `attachment; filename="${key.split("/").pop()}"`
            );
        }

        response.Body.pipe(res);
    } catch (err) {
        if (err.name === "NoSuchKey") {
            return res.status(404).send("File not found in S3");
        }
        console.error("Error fetching file from S3:", err);
        res.status(500).send("Error fetching file from S3");
    }
}


app.get("/staticfiles/pms/:key", async (req, res) => {
    await streamS3File(res, process.env.AWS_BUCKET_NAME, `staticfiles/pms/${req.params.key}`);
});

app.get("/main/:key", async (req, res) => {
    await streamS3File(res, process.env.AWS_BUCKET_NAME, `main/${req.params.key}`);
});

console.log("AWS Config:", {
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ? "✅ Loaded" : "❌ Missing",
  secretAccessKey: process.env.AWS_ACCESS_SECRET_KEY ? "✅ Loaded" : "❌ Missing",
});

console.log(process.env.AWS_ACCESS_KEY_ID, "", process.env.AWS_ACCESS_SECRET_KEY)

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
    },
});

let onlineUsers = new Map();

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("register", ({ userId, role }) => {
        onlineUsers.set(userId, { socketId: socket.id, role });
        console.log(`User registered: ${userId} (${role})`);
    });

    socket.on("disconnect", () => {
        for (let [userId, session] of onlineUsers.entries()) {
            if (session.socketId === socket.id) {
                onlineUsers.delete(userId);
                console.log(`User disconnected: ${userId}`);
                break;
            }
        }
    });
});

app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err.stack);
    res.status(500).json({ success: false, message: "Internal Server Error" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

export { io, onlineUsers, server };
