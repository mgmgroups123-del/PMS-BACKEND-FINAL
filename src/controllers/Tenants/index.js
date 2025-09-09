import { ActivityLogModel } from "../../models/activity_log/index.js";
import moment from "moment";
import { PropertyModel } from "../../models/Properties/index.js";
import { RentsModel } from "../../models/Rent/index.js";
import { TenantModel } from "../../models/Tenants/index.js";
import { UnitsModel } from "../../models/Units/index.js";
import { LandModel } from "../../models/Land/index.js";
import { sendNotification } from "../../utils/notificationSocket.js";

const validateTenantData = (data) => {
    const errors = [];

    // Personal Info
    if (!data.personal_information?.full_name) errors.push("Full name is required");
    if (!data.personal_information?.email) errors.push("Email is required");
    if (!data.personal_information?.phone) errors.push("Phone is required");
    if (!data.personal_information?.address) errors.push("Address is required");

    // Unit
    // if (!data.unit) errors.push("Unit is required");
    if (!data.deposit) errors.push("Deposit is required");

    return errors;
};

export const createTenant = async (req, res) => {
    try {
        const errors = validateTenantData(req.body);
        const user = req.user
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        const existingTenant = await TenantModel.findOne({ unit: req.body.unit, is_deleted: false })
        if (existingTenant) {
            return res.status(400).json({ message: "Already Occupied this unit" })
        }

        const updatedUnitStatus = await UnitsModel.findByIdAndUpdate(req.body.unit, { status: "occupied" }, { new: true })

        const tenant = new TenantModel(req.body);
        await tenant.save();

        await ActivityLogModel.create({
            userId: user._id,
            title: 'create new tenant',
            details: `${user.first_name} to created new tenant are ${tenant.personal_information.full_name}`,
            action: 'Create',
            activity_type: 'tenant'
        })

        return res.status(201).json({
            success: true,
            message: "Tenant created successfully",
            data: tenant
        });
    } catch (error) {
        console.error("Create Tenant Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};


export const getAllTenants = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
        } = req.query;

        const filters = { is_deleted: false };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await TenantModel.countDocuments(filters);

        const tenants = await TenantModel.find(filters)
            .populate({ path: "unit", populate: { path: "propertyId", model: "property", strictPopulate: false } })
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })

        const startOfMonth = moment().startOf("month").toDate();
        const endOfMonth = moment().endOf("month").toDate();

        const paidThisMonth = await RentsModel.find({
            status: "paid",
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        })

        const overDueThisMonth = await RentsModel.find({
            status: "overdue",
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        })

        const pendingThisMonth = await RentsModel.find({
            status: "pending",
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        })

        return res.status(200).json({
            success: true,
            data: {
                tenants,
                paidThisMonth,
                overDueThisMonth,
                pendingThisMonth,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalRecords: total,
            }
        });
    } catch (error) {
        console.error("Get Tenants Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getTenantByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const tenant = await TenantModel.findOne({ uuid: uuid })
            .populate({ path: "unit", populate: { path: "propertyId", model: "property", strictPopulate: false } })

        if (!tenant || tenant.is_deleted) {
            return res.status(404).json({ success: false, message: "Tenant not found" });
        }

        return res.status(200).json({ success: true, data: tenant });
    } catch (error) {
        console.error("Get Tenant Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateTenantByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const user = req.user
        const tenant = await TenantModel.findOneAndUpdate(
            { uuid: uuid },
            req.body,
            { new: true, runValidators: true }
        );

        if (!tenant) {
            return res.status(404).json({ success: false, message: "Tenant not found" });
        }

        await ActivityLogModel.create({
            userId: user._id,
            title: 'update tenant info',
            details: `${user.first_name} to update the tenant info in "${tenant._id}"`,
            action: 'Update',
            activity_type: 'tenant'
        })

        return res.status(200).json({
            success: true,
            message: "Tenant updated successfully",
            data: tenant
        });
    } catch (error) {
        console.error("Update Tenant Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteTenantByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const user = req.user
        const tenant = await TenantModel.findOneAndUpdate(
            { uuid: uuid },
            {is_deleted: true},
            {new: true}
        );

        await UnitsModel.findByIdAndUpdate({_id: tenant.unit}, {status: "vacant"}, {new: true})

        await ActivityLogModel.create({
            userId: user._id,
            title: 'soft detele tenant info',
            details: `${user.first_name} to deleted the tenant info in id "${tenant._id}"`,
            action: 'Delete',
            activity_type: 'tenant'
        })

        if (!tenant) {
            return res.status(404).json({ success: false, message: "Tenant not found" });
        }

        await sendNotification({
            userIds: ["68bbf79c6fdf3d22f86710c1", "68bc38c3027d23d88e0dff8e"],
            title: `Tenant Removed`,
            description: `Tenant ${tenant?.personal_information?.full_name} was deleted by ${user?.first_name + " " + user?.last_name}`,
            notifyType: 'tenant',
            action: 'delete'
        })

        return res.status(200).json({ success: true, message: "Tenant deleted successfully" });
    } catch (error) {
        console.error("Delete Tenant Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};