import { ActivityLogModel } from "../../models/activity_log/index.js";
import { LandModel } from "../../models/Land/index.js";
import { sendNotification } from "../../utils/notificationSocket.js";


const validateLandData = (data) => {
    const errors = [];

    if (!data.land_name || data.land_name.trim() === "") {
        errors.push("land name is required");
    }

    if (!data.land_type) {
        errors.push("Land type is required");
    }

    if (!data.square_feet || data.square_feet.trim() === "") {
        errors.push("Square feet is required");
    }

    if (!data.land_address || data.land_address.trim() === "") {
        errors.push("Land Address is required");
    }

    if (!data.owner_information) {
        errors.push("Owner information is required");
    } else {
        const owner = data.owner_information;
        if (!owner.full_name) errors.push("Owner full name is required");
        if (!owner.email) errors.push("Owner email is required");
        if (!owner.phone) errors.push("Owner phone is required");
        if (!owner.address) errors.push("Owner address is required");
    }

    return errors;
};


export const createLand = async (req, res) => {
    try {
        const errors = validateLandData(req.body);
        const user = req.user
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        const Land = new LandModel(req.body);
        await Land.save();

        await ActivityLogModel.create({
            userId: user?._id,
            title: `new land added`,
            details: `${user?.first_name} to added new land details.`,
            action: 'Create',
            activity_type: 'land'
        })

        return res.status(201).json({
            success: true,
            message: "Land created successfully",
            data: Land
        });
    } catch (error) {
        console.error("Create Land Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllLands = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
        } = req.query;

        const filters = { is_deleted: false };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await LandModel.countDocuments(filters);

        const properties = await LandModel.find(filters)
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalRecords: total,
            data: properties
        });
    } catch (error) {
        console.error("Get Properties Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getLandByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const Land = await LandModel.findOne({ uuid: uuid });

        if (!Land || Land.is_deleted) {
            return res.status(404).json({ success: false, message: "Land not found" });
        }

        return res.status(200).json({ success: true, data: Land });
    } catch (error) {
        console.error("Get Land Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateLandByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const user = req.user
        const Land = await LandModel.findOneAndUpdate(
            { uuid: uuid },
            req.body,
            { new: true, runValidators: true }
        );

        if (!Land) {
            return res.status(404).json({ success: false, message: "Land not found" });
        }

        await ActivityLogModel.create({
            userId: user._id,
            title: `update land info`,
            details: `change the db info for land id is ${Land._id} and ${Land.land_name} `,
            action: `Update`,
            activity_type: 'land'
        })

        return res.status(200).json({
            success: true,
            message: "Land updated successfully",
            data: Land
        });
    } catch (error) {
        console.error("Update Land Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteLandByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const user = req.user
        const Land = await LandModel.findOneAndUpdate(
            { uuid: uuid },
            { is_deleted: true },
            { new: true }
        );

        if (!Land) {
            return res.status(404).json({ success: false, message: "Land not found" });
        }

        await ActivityLogModel.create({
            userId: user._id,
            title: 'soft delete',
            details: `to delete the land ${Land.land_name} and id ${Land._id} in db`,
            action: 'Delete',
            activity_type: 'land'
        })

        await sendNotification({
            userIds: ["68bbf79c6fdf3d22f86710c1", "68bc38c3027d23d88e0dff8e"],
            title: `Land Removed`,
            description: `Land ${Land?.land_name} was deleted by ${user?.first_name + " " + user?.last_name}`,
            notifyType: 'land',
            action: 'delete'
        })

        return res.status(200).json({ success: true, message: "Land deleted successfully" });
    } catch (error) {
        console.error("Delete Land Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
