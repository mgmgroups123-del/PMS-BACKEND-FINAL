import express from "express"
import { createUnit, deleteUnitByUUID, getAllUnits, getUnitByUUID, getUnitsPropertyId, updateUnitByUUID } from "../../controllers/Units/index.js";
import { AuthVerify } from "../../middelware/authverify.js";

const UnitRouter = express.Router();

UnitRouter.post("/create",AuthVerify(["owner", "admin"]), createUnit)
UnitRouter.get("/", getAllUnits)
UnitRouter.get("/get/:id", getUnitsPropertyId)
UnitRouter.put("/:uuid", updateUnitByUUID)
UnitRouter.delete("/:uuid",AuthVerify(["owner"]), deleteUnitByUUID)

export default UnitRouter;