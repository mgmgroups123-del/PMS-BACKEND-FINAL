import express from "express"
import { deleteNotify, markedAsAllRead, markedAsRead, notificationGetAll } from "../../controllers/Notification/index.js";
import { AuthVerify } from "../../middelware/authverify.js";

const NotifyRouter = express.Router();

NotifyRouter.get("/", AuthVerify(["owner", "admin", "manager"]), notificationGetAll)
NotifyRouter.put("/:uuid", markedAsRead)
NotifyRouter.delete("/:uuid", AuthVerify(["owner"]), deleteNotify)
NotifyRouter.put("/read/all", markedAsAllRead)

export default NotifyRouter