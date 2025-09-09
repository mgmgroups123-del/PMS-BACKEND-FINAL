import express from "express"
import { createLand, deleteLandByUUID, getAllLands, getLandByUUID, updateLandByUUID } from "../../controllers/Land/index.js";
import { AuthVerify } from "../../middelware/authverify.js";

const LandRouter = express.Router();

LandRouter.post("/create",AuthVerify(["owner"]),createLand);
LandRouter.get("/",getAllLands);
LandRouter.get("/:uuid", getLandByUUID);
LandRouter.put("/:uuid",AuthVerify(["owner"]), updateLandByUUID);
LandRouter.delete("/:uuid", AuthVerify(["owner"]),deleteLandByUUID);

export default LandRouter;