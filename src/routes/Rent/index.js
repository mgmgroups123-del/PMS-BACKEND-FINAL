import express from "express"
import { deleteRent, downloadAllRentPDF, downloadRentExcel, downloadRentPDF, getRents, markRentPaidByUUID } from "../../controllers/Rent/index.js";
import { AuthVerify } from "../../middelware/authverify.js";

const RentRouter = express.Router();

RentRouter.get("/", getRents);
RentRouter.put("/:uuid", AuthVerify(["owner","manager"]),markRentPaidByUUID)
RentRouter.get("/download/pdf/:uuid", downloadRentPDF)
RentRouter.get("/download/excel", downloadRentExcel)
RentRouter.delete("/delete/:uuid", AuthVerify(["owner"]), deleteRent)
RentRouter.get("/download/all/pdf", downloadAllRentPDF)

export default RentRouter;