import cron from "node-cron";
import { RentsModel } from "../../models/Rent/index.js";
import { UnitsModel } from "../../models/Units/index.js";
import fs from "fs";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { TenantModel } from "../../models/Tenants/index.js";
import { NotifyModel } from "../../models/Notification/index.js";
import { ActivityLogModel } from "../../models/activity_log/index.js";
import { populate } from "dotenv";
import path from "path";

cron.schedule("0 0 * * *", async () => {
    console.log("Checking tenants for upcoming rent creation...");

    try {
        const tenants = await TenantModel.find({
            tenant_type: "rent",
            is_active: true,
            is_deleted: false
        }).populate({
            path: "unit",
            populate: { path: "propertyId", model: "property", strictPopulate: false }
        });

        const today = new Date();
        const todayDate = today.getDate();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        for (const tenant of tenants) {
            const dueDay = tenant.lease_duration.due_date; // e.g., "30" -> 30
            let creationDay = dueDay - 5;
            let rentMonth = currentMonth;
            let rentYear = currentYear;

            // Handle previous month if dueDay < 5
            if (creationDay <= 0) {
                const prevMonthDate = new Date(currentYear, currentMonth, 0); // last day of previous month
                creationDay = prevMonthDate.getDate() + creationDay; // e.g., -2 -> last day - 2
                rentMonth = currentMonth - 1;
                if (rentMonth < 0) { // handle January
                    rentMonth = 11;
                    rentYear -= 1;
                }
            }

            // Check if rent already exists for this tenant for this due month/year
            const paymentDueDay = new Date(rentYear, rentMonth, dueDay);
            const existingRent = await RentsModel.findOne({
                tenantId: tenant._id,
                paymentDueDay: paymentDueDay
            });
            if (existingRent) continue; // skip if rent already created

            // Create rent if we're within 5 days of due date or past due date
            const daysDiff = Math.ceil((paymentDueDay - today) / (1000 * 60 * 60 * 24));
            if (daysDiff > 5) continue; // skip if more than 5 days before due date

            const unitDetails = await UnitsModel.findById(tenant.unit);
            if (!unitDetails) continue;



            const Rent = await RentsModel.create({
                tenantId: tenant._id,
                paymentDueDay: paymentDueDay,
                status: "pending"
            });

            const PaymentDueDayStr = paymentDueDay.toDateString();
            const PaymentDueMonth = paymentDueDay.toLocaleString("default", { month: "long", year: "numeric" });

            // Create notification
            await NotifyModel.create({
                title: `Rent Due Reminder ${PaymentDueMonth}`,
                description: `${tenant.personal_information.full_name}, your rent amount of ₹${tenant.rent} for ${tenant.unit.unit_name} (${tenant?.unit?.propertyId?.property_name}) is due on ${PaymentDueDayStr}. Please make the payment on time to avoid penalties.`,
                notify_type: 'rent',
            });

            // Create activity log
            await ActivityLogModel.create({
                title: `Rent payment due is created`,
                details: `${tenant.personal_information.full_name} ${tenant.unit.unit_name} has rent due ${PaymentDueDayStr} (₹${tenant.rent})`,
                action: 'Create',
                activity_type: "rent"
            });

            console.log(`Rent created for tenant ${tenant.personal_information.full_name}, due on ${PaymentDueDayStr}`);
        }

        console.log("Tenant rent check complete!");
    } catch (err) {
        console.error("Error creating monthly rents:", err);
    }
});

