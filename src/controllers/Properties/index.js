import { ActivityLogModel } from "../../models/activity_log/index.js";
import { NotifyModel } from "../../models/Notification/index.js";
import { PropertyModel } from "../../models/Properties/index.js";
import { TenantModel } from "../../models/Tenants/index.js";
import { UnitsModel } from "../../models/Units/index.js";
import { sendNotification } from "../../utils/notificationSocket.js";

const validatePropertyData = (data) => {
    const errors = [];

    if (!data.property_name || data.property_name.trim() === "") {
        errors.push("Property name is required");
    }

    if (!data.property_type) {
        errors.push("Property type is required");
    }

    if (!data.square_feet || data.square_feet.trim() === "") {
        errors.push("Square feet is required");
    }

    if (!data.property_address || data.property_address.trim() === "") {
        errors.push("Property Address is required");
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


export const createProperty = async (req, res) => {
    try {
        const errors = validatePropertyData(req.body);
        const user = req.user
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        const property = new PropertyModel(req.body);
        await property.save();

        await ActivityLogModel.create({
            userId: user._id,
            title: 'added new property',
            details: `${user.first_name} to added new property`,
            action: 'Create',
            activity_type: 'property'
        })

        return res.status(201).json({
            success: true,
            message: "Property created successfully",
            data: property
        });
    } catch (error) {
        console.error("Create Property Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllProperties = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
        } = req.query;

        const filters = { is_deleted: false };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await PropertyModel.countDocuments(filters);

        const properties = await PropertyModel.aggregate([
            { $match: filters },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) },

            // lookup units
            {
                $lookup: {
                    from: "units",
                    localField: "_id",
                    foreignField: "propertyId",
                    as: "units"
                }
            },

            // lookup tenants of those units
            {
                $lookup: {
                    from: "tenants",
                    localField: "units._id",
                    foreignField: "unit",
                    as: "tenants"
                }
            },

            // lookup rents linked to those tenants
            {
                $lookup: {
                    from: "rents",
                    localField: "tenants._id",
                    foreignField: "tenantId",
                    as: "rents"
                }
            },

            // add fields
            {
                $addFields: {
                    total_units: { $size: "$units" },
                    occupied_units: {
                        $size: {
                            $filter: {
                                input: "$units",
                                as: "unit",
                                cond: { $in: ["$$unit._id", "$tenants.unit"] }
                            }
                        }
                    },
                    // property revenue = sum tenant.rent where a rent doc is paid
                    property_revenue: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$tenants",
                                        as: "tenant",
                                        cond: {
                                            $in: [
                                                "$$tenant._id",
                                                {
                                                    $map: {
                                                        input: {
                                                            $filter: {
                                                                input: "$rents",
                                                                as: "rent",
                                                                cond: { $eq: ["$$rent.status", "paid"] }
                                                            }
                                                        },
                                                        as: "paidRent",
                                                        in: "$$paidRent.tenantId"
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                },
                                as: "paidTenant",
                                in: "$$paidTenant.rent"
                            }
                        }
                    }
                }
            },

            // calculate vacancy + occupancy rate
            {
                $addFields: {
                    vacant_units: { $subtract: ["$total_units", "$occupied_units"] },
                    occupancy_rate: {
                        $cond: [
                            { $eq: ["$total_units", 0] },
                            0,
                            {
                                $round: [
                                    { $multiply: [{ $divide: ["$occupied_units", "$total_units"] }, 100] },
                                    2
                                ]
                            }
                        ]
                    }
                }
            },

            {
                $project: {
                    units: 0,
                    tenants: 0,
                    rents: 0
                }
            }
        ]);

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

export const getPropertyByUUID = async (req, res) => {
    try {
        const { uuid } = req.params;
        const property = await PropertyModel.findOne({ uuid });

        if (!property || property.is_deleted) {
            return res.status(404).json({ success: false, message: "Property not found" });
        }

        const units = await UnitsModel.find({ propertyId: property._id, is_deleted: false });

        return res.status(200).json({
            success: true,
            data: units
        });
    } catch (error) {
        console.error("Get unit Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const getPropertyType = async (req, res) => {
    try {
        const { property_type } = req.query
        console.log(property_type, "propr")
        const typeProperty = await PropertyModel.find({ property_type: property_type })
        if (!typeProperty) {
            res.status(400).json({ message: "Property type not found" })
        }
        res.status(200).json({
            success: true,
            message: "Properties Retrieved Succesfully",
            data: typeProperty
        })
    } catch (error) {
        console.error("Get Property Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const updatePropertyByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const user = req.user
        const property = await PropertyModel.findOneAndUpdate(
            { uuid: uuid },
            req.body,
            { new: true, runValidators: true }
        );

        if (!property) {
            return res.status(404).json({ success: false, message: "Property not found" });
        }

        await ActivityLogModel.create({
            userId: user._id,
            title: 'update property info',
            details: `${user.first_name} to updated the property id ${property._id}`,
            action: 'Update',
            activity_type: 'property'
        })

        return res.status(200).json({
            success: true,
            message: "Property updated successfully",
            data: property
        });
    } catch (error) {
        console.error("Update Property Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deletePropertyByUUID = async (req, res) => {
    try {
        const { uuid } = req.params
        const user = req.user
        const property = await PropertyModel.findOneAndUpdate(
            { uuid: uuid },
            { is_deleted: true },
            { new: true }
        );

        if (!property) {
            return res.status(404).json({ success: false, message: "Property not found" });
        }

        const unit = await UnitsModel.find({ propertyId: property?._id });

        await UnitsModel.updateMany({ propertyId: property?._id }, { is_deleted: true, status: "vacant" }, { new: true });
        console.log("Units", unit)
        const unitIds = unit.map((unit) => unit?._id);
        console.log("Uodated", unitIds)

        await TenantModel.updateMany(
            { unit: { $in: unitIds } },
            { is_deleted: true }
        )
        await ActivityLogModel.create({
            userId: user?._id,
            title: 'soft delete property',
            details: `${user.first_name} to deleted the property id ${property._id}`,
            action: 'Delete',
            activity_type: 'property'
        })

        await sendNotification({
            userIds: ["68bbf79c6fdf3d22f86710c1", "68bc38c3027d23d88e0dff8e"],
            title: `Property Removed`,
            description: `Property ${property?.property_name} was deleted by ${user?.first_name + " " + user?.last_name}`,
            notifyType: 'property',
            action: 'delete'
        })
        return res.status(200).json({ success: true, message: "Property deleted successfully" });
    } catch (error) {
        console.error("Delete Property Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
