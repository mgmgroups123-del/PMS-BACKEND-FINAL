import mongoose, { Schema } from "mongoose";
import { v4 as uuid} from "uuid"

const LandSchema = new Schema({
    land_name: {
        type: String,
        required: true,
        unique: true
    },
    square_feet: {
        type: String,
        required: true,
    },
    acre: {
        type: String,
        required: true,
    },
    cent: {
        type: String,
        required: true,
    },
    land_address : {
        type: String,
        required: true,
    },
    owner_information: {
        full_name : {
            type: String,
            required: true
        },
        email : {
            type: String,
            required: true
        },
        phone : {
            type: String,
            required: true
        },
        address : {
            type: String,
            required: true
        }
    },
    uuid:{
        type: String,
        default: uuid
    },
    is_active: {
        type: Boolean,
        default: true
    },
    is_deleted: {
        type: Boolean,
        default: false
    },
    image: {
        type: String,
        default: null
    }
    
},{timestamps: true})

export const LandModel = mongoose.model("land", LandSchema)