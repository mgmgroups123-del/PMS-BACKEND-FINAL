import express from "express"
import { AuthVerify } from "../../middelware/authverify.js";
import { createProperty, deletePropertyByUUID, getAllProperties, getAllPropertiesReport, getAllPropertiesReportPdf, getPropertyByUUID, getPropertyType, updatePropertyByUUID } from "../../controllers/Properties/index.js";

const PropertyRouter = express.Router();

PropertyRouter.post("/create", AuthVerify(["owner"]), createProperty);
PropertyRouter.get("/get", getPropertyType)
PropertyRouter.get("/", getAllProperties);
PropertyRouter.get("/:uuid", getPropertyByUUID);
PropertyRouter.put("/:uuid", AuthVerify(["owner"]), updatePropertyByUUID);
PropertyRouter.delete("/:uuid", AuthVerify(["owner"]), deletePropertyByUUID);
PropertyRouter.get("/report/all", getAllPropertiesReport);
PropertyRouter.get("/report/download", getAllPropertiesReportPdf);

export default PropertyRouter;