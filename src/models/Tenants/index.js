import mongoose, { Schema } from "mongoose";
import { v4 as uuid } from "uuid"

const TenantsSchema = new Schema({
    personal_information: {
        full_name: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        },
        address: {
            type: String,
            required: true
        }
    },
    lease_duration: {
        start_date: {
            type: Date,
            default: null
        },
        end_date: {
            type: Date,
            default: null
        },
        due_date: {
            type: Number,
        }
    },
    emergency_contact: {
        name: {
            type: String
        },
        phone: {
            type: String
        },
        relation: {
            type: String,
            enum: ["spouse", "parent", "sibling", "friend", "other"],
            default: "other"
        }
    },
    tenant_type: {
        type: String,
        enum: ["rent", "lease"],
        default: "rent"
    },
    unit_type: {
        type: String,
        required: true,
        enum: ["unit", "land"]
    },
    unit: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "unit_type"
    },
    rent: {
        type: Number,
    },
    deposit: {
        type: Number
    },
    uuid: {
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
    financial_information: {
        rent:{
            type: Number
        },
        maintenance:{
            type: Number
        },
    },

}, { timestamps: true })

export const TenantModel = mongoose.model("tenant", TenantsSchema)