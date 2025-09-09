import express from "express"
import { AuthVerify } from "../../middelware/authverify.js";
import { createProperty, deletePropertyByUUID, getAllProperties, getPropertyByUUID, getPropertyType, updatePropertyByUUID } from "../../controllers/Properties/index.js";

const PropertyRouter = express.Router();

PropertyRouter.post("/create", AuthVerify(["owner"]), createProperty);
PropertyRouter.get("/get", getPropertyType)
PropertyRouter.get("/", getAllProperties);
PropertyRouter.get("/:uuid", getPropertyByUUID);
PropertyRouter.put("/:uuid", AuthVerify(["owner"]), updatePropertyByUUID);
PropertyRouter.delete("/:uuid", AuthVerify(["owner"]), deletePropertyByUUID);

export default PropertyRouter;