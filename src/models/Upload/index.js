import mongoose from "mongoose";
import { CounterModel } from "../Rent/index.js";


const UploadSchema = new mongoose.Schema({
    id: Number,
    uuid: String,
    created: Date,
    modified: Date,
    is_active: {type: Boolean , default: false},
    is_deleted: {type: Boolean , default: false},
    deleted_at: { type: Date, default: null },
    last_accessed_at: { type: Date, default: Date.now }, 
    usage_count: { type: Number, default: 0 },
    file: String,
    created_by: mongoose.Schema.Types.ObjectId ,
    user:mongoose.Schema.Types.ObjectId,
    entity:String
},{ timestamps: true });

UploadSchema.pre("save",async function(next){
    if(!this.id){
    try {
      const sequence = await CounterModel.findOneAndUpdate({_id:"UploadId"},{$inc:{seq:1}},{new:true,upsert:true}) 
      this.id = sequence.seq
      next() 
    } catch (error) {
       next(error)  
    }
   }else{
    next()
   }
})

const Upload = mongoose.model('upload',UploadSchema);

export default Upload
