import cron from "node-cron"
import { LeaseModel } from "../../models/Lease/index.js";
import { TenantModel } from "../../models/Tenants/index.js";
import { NotifyModel } from "../../models/Notification/index.js";

cron.schedule("0 0 * * *", async () => {
    console.log("Running lease checks...");

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // start of today

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); // start of tomorrow

        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

        // 1️⃣ Leases ending TODAY
        const leasesEndingToday = await TenantModel.find({
            tenant_type: "lease",
            is_active: true,
            is_deleted: false,
            "lease_information.end_date": { $gte: today, $lt: tomorrow }
        }).populate({
            path: "unit",
            populate: { path: "propertyId", model: "property", strictPopulate: false }
        });

        for (const lease of leasesEndingToday) {
            await NotifyModel.create({
                tenantId: lease._id,
                title: "Lease Ends Today",
                description: `${lease.personal_information.full_name}'s lease for ${lease.unit.name} at ${lease.unit.propertyId.property_name} ends today (${lease.lease_information.end_date.toDateString()}).`,
                notify_type: "lease",
                created_at: Date.now()
            });
            console.log(`Lease ending today notification created for ${lease.personal_information.full_name}`);
        }

        const leasesExpiringSoon = await TenantModel.find({
            tenant_type: "lease",
            is_active: true,
            is_deleted: false,
            "lease_information.end_date": { $gt: tomorrow, $lte: thirtyDaysLater }
        }).populate({
            path: "unit",
            populate: { path: "propertyId", model: "property", strictPopulate: false }
        });

        for (const lease of leasesExpiringSoon) {
            await NotifyModel.create({
                tenantId: lease._id,
                title: "Lease Expiring Soon",
                description: `${lease.personal_information.full_name}'s lease for ${lease.unit.name} at ${lease.unit.propertyId.property_name} will expire on ${lease.lease_information.end_date.toDateString()}.`,
                notify_type: "lease",
                created_at: Date.now()
            });
            console.log(`Lease expiring soon notification created for ${lease.personal_information.full_name}`);
        }

        // 3️⃣ Leases ALREADY EXPIRED (before today)
        const leasesExpired = await TenantModel.find({
            tenant_type: "lease",
            is_active: true,
            is_deleted: false,
            "lease_information.end_date": { $lt: today }
        }).populate({
            path: "unit",
            populate: { path: "propertyId", model: "property", strictPopulate: false }
        });

        for (const lease of leasesExpired) {
            await NotifyModel.create({
                tenantId: lease._id,
                title: "Lease Expired",
                description: `${lease.personal_information.full_name}'s lease for ${lease.unit.name} at ${lease.unit.propertyId.property_name} expired on ${lease.lease_information.end_date.toDateString()}.`,
                notify_type: "lease",
                created_at: Date.now()
            });
            console.log(`Lease expired notification created for ${lease.personal_information.full_name}`);
        }

        console.log("Lease checks complete ");
    } catch (err) {
        console.error("Error during lease checks:", err);
    }
});





export const getLeases = async (req, res) => {
    try {
        const Leases = await TenantModel.find({ is_deleted: false, tenant_type: 'lease'}).populate({path: "unit", strictPopulate:false})

        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const leaseStats = await TenantModel.aggregate([
            {
                $facet: {
                    activeLeases: [
                        {
                            $match: {
                                "lease_duration.start_date": { $lte: today },
                                "lease_duration.end_date": { $gte: today },
                                is_active: true,
                                tenant_type: 'lease',
                                is_deleted: false
                            }
                        },
                        { $count: "count" }
                    ],
                    expiredLeases: [
                        {
                            $match: {
                                "lease_duration.end_date": { $lt: today },
                                tenant_type: 'lease',
                                is_deleted: false
                            }
                        },
                        { $count: "count" }
                    ],
                    expiringSoonThisMonth: [
                        {
                            $match: {
                                "lease_duration.end_date": {
                                    $gte: today,
                                    $lte: endOfMonth
                                },
                                tenant_type: 'lease',
                                is_deleted: false
                            }
                        },
                        { $count: "count" }
                    ],
                    totalDepositAmount: [
                        {
                            $match: {tenant_type: 'lease'}
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: "$deposit" }
                            }
                        }
                    ]
                }
            }
        ]);


        const activeLeases = leaseStats[0].activeLeases[0]?.count || 0
        const expiredLeases = leaseStats[0].expiredLeases[0]?.count || 0
        const expiringSoonThisMonth = leaseStats[0].expiringSoonThisMonth[0]?.count || 0
        const totalDepositAmount = leaseStats[0].totalDepositAmount[0]?.total || 0

        res.status(200).json({
            success: true,
            message: "Leases retrieved successfully",
            data: {
                Leases,
                activeLeases,
                expiredLeases,
                expiringSoonThisMonth,
                totalDepositAmount
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching Leases" });
    }
};

export const testCron = async (req, res) => {
    console.log("Running lease checks...");

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // start of today

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); // start of tomorrow

        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

        // 1️⃣ Leases ending TODAY
        const leasesEndingToday = await TenantModel.find({
            tenant_type: "lease",
            is_active: true,
            is_deleted: false,
            "lease_information.end_date": { $gte: today, $lt: tomorrow }
        }).populate({
            path: "unit",
            populate: { path: "propertyId", model: "property", strictPopulate: false }
        });

        for (const lease of leasesEndingToday) {
            await NotifyModel.create({
                tenantId: lease._id,
                title: "Lease Ends Today",
                description: `${lease.personal_information.full_name}'s lease for ${lease.unit.name} at ${lease.unit.propertyId.property_name} ends today (${lease.lease_information.end_date.toDateString()}).`,
                notify_type: "lease",
                created_at: Date.now()
            });
            console.log(`Lease ending today notification created for ${lease.personal_information.full_name}`);
        }

        const leasesExpiringSoon = await TenantModel.find({
            tenant_type: "lease",
            is_active: true,
            is_deleted: false,
            "lease_information.end_date": { $gt: tomorrow, $lte: thirtyDaysLater }
        }).populate({
            path: "unit",
            populate: { path: "propertyId", model: "property", strictPopulate: false }
        });

        for (const lease of leasesExpiringSoon) {
            await NotifyModel.create({
                tenantId: lease._id,
                title: "Lease Expiring Soon",
                description: `${lease.personal_information.full_name}'s lease for ${lease.unit.name} at ${lease.unit.propertyId.property_name} will expire on ${lease.lease_information.end_date.toDateString()}.`,
                notify_type: "lease",
                created_at: Date.now()
            });
            console.log(`Lease expiring soon notification created for ${lease.personal_information.full_name}`);
        }

        // 3️⃣ Leases ALREADY EXPIRED (before today)
        const leasesExpired = await TenantModel.find({
            tenant_type: "lease",
            is_active: true,
            is_deleted: false,
            "lease_information.end_date": { $lt: today }
        }).populate({
            path: "unit",
            populate: { path: "propertyId", model: "property", strictPopulate: false }
        });

        for (const lease of leasesExpired) {
            await NotifyModel.create({
                tenantId: lease._id,
                title: "Lease Expired",
                description: `${lease.personal_information.full_name}'s lease for ${lease.unit.name} at ${lease.unit.propertyId.property_name} expired on ${lease.lease_information.end_date.toDateString()}.`,
                notify_type: "lease",
                created_at: Date.now()
            });
            console.log(`Lease expired notification created for ${lease.personal_information.full_name}`);
        }

        console.log("Lease checks complete ");
    } catch (err) {
        console.error("Error during lease checks:", err);
    }

}