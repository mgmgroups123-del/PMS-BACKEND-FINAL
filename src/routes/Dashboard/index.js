import express from "express"
import { dashBoardReports, getOccupancyStats } from "../../controllers/Dashboard/index.js";
import { UserModel } from "../../models/authentication/index.js";
import { PropertyModel } from "../../models/Properties/index.js";
import { TenantModel } from "../../models/Tenants/index.js";
import { LandModel } from "../../models/Land/index.js";

const DashBoardRouter = express.Router();

DashBoardRouter.get("/report", dashBoardReports)
DashBoardRouter.get("/occupancy/report", getOccupancyStats)
DashBoardRouter.get("/get-global-search", async (req, res) => {
    const q = req.query.query;
    if (!q) return res.json({ users: [], properties: [], tenants: [] });

    try {
        const lands = await LandModel.find({land_name: new RegExp(q, "i")}).limit(5)
        const properties = await PropertyModel.find({ property_name: new RegExp(q, "i") }).limit(5);
        const tenants = await TenantModel.find({ "personal_information.full_name": new RegExp(q, "i") }).limit(5);

        res.status(200).json({ lands, properties, tenants });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
})

export default DashBoardRouter;