import { PropertyModel } from "../../models/Properties/index.js";
import { RentsModel } from "../../models/Rent/index.js";
import { TenantModel } from "../../models/Tenants/index.js";
import moment from "moment";
import { UnitsModel } from "../../models/Units/index.js";
import { maintenance } from "../../models/maintenance/index.js";
import { LandModel } from "../../models/Land/index.js";


export const dashBoardReports = async (req, res) => {
  try {
    // ---------- DATE RANGES ----------
    const startOfMonth = moment().startOf("month").toDate();
    const endOfMonth = moment().endOf("month").toDate();
    const today = moment().toDate();
    const next30Days = moment().add(30, "days").toDate();
    const currentYear = moment().year();

    // ---------- PROPERTY & LAND ----------
    const PropertiesTotal = await PropertyModel.aggregate([
      { $match: { is_deleted: false } },
      { $group: { _id: "$property_type", count: { $sum: 1 } } }
    ]);

    const LandsTotal = await LandModel.aggregate([
      { $match: { is_deleted: false } },
      { $group: { _id: "Land", count: { $sum: 1 } } }
    ]);

    // ---------- TENANTS ----------
    const totalTenants = await TenantModel.countDocuments({ is_deleted: false });

    const newTenantsThisMonth = await TenantModel.countDocuments({
      is_deleted: false,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });

    const leasesExpiringSoon = await TenantModel.countDocuments({
      is_deleted: false,
      "lease_duration.end_date": { $gte: today, $lte: next30Days }
    });

    // ---------- RENTS ----------
    const rentsPaidThisMonth = await RentsModel.find({
      status: "paid",
      paymentDueDay: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate({ path: "tenantId", model: "tenant" });

    const totalMonthlyRevenue = rentsPaidThisMonth.reduce(
      (sum, rent) => sum + (rent.tenantId?.rent || 0),
      0
    );

    const rentsPendingThisMonth = await RentsModel.find({
      status: { $in: ["pending", "overdue"] },
      paymentDueDay: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate({ path: "tenantId", model: "tenant" });

    const totalMonthlyPending = rentsPendingThisMonth.reduce(
      (sum, rent) => sum + (rent.tenantId?.rent || 0),
      0
    );

    const expectedRentThisMonth = await TenantModel.aggregate([
      { $match: { is_deleted: false } },
      { $group: { _id: null, total: { $sum: "$rent" } } }
    ]);
    const totalExpected = expectedRentThisMonth[0]?.total || 0;

    const collectionRate =
      totalExpected > 0
        ? ((totalMonthlyRevenue / totalExpected) * 100).toFixed(2)
        : 0;

    // ---------- YEARLY REVENUE ----------
    const yearlyRevenue = await RentsModel.aggregate([
      {
        $match: {
          status: "paid",
          paymentDueDay: {
            $gte: new Date(`${currentYear}-01-01`),
            $lt: new Date(`${currentYear + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]);
    const YearlyRevenue = yearlyRevenue[0]?.total || 0;

    // ---------- OVERALL REVENUE ----------
    const overallRevenue = await RentsModel.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]);
    const OverAllRevenue = overallRevenue[0]?.total || 0;

    // ---------- REVENUE GRAPHS ----------
    const monthlyRevenueGraph = await RentsModel.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: {
            year: { $year: "$paymentDueDay" },
            month: { $month: "$paymentDueDay" }
          },
          total: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const yearlyRevenueGraph = await RentsModel.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: { year: { $year: "$paymentDueDay" } },
          total: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1 } }
    ]);

    // ---------- OCCUPANCY ----------
    const totalUnits = await UnitsModel.countDocuments({ is_deleted: false });

    const occupancyGraph = await TenantModel.aggregate([
      {
        $match: {
          is_deleted: false,
          is_active: true,
          unit: { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          occupiedCount: { $sum: 1 }
        }
      },
      {
        $project: {
          month: "$_id.month",
          year: "$_id.year",
          occupiedCount: 1,
          occupancyRate: {
            $multiply: [{ $divide: ["$occupiedCount", totalUnits] }, 100]
          }
        }
      },
      { $sort: { year: 1, month: 1 } }
    ]);

    // ---------- PAYMENT STATUS BREAKDOWN ----------
    const paymentStatusBreakdownGraph = await RentsModel.aggregate([
      {
        $match: { paymentDueDay: { $gte: startOfMonth, $lte: endOfMonth } }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // ---------- MAINTENANCE EXPENSE ----------
    const maintenanceExpenseGraph = await maintenance.aggregate([
      {
        $facet: {
          monthly: [
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" }
                },
                totalMonthlyExpense: { $sum: "$estimate_cost" }
              }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
          ],
          yearly: [
            {
              $group: {
                _id: { year: { $year: "$createdAt" } },
                totalYearlyExpense: { $sum: "$estimate_cost" }
              }
            },
            { $sort: { "_id.year": 1 } }
          ]
        }
      }
    ]);

    // ---------- RENT COLLECTION GRAPH ----------
    const rentdata = await RentsModel.find().populate({
      path: "tenantId",
      select: "rent _id"
    });
    const maintain = await maintenance.find();

    let rentCollectionGraph = [];
    if (typeof generateReport === "function") {
      rentCollectionGraph = generateReport(rentdata, maintain);
    }

    // ---------- RESPONSE ----------
    res.status(200).json({
      data: {
        PropertiesTotal: [...(PropertiesTotal || []), ...(LandsTotal || [])],
        totalTenants,
        newTenantsThisMonth,
        leasesExpiringSoon,
        totalMonthlyRevenue,
        totalExpected,
        collectionRate: `${collectionRate}%`,
        YearlyRevenue,
        OverAllRevenue,
        totalMonthlyPending,
        monthlyRevenueGraph,
        yearlyRevenueGraph,
        occupancyGraph,
        paymentStatusBreakdownGraph,
        rentCollectionGraph,
        maintenanceExpenseGraph
      }
    });
  } catch (error) {
    console.error("Dashboard Report Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




function generateReport(data, expence) {
  try {
    const monthly = {
      jan: { exp: 0, rev: 0 },
      feb: { exp: 0, rev: 0 },
      mar: { exp: 0, rev: 0 },
      apr: { exp: 0, rev: 0 },
      may: { exp: 0, rev: 0 },
      jun: { exp: 0, rev: 0 },
      jul: { exp: 0, rev: 0 },
      aug: { exp: 0, rev: 0 },
      sep: { exp: 0, rev: 0 },
      oct: { exp: 0, rev: 0 },
      nov: { exp: 0, rev: 0 },
      dec: { exp: 0, rev: 0 },
    };

    const yearly = { exp: 0, rev: 0 }; // <-- new yearly totals

    // Revenue loop
    data.forEach((list) => {
      const month = new Date(list?.createdAt).getMonth();
      const rent = list?.tenantId?.rent || 0;

      yearly.rev += rent; // add to yearly revenue

      switch (month) {
        case 0: monthly.jan.rev += rent; break;
        case 1: monthly.feb.rev += rent; break;
        case 2: monthly.mar.rev += rent; break;
        case 3: monthly.apr.rev += rent; break;
        case 4: monthly.may.rev += rent; break;
        case 5: monthly.jun.rev += rent; break;
        case 6: monthly.jul.rev += rent; break;
        case 7: monthly.aug.rev += rent; break;
        case 8: monthly.sep.rev += rent; break;
        case 9: monthly.oct.rev += rent; break;
        case 10: monthly.nov.rev += rent; break;
        case 11: monthly.dec.rev += rent; break;
        default: throw new Error("Month not correct");
      }
    });

    // Expense loop
    expence.forEach((list) => {
      const month = new Date(list?.createdAt).getMonth();
      const cost = list?.estmate_cost || 0;

      yearly.exp += cost; // add to yearly expense

      switch (month) {
        case 0: monthly.jan.exp += cost; break;
        case 1: monthly.feb.exp += cost; break;
        case 2: monthly.mar.exp += cost; break;
        case 3: monthly.apr.exp += cost; break;
        case 4: monthly.may.exp += cost; break;
        case 5: monthly.jun.exp += cost; break;
        case 6: monthly.jul.exp += cost; break;
        case 7: monthly.aug.exp += cost; break;
        case 8: monthly.sep.exp += cost; break;
        case 9: monthly.oct.exp += cost; break;
        case 10: monthly.nov.exp += cost; break;
        case 11: monthly.dec.exp += cost; break;
        default: throw new Error("Month not correct");
      }
    });

    return { monthly, yearly }; // return both
  } catch (error) {
    console.log(error);
  }
}


export const getOccupancyStats = async (req, res) => {
  try {
    // 1) Overall summary
    const overall = await UnitsModel.aggregate([
      {
        $group: {
          _id: null,
          totalUnits: { $sum: 1 },
          occupiedUnits: {
            $sum: {
              $cond: [{ $eq: ["$status", "occupied"] }, 1, 0]
            }
          },
          vacantUnits: {
            $sum: {
              $cond: [{ $eq: ["$status", "vacant"] }, 1, 0]
            }
          }
        }
      },
      {
        $addFields: {
          occupancyRate: {
            $cond: [
              { $eq: ["$totalUnits", 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$occupiedUnits", "$totalUnits"] },
                      100
                    ]
                  },
                  2
                ]
              }
            ]
          }
        }
      },
      { $project: { _id: 0 } }
    ]);

    const overallStats = overall[0] || {
      totalUnits: 0,
      occupiedUnits: 0,
      vacantUnits: 0,
      occupancyRate: 0
    };

    // 2) Monthly trend (only months with data)
    const monthlyData = await UnitsModel.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalUnits: { $sum: 1 },
          occupiedUnits: {
            $sum: {
              $cond: [{ $eq: ["$status", "occupied"] }, 1, 0]
            }
          },
          vacantUnits: {
            $sum: {
              $cond: [{ $eq: ["$status", "vacant"] }, 1, 0]
            }
          }
        }
      },
      {
        $addFields: {
          occupancyRate: {
            $cond: [
              { $eq: ["$totalUnits", 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$occupiedUnits", "$totalUnits"] },
                      100
                    ]
                  },
                  2
                ]
              }
            ]
          }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // 3) Fill missing months with 0
    const currentYear = new Date().getFullYear();
    const filledMonthly = [];
    for (let m = 1; m <= 12; m++) {
      const monthData = monthlyData.find(
        (d) => d._id.year === currentYear && d._id.month === m
      );
      if (monthData) {
        filledMonthly.push({
          year: monthData._id.year,
          month: m,
          totalUnits: monthData.totalUnits,
          occupiedUnits: monthData.occupiedUnits,
          vacantUnits: monthData.vacantUnits,
          occupancyRate: monthData.occupancyRate
        });
      } else {
        filledMonthly.push({
          year: currentYear,
          month: m,
          totalUnits: 0,
          occupiedUnits: 0,
          vacantUnits: 0,
          occupancyRate: 0
        });
      }
    }

    // 4) API Response
    return res.status(200).json({
      success: true,
      overall: overallStats,
      monthlyTrend: filledMonthly
    });
  } catch (error) {
    console.error("Get Occupancy Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};