import { ActivityLogModel } from "../../models/activity_log/index.js";
import { PropertyModel } from "../../models/Properties/index.js";
import { UnitsModel } from "../../models/Units/index.js";
import { sendNotification } from "../../utils/notificationSocket.js";

const validateUnitData = (data) => {
    const errors = [];

    if (!data.propertyId) errors.push("Property ID is required");
    if (!data.unit_name) errors.push("Unit name is required");
    if (!data.unit_sqft) errors.push("Unit sqft is required");
    if (!data.unit_address) errors.push("Unit address is required");

    return errors;
};

export const createUnit = async (req, res) => {
    try {
        const errors = validateUnitData(req.body);
        const user = req.user
        console.log("user", user)
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        console.log("Units Payload", req.body)

        const existingUnit = await UnitsModel.findOne({ unit_name: req.body.unit_name })
        if (existingUnit) {
            return res.status(400).json({ message: "Unit name already exists" })
        }

        const property = await PropertyModel.findOne({ _id: req.body.propertyId })
        if (!property) {
            return res.status(400).json({ message: "Property not found" })
        }

        const unit = new UnitsModel(req.body);
        await unit.save();

        await ActivityLogModel.create({
            userId: user._id,
            title: 'create new unit',
            details: `${user.first_name} to create new units`,
            action: 'Create',
            activity_type: 'unit'
        })

        return res.status(201).json({
            success: true,
            message: "Unit created successfully",
            data: unit
        });
    } catch (error) {
        console.error("Create Unit Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getUnitsPropertyId = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Property not found" })
        }
        const getProperty = await UnitsModel.find({ propertyId: id })
        return res.status(201).json({
            success: true,
            message: "Unit get successfully",
            data: getProperty
        });
    } catch (error) {
        console.error("Get Unit Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const getAllUnits = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
        } = req.query;

        const filters = { is_deleted: false };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await UnitsModel.countDocuments(filters);

        const units = await UnitsModel.find(filters)
            .populate({ path: "propertyId", model: "property" })
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })

        return res.status(200).json({
            success: true,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalRecords: total,
            data: units
        });
    } catch (error) {
        console.error("Get Units Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getUnitByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const unit = await UnitsModel.findOne({ uuid: uuid }).populate({ path: "propertyId", model: "property" });

        if (!unit || unit.is_deleted) {
            return res.status(404).json({ success: false, message: "Unit not found" });
        }

        return res.status(200).json({ success: true, data: unit });
    } catch (error) {
        console.error("Get Unit Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateUnitByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const user = req.user
        const unit = await UnitsModel.findOneAndUpdate(
            { uuid: uuid },
            req.body,
            { new: true, runValidators: true }
        );

        if (!unit) {
            return res.status(404).json({ success: false, message: "Unit not found" });
        }

        await ActivityLogModel.create({
            userId: user._id,
            title: 'update unit info',
            details: `${user.first_name} to update the unit info by id ${unit._id}`,
            action: 'Update',
            activity_type: 'unit'
        })

        return res.status(200).json({
            success: true,
            message: "Unit updated successfully",
            data: unit
        });
    } catch (error) {
        console.error("Update Unit Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteUnitByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const user = req.user
        const unit = await UnitsModel.findOneAndUpdate(
            { uuid: uuid },
            { is_deleted: true },
            { new: true }
        );

        if (!unit) {
            return res.status(404).json({ success: false, message: "Unit not found" });
        }

        await ActivityLogModel.create({
            userId: user._id,
            title: 'soft delete for unit',
            details: `${user.first_name} to deleted the unit id ${unit._id}`,
            action: 'Delete',
            activity_type: 'unit'
        })

        await sendNotification({
            userIds: ["68bbf79c6fdf3d22f86710c1", "68bc38c3027d23d88e0dff8e"],
            title: `Unit Removed`,
            description: `Unit ${unit?.unit_name} was deleted by ${user?.first_name + " " + user?.last_name}`,
            notifyType: 'unit',
            action: 'delete'
        })

        return res.status(200).json({ success: true, message: "Unit deleted successfully" });
    } catch (error) {
        console.error("Delete Unit Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
