import express from "express"
import { getLeases, testCron } from "../../controllers/Lease/index.js";

const LeaseRouter = express.Router();

LeaseRouter.get("/", getLeases);
LeaseRouter.post("/test", testCron)

export default LeaseRouter;