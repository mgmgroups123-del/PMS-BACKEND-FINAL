import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
    uuid:{
        type:String,
        required:true,
        unique:true,
    },
    first_name:{
        type:String,
        required:true,
    },
    last_name:{
        type:String,
    },
    email:{
        type:String,
        required:true,
    },
    phone_number:{
        type:String,
    },
    address:{
        type:String,
    },
    password:{
        type:String,
        required:true,
    },
    image:{
        type:String,
        default:''
    },
    role:{
        type:String,
        enum:["owner","admin","manager","finance"],
    },
    is_two_completed:{
        type:Boolean,
        default:false,
    },
    is_active:{
        type:Boolean,
        default:true,
    },
    is_delete:{
        type:Boolean,
        default:false,
    }
},{
    timestamps:true
})

export const UserModel = mongoose.model("UserModel",userSchema)