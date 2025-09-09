import mongoose, { Schema } from "mongoose";
import { v4 as uuid} from "uuid"

const PropertySchema = new Schema({
    property_name: {
        type: String,
        required: true,
        unique: true
    },
    property_type: {
        type: String,
        enum: ["commercial", "villa", "apartment", "house"],
        required: true,
        default:"commercial"
    },
    // total_units: {
    //     type: String,
    // },
    occupied_units: {
        type: String,
    },
    vacant_units: {
        type: String,
    },
    square_feet: {
        type: String,
        required: true,
    },
    property_address : {
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
}, {timestamps: true})

export const PropertyModel = mongoose.model("property", PropertySchema) 