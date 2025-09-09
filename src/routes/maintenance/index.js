import express from 'express'
import { CreateMaintenance, DeleteMaintenance, GetAllMaintenance, GetOneMaintenance, UpdateMaintenance } from '../../controllers/maintenance/index.js'
import { AuthVerify } from '../../middelware/authverify.js'
const maintenanceRoute = express.Router()

maintenanceRoute.post('/create', AuthVerify(["owner","manager"]), CreateMaintenance)
maintenanceRoute.get('/getall',GetAllMaintenance)
maintenanceRoute.get('/get/:uuid',GetOneMaintenance)
maintenanceRoute.put('/update/:uuid',AuthVerify(["owner"]),UpdateMaintenance)
maintenanceRoute.put('/updatestatus/:uuid',AuthVerify(["owner"]),UpdateMaintenance)
maintenanceRoute.delete('/delete/:uuid',AuthVerify(['owner']),DeleteMaintenance)


export default maintenanceRoute