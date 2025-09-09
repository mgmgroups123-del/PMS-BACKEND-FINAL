import express from 'express'
import { ChangeUserPassword, GetUserDetails, LoginUser, RegisterUser, UpdateUser } from '../../controllers/authentication/index.js'
import { AuthVerify } from '../../middelware/authverify.js'
const authroutes = express.Router()

authroutes.post('/register',RegisterUser)
authroutes.post('/login',LoginUser)
authroutes.get('/me',AuthVerify(["owner","admin","manager","finance"]),GetUserDetails)
authroutes.put('/update',AuthVerify(["owner","admin","manager","finance"]),UpdateUser)
authroutes.put('/change-pass',AuthVerify(["owner","admin","manager","finance"]),ChangeUserPassword)
// authroutes.delete()

export default authroutes