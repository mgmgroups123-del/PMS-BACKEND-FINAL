import mongoose, { Schema } from "mongoose";
import { v4 as uuid } from "uuid";

const RentsSchema = new Schema({
    uuid: {
        type: String,
        default: uuid
    },
    tenantId: {
        type: mongoose.Types.ObjectId,
        required: true,
        ref: "tenant"
    },
    receiptId: {
        type: String,
        unique: true
    },
    paymentDueDay: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["paid", "pending", "overdue"],
        default: "pending"
    },
    reminderShown: {
        type: Boolean,
        default: false
    },
    is_active: {
        type: Boolean,
        default: true
    },
    is_deleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });



const CounterSchema = new Schema({
    name: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 }
});

export const CounterModel = mongoose.model("counter", CounterSchema);

RentsSchema.pre("save", async function (next) {
    if (this.isNew) {
        const counter = await CounterModel.findOneAndUpdate(
            { name: "receiptId" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        this.receiptId = `RCPT-${counter.seq.toString().padStart(4, "0")}`;
    }
    next();
});

export const RentsModel = mongoose.model("rent", RentsSchema);
