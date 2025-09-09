import mongoose from "mongoose";
import { GetUUID } from "../../utils/authhelper.js";

const sessionSchema = new mongoose.Schema({
    uuid:{
        type:String,
    },
    token:{
        type:String,
    },
    iv:{
        type:String,
    },
    userId:{
        type:mongoose.Types.ObjectId,
        ref:"UserModel"
    },
    endDate:{
        type:Date,
        default:Date.now() + 1
    }
},{
    timestamps:true
})

sessionSchema.pre('save',async function(next){
    try {
        if (!this.uuid) {
            this.uuid = await GetUUID()
            next()
        }else{
            next()
        }
    } catch (error) {
        throw error
    }
})

export const sessionModel = mongoose.model("sessionModel",sessionSchema)