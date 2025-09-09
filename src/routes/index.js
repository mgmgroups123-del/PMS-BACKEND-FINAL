import express from "express"
import PropertyRouter from "./Properties/index.js"
import authroutes from "./authentication/index.js"
import UnitRouter from "./Units/index.js"
import TenantRouter from "./Tenants/index.js"
import RentRouter from "./Rent/index.js"
import LeaseRouter from "./Lease/index.js"
import maintenanceRoute from "./maintenance/index.js"
import LandRouter from "./Land/index.js"
import DashBoardRouter from "./Dashboard/index.js"
import activityRoute from "./activity_log/index.js"
import NotifyRouter from "./Notification/index.js"
import uploadRouter from "./Upload/index.js"
// import uploadRouter from "./upload/index.js"

const routes = express.Router()

routes.use("/property", PropertyRouter)
routes.use('/auth',authroutes)
routes.use('/unit', UnitRouter)
routes.use('/tenant', TenantRouter)
routes.use('/rent', RentRouter)
routes.use('/lease', LeaseRouter)
routes.use('/maintenance',maintenanceRoute)
routes.use('/land', LandRouter)
routes.use("/dashboard", DashBoardRouter)
routes.use('/activity',activityRoute)
routes.use("/notification", NotifyRouter)
routes.use("/upload", uploadRouter)

export default routes