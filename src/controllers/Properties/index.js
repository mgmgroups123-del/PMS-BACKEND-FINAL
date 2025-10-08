import { ActivityLogModel } from "../../models/activity_log/index.js";
import { LandModel } from "../../models/Land/index.js";
import { NotifyModel } from "../../models/Notification/index.js";
import { PropertyModel } from "../../models/Properties/index.js";
import { TenantModel } from "../../models/Tenants/index.js";
import { UnitsModel } from "../../models/Units/index.js";
import { sendNotification } from "../../utils/notificationSocket.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import path from "path";

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
        } = req.query;

        const filters = { is_deleted: false };

        const total = await PropertyModel.countDocuments(filters);

        const properties = await PropertyModel.aggregate([
            { $match: filters },
            { $sort: { createdAt: -1 } },

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

export const getAllPropertiesReport = async (req, res) => {
    try {
        const filters = { is_deleted: false };

        // 1️⃣ Property Details
        const propertyData = await PropertyModel.aggregate([
            { $match: filters },
            { $sort: { createdAt: -1 } },

            // Lookup units
            {
                $lookup: {
                    from: "units",
                    localField: "_id",
                    foreignField: "propertyId",
                    as: "units",
                },
            },

            // Lookup tenants of those units
            {
                $lookup: {
                    from: "tenants",
                    localField: "units._id",
                    foreignField: "unit",
                    as: "tenants",
                },
            },

            // Lookup rents linked to those tenants
            {
                $lookup: {
                    from: "rents",
                    localField: "tenants._id",
                    foreignField: "tenantId",
                    as: "rents",
                },
            },

            // Add calculated fields
            {
                $addFields: {
                    total_units: { $size: "$units" },
                    occupied_units: {
                        $size: {
                            $filter: {
                                input: "$units",
                                as: "unit",
                                cond: { $in: ["$$unit._id", "$tenants.unit"] },
                            },
                        },
                    },
                    // Revenue = sum of tenant.rent where corresponding rent.status = "paid"
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
                                                                cond: { $eq: ["$$rent.status", "paid"] },
                                                            },
                                                        },
                                                        as: "paidRent",
                                                        in: "$$paidRent.tenantId",
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                },
                                as: "paidTenant",
                                in: "$$paidTenant.rent", // tenant's rent amount
                            },
                        },
                    },
                },
            },

            // Calculate vacant units and occupancy rate
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
                                    2,
                                ],
                            },
                        ],
                    },
                },
            },

            // Final projection
            {
                $project: {
                    _id: 1,
                    type: { $literal: "property" },
                    name: "$property_name",
                    address: 1,
                    revenue: "$property_revenue",
                    total_units: 1,
                    occupied_units: 1,
                    vacant_units: 1,
                    occupancy_rate: 1,
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        ]);

        // 2️⃣ Land Details
        const landData = await LandModel.aggregate([
            { $match: filters },

            // Lookup tenants
            {
                $lookup: {
                    from: "tenants",
                    localField: "_id",
                    foreignField: "unit",
                    as: "tenants",
                },
            },

            // Add calculated fields
            {
                $addFields: {
                    total_units: 1,
                    occupied_units: { $cond: [{ $gt: [{ $size: "$tenants" }, 0] }, 1, 0] },
                    vacant_units: { $cond: [{ $gt: [{ $size: "$tenants" }, 0] }, 0, 1] },
                    revenue: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$tenants",
                                        as: "tenant",
                                        cond: { $eq: ["$$tenant.status", "paid"] },
                                    },
                                },
                                as: "paidTenant",
                                in: "$$paidTenant.rent",
                            },
                        },
                    },
                    occupancy_rate: { $cond: [{ $gt: [{ $size: "$tenants" }, 0] }, 100, 0] },
                },
            },

            // Final projection
            {
                $project: {
                    _id: 1,
                    type: { $literal: "land" },
                    name: "$land_name",
                    land_address: 1,
                    square_feet: 1,
                    acre: 1,
                    cent: 1,
                    revenue: 1,
                    total_units: 1,
                    occupied_units: 1,
                    vacant_units: 1,
                    occupancy_rate: 1,
                },
            },
        ]);

        // 3️⃣ Merge both arrays
        const allProperties = [...propertyData, ...landData];

        // 4️⃣ Send response
        return res.status(200).json({
            success: true,
            totalRecords: allProperties.length,
            data: allProperties,
        });
    } catch (error) {
        console.error("Get Properties Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};


export const getAllPropertiesReportPdf = async (req, res) => {
    try {
        const filters = { is_deleted: false };

        // 1️⃣ Fetch Property Data
        const propertyData = await PropertyModel.aggregate([
            { $match: filters },
            { $sort: { createdAt: -1 } },
            { $lookup: { from: "units", localField: "_id", foreignField: "propertyId", as: "units" } },
            { $lookup: { from: "tenants", localField: "units._id", foreignField: "unit", as: "tenants" } },
            { $lookup: { from: "rents", localField: "tenants._id", foreignField: "tenantId", as: "rents" } },
            {
                $addFields: {
                    total_units: { $size: "$units" },
                    occupied_units: {
                        $size: {
                            $filter: { input: "$units", as: "unit", cond: { $in: ["$$unit._id", "$tenants.unit"] } }
                        }
                    },
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
                                                { $map: { input: { $filter: { input: "$rents", as: "rent", cond: { $eq: ["$$rent.status", "paid"] } } }, as: "paidRent", in: "$$paidRent.tenantId" } }
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
            {
                $addFields: {
                    occupancy_rate: {
                        $cond: [
                            { $eq: ["$total_units", 0] },
                            0,
                            { $round: [{ $multiply: [{ $divide: ["$occupied_units", "$total_units"] }, 100] }, 2] }
                        ]
                    }
                }
            },
            { $project: { _id: 0, name: "$property_name", total_units: 1, revenue: "$property_revenue", occupancy_rate: 1 } }
        ]);

        // 2️⃣ Fetch Land Data
        const landData = await LandModel.aggregate([
            { $match: filters },
            { $lookup: { from: "tenants", localField: "_id", foreignField: "unit", as: "tenants" } },
            {
                $addFields: {
                    total_units: 1,
                    revenue: {
                        $sum: {
                            $map: {
                                input: { $filter: { input: "$tenants", as: "tenant", cond: { $eq: ["$$tenant.status", "paid"] } } },
                                as: "paidTenant",
                                in: "$$paidTenant.rent"
                            }
                        }
                    },
                    occupancy_rate: { $cond: [{ $gt: [{ $size: "$tenants" }, 0] }, 100, 0] }
                }
            },
            { $project: { _id: 0, name: "$land_name", total_units: 1, revenue: 1, occupancy_rate: 1 } }
        ]);

        const allData = [...propertyData, ...landData];

        // 3️⃣ Determine export format
        const { format } = req.query; // ?format=pdf or ?format=excel

        if (format === "excel") {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet("Properties Report");

            worksheet.columns = [
                { header: "Name", key: "name", width: 30 },
                { header: "Total Units", key: "total_units", width: 15 },
                { header: "Revenue", key: "revenue", width: 15 },
                { header: "Occupancy Rate (%)", key: "occupancy_rate", width: 20 }
            ];

            allData.forEach(row => worksheet.addRow(row));

            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", `attachment; filename=properties_report.xlsx`);

            await workbook.xlsx.write(res);
            return res.end();
        }

        if (format === "pdf") {
            const doc = new PDFDocument({ size: "A3", margin: 30, layout: "landscape" });

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", "attachment; filename=properties_report.pdf");

            doc.pipe(res);

            // 1️⃣ Logo
            const logopath = path.join(process.cwd(), "public", "MGM_Logo.png");
            doc.image(logopath, 50, 15, { width: 130, height: 70 });

            // 2️⃣ Title
            doc.fontSize(20).font("Helvetica-Bold").text("Properties Report", { align: "center" });
            doc.moveDown(0.5);
            doc.fontSize(12).font("Helvetica").text(`Date: ${new Date().toLocaleString()}`, { align: "center" });
            doc.moveDown(1);

            // 3️⃣ Table setup
            const headers = ["S.No", "Property/Land Name", "Total Units", "Revenue", "Occupancy Rate (%)"];
            const columnWidths = [50, 250, 100, 150, 150]; // adjust widths for A3

            const rowHeight = 25;
            let tableTopY = doc.y;

            // Function to draw cell with border and text
            const drawCell = (text, x, y, width, height, isHeader = false) => {
                doc.rect(x, y, width, height).stroke();
                doc.font(isHeader ? "Helvetica-Bold" : "Helvetica")
                    .fontSize(10)
                    .text(text, x + 5, y + 7, { width: width - 10, height: height - 10, align: "center", valign: "center" });
            };

            // 4️⃣ Draw header row
            let startX = 200;
            headers.forEach((header, i) => {
                drawCell(header, startX, tableTopY, columnWidths[i], rowHeight, true);
                startX += columnWidths[i];
            });

            let currentY = tableTopY + rowHeight;

            // 5️⃣ Draw rows
            allData.forEach((row, index) => {
                const rowData = [
                    (index + 1).toString(),
                    row.name,
                    row.total_units.toString(),
                    row.revenue.toFixed(2),
                    row.occupancy_rate.toFixed(2)
                ];

                let rowX = 200;
                rowData.forEach((col, i) => {
                    drawCell(col, rowX, currentY, columnWidths[i], rowHeight, false);
                    rowX += columnWidths[i];
                });

                currentY += rowHeight;

                // Check if we need a new page
                if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage({ size: "A3", layout: "landscape" });
                    currentY = doc.y;
                }
            });

            doc.end();
            return;
        }

        // Default JSON
        return res.status(200).json({ success: true, totalRecords: allData.length, data: allData });

    } catch (error) {
        console.error("Get Properties Report Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