export const getRents = async (req, res) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ message: "Month and Year are required" });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const prevMonth = month - 1 === 0 ? 12 : month - 1;
        const prevYear = month - 1 === 0 ? year - 1 : year;
        const prevStart = new Date(prevYear, prevMonth - 1, 1);
        const prevEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59);

        // Fetch current month rents
        const currentMonthRents = await RentsModel.find({
            paymentDueDay: { $gte: startDate, $lte: endDate },
            is_deleted: false
        }).populate({
            path: "tenantId",
            model: "tenant",
            populate: { path: "unit", model: "unit" }
        });

        // Fetch previous month rents
        const previousMonthRents = await RentsModel.find({
            paymentDueDay: { $gte: prevStart, $lte: prevEnd },
            is_deleted: false
        }).populate({
            path: "tenantId",
            model: "tenant",
            populate: { path: "unit", model: "unit" }
        });

        // Combine data by tenant
        const combined = currentMonthRents.map((curr) => {
            const prev = previousMonthRents.find(
                (p) => p.tenantId?._id?.toString() === curr.tenantId?._id?.toString()
            );

            return {
                tenantId: curr.tenantId?._id,
                tenantName: curr.tenantId?.personal_information?.full_name || "",
                floor: curr.tenantId?.unit?.unit_name || "",
                companyName: curr.tenantId?.unit?.propertyId?.property_name || "",
                address: curr.tenantId?.personal_information?.address || "",
                lease_start_date: curr.tenantId?.lease_duration?.start_date || "",
                lease_end_date: curr.tenantId?.lease_duration?.end_date || "",
                tenantEmail: curr.tenantId?.personal_information?.email,
                currentMonth: {
                    uuid: curr.uuid,
                    amount: curr.tenantId.rent,
                    status: curr.status,
                    dueDate: curr.paymentDueDay,
                    cgst: curr.tenantId.financial_information.cgst,
                    sgst: curr.tenantId.financial_information.sgst,
                    tds: curr.tenantId.financial_information.tds,
                    maintenance: curr.tenantId.financial_information.maintenance,
                    total: curr.tenantId.financial_information.total,
                },
                previousMonth: prev
                    ? {
                        uuid: prev.uuid,
                        amount: prev.tenantId.rent,
                        status: prev.status,
                        dueDate: prev.paymentDueDay,
                        cgst: prev.tenantId.financial_information.cgst,
                        sgst: prev.tenantId.financial_information.sgst,
                        tds: prev.tenantId.financial_information.tds,
                        maintenance: prev.tenantId.financial_information.maintenance,
                        total: prev.tenantId.financial_information.total,
                    }
                    : null
            };
        });

        // Calculate Total Due Amount (sum of all current month rents)
        const totalDueAmount = currentMonthRents.reduce((sum, rent) => {
            return sum + (rent.tenantId?.rent || 0);
        }, 0);

        // Calculate Total Deposits (all time deposits for rent tenants)
        const TotalDeposit = await TenantModel.aggregate([
            {
                $match: { tenant_type: 'rent' }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$deposit" }
                }
            }
        ]);

        // Calculate paid and pending amounts based on current month rents
        const paidRents = currentMonthRents.filter(rent => rent.status === "paid");
        const pendingRents = currentMonthRents.filter(rent => rent.status === "pending");

        const totalPaidThisMonth = paidRents.reduce((sum, rent) => {
            return sum + (rent.tenantId?.rent || 0);
        }, 0);

        const totalPendingThisMonth = pendingRents.reduce((sum, rent) => {
            return sum + (rent.tenantId?.rent || 0);
        }, 0);

        // Alternative approach using aggregation (more efficient for large datasets)
        const stats = await RentsModel.aggregate([
            {
                $match: {
                    paymentDueDay: { $gte: startDate, $lte: endDate },
                    is_deleted: false
                }
            },
            {
                $lookup: {
                    from: "tenants",
                    localField: "tenantId",
                    foreignField: "_id",
                    as: "tenant"
                }
            },
            { $unwind: "$tenant" },
            {
                $group: {
                    _id: "$status",
                    totalAmount: { $sum: "$tenant.rent" },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Extract values from aggregation (alternative method)
        const totalPaidFromAgg = stats.find(s => s._id === "paid")?.totalAmount || 0;
        const totalPendingFromAgg = stats.find(s => s._id === "pending")?.totalAmount || 0;

        res.status(200).json({
            success: true,
            message: "Rents retrieved successfully",
            data: {
                rents: currentMonthRents,
                totalDueAmount,
                totalPaidThisMonth, // Using reduce method
                totalPendingThisMonth, // Using reduce method
                TotalDeposit,
                combined
            }
        });
    } catch (error) {
        console.error("Error fetching rents:", error);
        res.status(500).json({ 
            success: false,
            message: "Error fetching rents",
            error: error.message 
        });
    }
};



export const markRentPaidByUUID = async (req, res) => {
    const user = req.user
    try {
        const { uuid } = req.params;
        const { status } = req.body;
        const rent = await RentsModel.findOneAndUpdate(
            { uuid: uuid },
            { status: status, reminderShown: false },
            { new: true }
        ).populate({ path: "tenantId", model: "tenant" });

        if (!rent) return res.status(404).json({ message: "Rent not found" });

        await ActivityLogModel.create({
            userId: user?._id,
            title: `Rent Payment Paid`,
            details: `${user?.first_name} to new paid status recorded tenant ${rent.tenantId.personal_information.full_name}.`,
            action: 'Update',
            activity_type: "rent"
        })

        res.status(200).json({ message: "Rent marked as paid", rent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


export const downloadMonthlyExcel = async (req, res) => {
    try {
        const { month, year } = req.query;
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const rents = await RentsModel.find({
            createdAt: { $gte: startDate, $lte: endDate }
        }).populate({ path: "tenantId", model: "tenant", populate: { path: "unit", model: "unit", populate: { path: "propertyId", model: "property" } } });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Monthly Rents");

        sheet.columns = [
            { header: "UUID", key: "uuid", width: 36 },
            { header: "Tenant", key: "tenant", width: 20 },
            { header: "Property", key: "property", width: 20 },
            { header: "Due Date", key: "due", width: 15 },
            { header: "Status", key: "status", width: 10 },
        ];

        rents.forEach(rent => {
            sheet.addRow({
                uuid: rent.uuid,
                tenant: rent.tenantId?.personal_information?.full_name,
                property: rent.tenantId?.unit?.propertyId?.property_name,
                due: rent.paymentDueDay.toDateString(),
                status: rent.status
            });
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=monthly_rents_${month}_${year}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error generating Excel" });
    }
};

export const deleteRent = async (req, res) => {
    try {
        const { uuid } = req.params;
        if (!uuid) {
            return res.status(400).json({ message: "UUID is Required" })
        }
        const deletedRent = await RentsModel.findOneAndUpdate({ uuid: uuid }, { is_deleted: true }, { new: true })
        if (!deletedRent) {
            return res.status(400).json({ message: "UUID is Required" })
        }

        await ActivityLogModel.create({
            userId: user?._id,
            title: `Rent Payment Paid`,
            details: `${user?.first_name} to new paid status recorded tenant ${rent.tenantId.personal_information.full_name}.`,
            action: 'Delete',
            activity_type: "rent"
        })

        return res.status(200).json({
            success: true,
            message: "Rent deleted is successfully",
        })
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
}

export const downloadRentPDF = async (req, res) => {
    try {
        const { uuid } = req.params;
        const { year, month } = req.query;

        // Fetch rent details
        const rent = await RentsModel.findOne({
            uuid,
            is_deleted: false
        }).populate({
            path: "tenantId",
            model: "tenant",
            populate: {
                path: "unit",
                model: "unit",
                populate: { path: "propertyId", model: "property" },
            },
        });

        if (!rent) {
            return res.status(404).json({
                success: false,
                message: "Rent not found"
            });
        }

        // Extract month and year from paymentDueDay or use provided parameters
        const paymentDueDate = new Date(rent.paymentDueDay);
        let invoiceMonth, invoiceYear;

        if (year && month) {
            // Use provided month and year from query parameters
            invoiceMonth = parseInt(month);
            invoiceYear = parseInt(year);
        } else {
            // Use month and year from paymentDueDay
            invoiceMonth = paymentDueDate.getMonth() + 1;
            invoiceYear = paymentDueDate.getFullYear();
        }

        console.log(`Generating invoice for: ${getMonthName(invoiceMonth)} ${invoiceYear}`);

        const logopath = path.join(process.cwd(), "public", "MGM_Logo.png");

        const basicRent = Number(rent.tenantId.financial_information?.rent) || 0;
        const maintenance = Number(rent.tenantId.financial_information?.maintenance) || 0;
        const subtotalBeforeGST = basicRent + maintenance;

        // Check if GST/TDS should be applied
        const propertyType = rent.tenantId.unit.propertyId?.property_type;
        const tenantType = rent.tenantId.tenant_type;

        console.log("Property Type:", propertyType);
        console.log("Tenant Type:", tenantType);

        let cgst = 0, sgst = 0, tds = 0, total = subtotalBeforeGST;

        if (!(propertyType === "residency" || tenantType === "lease")) {
            cgst = rent.tenantId.financial_information?.cgst
            sgst = rent.tenantId.financial_information?.sgst
            tds = rent.tenantId.financial_information?.tds
            total = rent.tenantId.rent
        }

        // === PDF Setup ===
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=rent_invoice_${rent.uuid}_${invoiceYear}_${invoiceMonth.toString().padStart(2, '0')}.pdf`);
        doc.pipe(res);

        // Logo & Title
        doc.image(logopath, 10, 15, { width: 130, height: 70 });
        doc.fontSize(14).font("Helvetica-Bold").text("RENT INVOICE", { align: "center" });

        // Invoice Period and Receipt ID
        doc.fontSize(10).font("Helvetica")
            .text(`Period: ${getMonthName(invoiceMonth)} ${invoiceYear}`, { align: "center" })
            .text(`Receipt ID: ${rent.receiptId || 'N/A'}`, { align: "center" });

        // Owner Details
        let y = 130;
        doc.fontSize(10).font("Helvetica-Bold").text("Owner Details:", 40, y);
        y += 15;
        const property = rent.tenantId.unit.propertyId;
        doc.font("Helvetica").text(property?.owner_information?.full_name || "MGM ENTERTAINMENTS PVT LTD", 40, y);
        y += 12;
        doc.text(property?.property_address || "NO 1, 9TH STREET, DR RK SALAI, CHENNAI 4", 40, y);
        y += 12;
        doc.text(`${property?.owner_information?.phone || "33AABCM9561A1ZS"}`, 40, y);

        // Invoice Date, Due Date and Status on right
        const currentDate = new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });

        const dueDateFormatted = paymentDueDate.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });

        doc.font("Helvetica")
            .text(`Invoice Date: ${currentDate}`, 400, 100)
            .text(`Due Date: ${dueDateFormatted}`, 400, 115)
            .text(`Status: ${rent.status.toUpperCase()}`, 400, 130);

        // Tenant Details
        y += 20;
        doc.font("Helvetica-Bold").text("Tenant Details:", 40, y);
        y += 15;
        const tenant = rent.tenantId;
        doc.font("Helvetica").text(tenant?.personal_information?.full_name || "Tenant Name", 40, y);
        y += 12;
        doc.text(tenant?.unit?.unit_name || "Tenant Unit", 40, y);
        y += 12;
        doc.text(tenant?.personal_information?.address || "Tenant Address", 40, y);
        y += 12;
        doc.text(`${tenant?.personal_information?.phone || "NA"}`, 40, y);
        y += 12;
        doc.text(`${tenant?.personal_information?.email || "NA"}`, 40, y);

        // Table Helper
        const drawTableRow = (rowY, data, colWidths, isHeader = false) => {
            let x = 40;
            data.forEach((text, i) => {
                doc.rect(x, rowY, colWidths[i], 20).stroke();
                doc.font(isHeader ? "Helvetica-Bold" : "Helvetica")
                    .fontSize(9)
                    .text(text, x + 5, rowY + 6, { width: colWidths[i] - 10, align: "left" });
                x += colWidths[i];
            });
        };

        // Rent Table
        let tableTop = 300;
        const colWidths = propertyType === "residency" && tenantType === "lease"
            ? [50, 250, 120] // Only Sl No, Particulars, Amount
            : [50, 250, 120, 100]; // Include Total column for GST/TDS

        // Header
        const headers = propertyType === "residency" && tenantType === "lease"
            ? ["Sl No.", "Particulars", "Amount"]
            : ["Sl No.", "Particulars", "Amount", "Total"];
        drawTableRow(tableTop, headers, colWidths, true);

        // Rows
        const rows = propertyType === "residency" && tenantType === "lease"
            ? [
                ["1", "Basic Rent", basicRent.toFixed(2)],
                ["2", "Maintenance Charges", maintenance.toFixed(2)],
                ["3", "Subtotal", subtotalBeforeGST.toFixed(2)],
            ]
            : [
                ["1", "Basic Rent", basicRent.toFixed(2), basicRent.toFixed(2)],
                ["2", "Maintenance Charges", maintenance.toFixed(2), maintenance.toFixed(2)],
                ["3", "CGST @9%", cgst, cgst],
                ["4", "SGST @9%", sgst, sgst],
                ["7", "TDS @10%", `-${tds}`, `-${tds}`],
            ];

        rows.forEach((row) => {
            tableTop += 20;
            drawTableRow(tableTop, row, colWidths);
        });

        // Total Row
        tableTop += 20;
        if (propertyType === "residency" && tenantType === "lease") {
            doc.rect(40, tableTop, colWidths[0] + colWidths[1], 20).stroke();
            doc.font("Helvetica-Bold").text("Grand Total", 45, tableTop + 6);
            doc.rect(40 + colWidths[0] + colWidths[1], tableTop, colWidths[2], 20).stroke();
            doc.font("Helvetica-Bold").text(total.toFixed(2), 40 + colWidths[0] + colWidths[1] + 5, tableTop + 6);
        } else {
            doc.rect(40, tableTop, colWidths[0] + colWidths[1] + colWidths[2], 20).stroke();
            doc.font("Helvetica-Bold").text("Grand Total", 45, tableTop + 6);
            doc.rect(40 + colWidths[0] + colWidths[1] + colWidths[2], tableTop, colWidths[3], 20).stroke();
            doc.font("Helvetica-Bold").text(total.toFixed(2), 40 + colWidths[0] + colWidths[1] + colWidths[2] + 5, tableTop + 6);
        }

        // Amount in Words
        tableTop += 40;
        doc.font("Helvetica-Bold").text("Amount Chargeable (in words):", 40, tableTop);
        doc.font("Helvetica").text(`INR : ${numberToWords(total)} only`, 250, tableTop);

        // Footer / Signature
        tableTop += 60;
        doc.font("Helvetica-Bold").text("For MGM ENTERTAINMENTS PVT LTD", 380, tableTop);
        doc.font("Helvetica").text("Authorized Signatory", 430, tableTop + 15);

        // Footer note
        doc.fontSize(8).text("This is a computer-generated invoice", 200, tableTop + 100);

        doc.end();

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating PDF" });
        }
    }
};

// Helper function to get month name
function getMonthName(month) {
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    return months[month - 1];
}


// === Helper to convert numbers to words ===
function numberToWords(num) {
    if (num === 0) return "Zero";

    const a = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"
    ];
    const b = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
    ];

    function inWords(n) {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
        if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + inWords(n % 100) : "");
        if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + inWords(n % 1000) : "");
        if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + inWords(n % 100000) : "");
        return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + inWords(n % 10000000) : "");
    }

    return inWords(num).trim();
}


export const downloadRentExcel = async (req, res) => {
    try {
        // 1. Fetch all tenants with unit & property info
        const tenants = await TenantModel.find({ is_deleted: false })
            .populate({
                path: "unit",
                populate: { path: "propertyId", model: "property", strictPopulate: false }
            });

        if (!tenants || tenants.length === 0) {
            return res.status(404).json({ success: false, message: "No rent data found" });
        }

        // 2. Setup workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Tenant Rent Report");

        // 3. Define base columns
        let columns = [
            { header: "S.No", key: "sno", width: 8 },
            { header: "Tenant Type", key: "tenant_type", width: 15 },
            { header: "Tenant Name", key: "tenant_name", width: 25 },
            { header: "Property", key: "property_name", width: 25 },
            { header: "Unit", key: "unit_name", width: 15 },
            { header: "Basic Rent", key: "rent", width: 15 },
            { header: "Maintenance", key: "maintenance", width: 15 },
        ];

        // Add GST/TDS columns
        columns.push(
            { header: "Subtotal Before GST", key: "subtotalBeforeGST", width: 20 },
            { header: "CGST @9%", key: "cgst", width: 15 },
            { header: "SGST @9%", key: "sgst", width: 15 },
            { header: "Subtotal (incl. GST)", key: "subtotal", width: 22 },
            { header: "TDS @10%", key: "tds", width: 15 },
            { header: "Total After TDS", key: "total", width: 20 }
        );

        worksheet.columns = columns;

        // 4. Add rows
        tenants.forEach((tenant, index) => {
            if (!tenant.unit) return;

            const financial = tenant.financial_information || {};
            const basicRent = Number(financial.rent) || 0;
            const maintenance = Number(financial.maintenance) || 0;

            const propertyType = tenant.unit?.propertyId?.property_type;
            const tenantType = tenant.tenant_type;

            const skipGST = propertyType === "residency" || tenantType === "lease";
            const subtotalBeforeGST = basicRent + maintenance;
            const cgst = skipGST ? 0 : subtotalBeforeGST * 0.09;
            const sgst = skipGST ? 0 : subtotalBeforeGST * 0.09;
            const subtotal = skipGST ? subtotalBeforeGST : subtotalBeforeGST + cgst + sgst;
            const tds = skipGST ? 0 : subtotalBeforeGST * 0.10;
            const total = subtotalBeforeGST - tds;


            const rowData = {
                sno: index + 1,
                tenant_type: tenant.tenant_type || "",
                tenant_name: tenant.personal_information?.full_name || "",
                property_name: tenant.unit?.propertyId?.property_name || tenant.unit?.land_name || "",
                unit_name: tenant.unit?.unit_name || tenant.unit?.land_name || "",
                rent: basicRent,
                maintenance,
                subtotalBeforeGST: skipGST ? "" : subtotalBeforeGST,
                cgst: skipGST ? 0 : cgst,
                sgst: skipGST ? 0 : sgst,
                subtotal: subtotal,
                tds: skipGST ? 0 : tds,
                total: total,
            };

            worksheet.addRow(rowData);
        });

        // 5. Style header
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.alignment = { vertical: "middle", horizontal: "center" };
        headerRow.height = 20;

        // Format numbers to 2 decimal places
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                [6, 7, 8, 9, 10, 11, 12, 13].forEach((col) => {
                    const cell = row.getCell(col);
                    if (typeof cell.value === "number") {
                        cell.numFmt = "0.00";
                    }
                });
            }
        });

        // 6. Send file as response
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", "attachment; filename=TenantRentReport.xlsx");

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating Excel report" });
        }
    }
};



export const downloadAllRentPDF = async (req, res) => {
    try {
        const { tenant_type } = req.query;

        let tenants = [];
        if (tenant_type === 'All Types') {
            tenants = await TenantModel.find({ is_deleted: false })
                .populate({
                    path: "unit",
                    populate: { path: "propertyId", model: "property", strictPopulate: false }
                });
        } else {
            tenants = await TenantModel.find({ tenant_type, is_deleted: false })
                .populate({
                    path: "unit",
                    populate: { path: "propertyId", model: "property", strictPopulate: false }
                });
        }

        if (!tenants || tenants.length === 0) {
            return res.status(404).json({ success: false, message: "No rent data found" });
        }

        const logopath = path.join(process.cwd(), "public", "MGM_Logo.png");

        // ✅ Use landscape for wide table
        const doc = new PDFDocument({ margin: 30, size: "A3", layout: "landscape" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=TenantRentReport.pdf");
        doc.pipe(res);

        doc.image(logopath, 50, 15, { width: 130, height: 70 });
        doc.fontSize(18).font("Helvetica-Bold").text("Tenant Overall Report", { align: "center" });
        doc.moveDown(1);
        doc.fontSize(12).font("Helvetica").text(`Date: ${new Date().toLocaleString()}`, { align: "center" });
        doc.moveDown();

        const headers = [
            "S.No", "Tenant Type", "Tenant Name", "Property", "Unit",
            "Basic Rent", "Maintenance", "Subtotal Before GST",
            "CGST @9%", "SGST @9%", "Subtotal (incl. GST)",
            "TDS @10%", "Total After TDS"
        ];

        // ✅ Adjusted widths to fit landscape
        const columnWidths = [40, 90, 120, 150, 90, 90, 90, 100, 80, 80, 80, 80, 100];
        const rowHeight = 22;
        const startX = 0.5;
        let tableTopY = doc.y;

        const drawCell = (text, x, y, width, height, isHeader = false) => {
            doc.rect(x, y, width, height).stroke();
            doc.font(isHeader ? "Helvetica-Bold" : "Helvetica")
                .fontSize(9)
                .text(text ?? "", x + 2, y + 5, { width: width - 4, align: "center" });
        };

        // Header row
        let x = startX;
        headers.forEach((header, i) => {
            drawCell(header, x, tableTopY, columnWidths[i], rowHeight, true);
            x += columnWidths[i];
        });

        let currentY = tableTopY + rowHeight;

        tenants.forEach((tenant, index) => {
            if (!tenant.unit) return;

            const financial = tenant.financial_information || {};
            const basicRent = Number(financial.rent) || 0;
            const maintenance = Number(financial.maintenance) || 0;

            const propertyType = tenant.unit?.propertyId?.property_type;
            const tenantType = tenant.tenant_type;

            const skipGST = propertyType === "residency" || tenantType === "lease";

            const subtotalBeforeGST = basicRent + maintenance;
            const cgst = skipGST ? 0 : subtotalBeforeGST * 0.09;
            const sgst = skipGST ? 0 : subtotalBeforeGST * 0.09;
            const subtotal = skipGST ? subtotalBeforeGST : subtotalBeforeGST + cgst + sgst;
            const tds = skipGST ? 0 : subtotalBeforeGST * 0.10;
            const total = subtotalBeforeGST - tds;

            const row = [
                (index + 1).toString(),
                tenant.tenant_type || "",
                tenant.personal_information?.full_name || "",
                tenant.unit?.propertyId?.property_name || tenant.unit?.land_name || "",
                tenant.unit?.unit_name || tenant.unit?.land_name || "",
                basicRent.toFixed(2),
                maintenance.toFixed(2),
                subtotalBeforeGST.toFixed(2),
                cgst.toFixed(2),
                sgst.toFixed(2),
                subtotal.toFixed(2),
                tds.toFixed(2),
                total.toFixed(2)
            ];

            // Page break
            if (currentY + rowHeight > doc.page.height - 50) {
                doc.addPage({ layout: "landscape" });
                currentY = 120;
                x = startX;
                headers.forEach((header, i) => {
                    drawCell(header, x, currentY, columnWidths[i], rowHeight, true);
                    x += columnWidths[i];
                });
                currentY += rowHeight;
            }

            let rowX = startX;
            row.forEach((col, i) => {
                drawCell(col, rowX, currentY, columnWidths[i], rowHeight);
                rowX += columnWidths[i];
            });

            currentY += rowHeight;
        });

        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating PDF report" });
        }
    }
};


