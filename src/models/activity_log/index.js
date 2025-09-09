import mongoose from "mongoose";
import { GetUUID } from "../../utils/authhelper.js";

const activitySchema = new mongoose.Schema({
    id:{
        type:Number,
    },
    uuid:{
        type:String,
    },
    userId:{
        type:mongoose.Types.ObjectId,
        ref:"UserModel"
    },
    action:{
        type:String,
    },
    title:{
        type:String,
    },
    details:{
        type:String,
    },
    is_delete:{
        type:Boolean,
        default:false,
    },
    activity_type:{
        type: String,
        enum: ["property", "unit", "tenant", "rent", "lease","land","maintenance"]
    }
},{
    timestamps:true
})

activitySchema.pre('save',async function(next){
    try {
        if (!this.id) {
            const id = await ActivityLogModel.countDocuments()
            this.id = id + 1;
            this.uuid = await GetUUID()
            next()
        }else{
            next()
        }
    } catch (error) {
        next(error)
    }
})

export const ActivityLogModel = mongoose.model("ActivityLogModel",activitySchema)