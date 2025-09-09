import express from 'express'
import { GetAllActivity, GetByIdActivity } from '../../controllers/activity_log/index.js'
const activityRoute = express.Router()

activityRoute.get('/all',GetAllActivity)
activityRoute.get('/:uuid',GetByIdActivity)

export default activityRoute