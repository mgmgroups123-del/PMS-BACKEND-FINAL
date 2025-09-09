import { UserModel } from "../models/authentication/index.js";
import { JWTDecoded } from "../utils/authhelper.js";

export const AuthVerify=(resource=[])=>async(req,res,next)=>{
   
    try {
        const token = req.headers['authorization'];

        if (!token) {
            return res.status(500).json({ status: "failed", message: "Authentication credentials not provided" });
        }

        const decoded = await JWTDecoded(token)
        console.log("decoded", decoded)

        console.log(decoded,"token come in verify")

        if (decoded.status === "failed" && decoded.message === "jwt expired") {
            return res.status(401).json({message: "Your session has expired. Please log in again", status: "session_expired" });
        }
        if (decoded.status === "failed") {
            return res.status(401).json({message: decoded.message, status: "session_expired"})
        }
        
        if (decoded.role === "owner" && resource.includes(decoded.role)) {
            const user = await UserModel.findOne({uuid:decoded.uuid}).select("-password")
            if (!user) {
                return res.status(401).json({
                    success:false,
                    status: "failed",
                    message: "User not found.",
                    details: "The requested user does not exist in the system."
                });
            }

            req.user = user
            next()
        }else if (decoded.role === "admin" && resource.includes(decoded.role)){
            const user = await UserModel.findOne({uuid:decoded.uuid}).select("-password")
            if (!user) {
                return res.status(401).json({
                    success:false,
                    status: "failed",
                    message: "User not found.",
                    details: "The requested user does not exist in the system."
                });
            }

            req.user = user
            next()
        }else if (decoded.role === "manager" && resource.includes(decoded.role)) {
            const user = await UserModel.findOne({uuid:decoded.uuid}).select("-password")
            if (!user) {
                return res.status(401).json({
                    success:false,
                    status: "failed",
                    message: "User not found.",
                    details: "The requested user does not exist in the system."
                });
            }

            req.user = user
            next()
        }else if (decoded.role === "finance" && resource.includes(decoded.role)) {
            const user = await UserModel.findOne({uuid:decoded.uuid}).select("-password")
            if (!user) {
                return res.status(401).json({
                    success:false,
                    status: "failed",
                    message: "User not found.",
                    details: "The requested user does not exist in the system."
                });
            }

            req.user = user
            next()
        }else{
            return res.status(401).json({ message: "your not allow to access", status: "not_permitted" });
        }

    } catch (error) {
        res.status(500).json({ status: "failed", message: error.message, data: null });
    }
}