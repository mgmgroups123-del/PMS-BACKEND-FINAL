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

            if (todayDate !== creationDay) continue; // skip if today is not the creation day

            // Check if rent already exists for this tenant for this due month/year
            const existingRent = await RentsModel.findOne({
                tenantId: tenant._id,
                paymentDueDay: {
                    $gte: new Date(rentYear, rentMonth, 1),
                    $lte: new Date(rentYear, rentMonth, 31)
                }
            });
            if (existingRent) continue; // skip if rent already created

            const unitDetails = await UnitsModel.findById(tenant.unit);
            if (!unitDetails) continue;

            // Set actual rent due date
            const paymentDueDay = new Date(rentYear, rentMonth, dueDay);

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
        console.log("month", month, 'year', year)
        if (!month || !year) {
            return res.status(400).json({ message: "Month and Year are required" });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const rents = await RentsModel.find({
            createdAt: { $gte: startDate, $lte: endDate },
            is_deleted: false
        }).populate({ path: "tenantId", model: "tenant", populate: { path: "unit", model: "unit" } });

        const TotalDue = await TenantModel.aggregate([
            {
                $match: {
                    tenant_type: "rent",
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$rent" }
                }
            }
        ]);

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

        ])

        const totalDueAmount = TotalDue.length > 0 ? TotalDue[0].total : 0;

        const stats = await RentsModel.aggregate([
            {
                $match: {
                    paymentDueDay: { $gte: startDate, $lte: endDate },
                    status: { $in: ["paid", "pending"] }
                }
            },
            {
                $lookup: {
                    from: "tenants",
                    localField: "tenant_id",
                    foreignField: "_id",
                    as: "tenant"
                }
            },
            { $unwind: "$tenant" },
            {
                $group: {
                    _id: "$status",
                    totalAmount: { $sum: "$tenant.rent" }
                }
            }
        ]);

        const totalPaidThisMonth = stats.find(s => s._id === "paid")?.totalAmount || 0;
        const totalPendingThisMonth = stats.find(s => s._id === "pending")?.totalAmount || 0;


        res.status(200).json({
            success: true,
            message: "Rents retrieved successfully",
            data: {
                rents,
                totalDueAmount,
                totalPaidThisMonth,
                totalPendingThisMonth,
                TotalDeposit
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching rents" });
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

        const rent = await RentsModel.findOne({ uuid, is_deleted: false })
            .populate({
                path: "tenantId",
                model: "tenant",
                populate: {
                    path: "unit",
                    model: "unit",
                    populate: { path: "propertyId", model: "property" },
                },
            });

        if (!rent) {
            return res.status(404).json({ success: false, message: "Rent not found" });
        }
        const logopath = path.join(process.cwd(), "public", "MGM_Logo.png")

        // === Dynamic Invoice Calculations ===
        const basicRent = Number(rent.tenantId.financial_information.rent)
        const maintenance = Number(rent.tenantId.financial_information?.maintenance)
        const cgst = basicRent * 0.09;
        const sgst = basicRent * 0.09;
        const subtotal = basicRent + cgst + sgst;
        const discount = subtotal * 0.10;
        const total = subtotal - discount + maintenance;

        // === PDF SETUP ===
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${rent.uuid}.pdf`);
        doc.pipe(res);

        doc.image(logopath, 10, 15, { width: 130, height: 70 });

        // Title
        doc.fontSize(14).font("Helvetica-Bold").text("INVOICE", { align: "center" });

        // === Supplier (Owner) details ===
        let y = 100;
        doc.fontSize(10).font("Helvetica-Bold").text("Owner Details:", 40, y);
        y += 15;
        const property = rent.tenantId?.unit?.propertyId;
        doc.font("Helvetica").text(property?.owner_information?.full_name || "MGM ENTERTAINMENTS PVT LTD", 40, y);
        y += 12;
        doc.text(property?.property_address || "NO 1, 9TH STREET, DR RK SALAI, CHENNAI 4", 40, y);
        y += 12;
        doc.text(`${property?.owner_information?.phone || "33AABCM9561A1ZS"}`, 40, y);


        // Add Date on right side
        const currentDate = new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
        doc.font("Helvetica").text(`Date: ${currentDate}`, 450, 80); // right aligned
        y += 15;

        // === Tenant details ===
        y += 2;
        doc.font("Helvetica-Bold").text("Tenant Details:", 40, y);
        y += 15;
        const tenant = rent.tenantId;
        doc.font("Helvetica").text(tenant?.personal_information?.full_name || "Tenant Name", 40, y);
        y += 12;
        doc.font("Helvetica").text(tenant?.unit?.unit_name || "Tenant", 40, y);
        y += 12;
        doc.text(tenant?.personal_information?.address || "Tenant Address", 40, y);
        y += 12;
        doc.text(`${tenant?.personal_information?.phone || "NA"}`, 40, y);

        // === Table Helper ===
        const drawTableRow = (rowY, data, colWidths) => {
            let x = 40;
            data.forEach((text, i) => {
                doc.rect(x, rowY, colWidths[i], 20).stroke();
                doc.font("Helvetica").fontSize(9).text(text, x + 5, rowY + 6);
                x += colWidths[i];
            });
        };

        // === Rent Table ===
        let tableTop = 230;
        const colWidths = [50, 250, 120, 100]; // Sl No, Particulars, Amount, Total

        // Header row
        drawTableRow(tableTop, ["Sl No.", "Particulars", "Amount", "Total"], colWidths);

        // Rows
        const rows = [
            ["1", "Basic Rent", basicRent.toFixed(2), basicRent.toFixed(2)],
            ["2", "Maintenance Charges", maintenance.toFixed(2), maintenance.toFixed(2)],
            ["3", "CGST (9%)", cgst.toFixed(2), cgst.toFixed(2)],
            ["4", "SGST (9%)", sgst.toFixed(2), sgst.toFixed(2)],
        ];

        rows.forEach((row, i) => {
            tableTop += 20;
            drawTableRow(tableTop, row, colWidths);
        });

        // Total Row
        tableTop += 20;
        doc.rect(40, tableTop, colWidths[0] + colWidths[1] + colWidths[2], 20).stroke();
        doc.font("Helvetica-Bold").text("Grand Total", 45, tableTop + 6);
        doc.rect(40 + colWidths[0] + colWidths[1] + colWidths[2], tableTop, colWidths[3], 20).stroke();
        doc.font("Helvetica-Bold").text(`${total.toFixed(2)}`, 40 + colWidths[0] + colWidths[1] + colWidths[2] + 5, tableTop + 6);

        // === Amount in words ===
        tableTop += 40;
        doc.font("Helvetica-Bold").text("Amount Chargeable (in words)", 40, tableTop);
        doc.font("Helvetica").text(`INR : ${numberToWords(total)} only`, 220, tableTop);

        // === Footer / Signature ===
        // tableTop += 60;
        tableTop += 60;
        doc.font("Helvetica-Bold").text("For MGM ENTERTAINMENTS PVT LTD", 380, tableTop);
        doc.font("Helvetica").text("Authorized Signatory", 430, tableTop + 15);

        // === Bank details box ===
        const bankTop = tableTop + 60;
        doc.rect(40, bankTop, 520, 80).stroke();
        doc.font("Helvetica-Bold").text("BANK DETAILS", 50, bankTop + 10);
        doc.font("Helvetica").text("Bank: AXIS BANK LTD", 50, bankTop + 25);
        doc.text("Branch: R.K.Salai, Chennai", 50, bankTop + 38);
        doc.text("A/C No: 006010200030117", 50, bankTop + 51);
        doc.text("IFSC: UTIB0000006", 50, bankTop + 64);

        // Footer
        doc.fontSize(8).text("This is a computer-generated invoice", 200, bankTop + 100);

        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating PDF" });
        }
    }
};

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
        // 1. Fetch all rents with tenant & property info
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

        // 3. Define columns
        worksheet.columns = [
            { header: "Tenant Type", key: "tenant_type", width: 15 },
            { header: "Tenant Name", key: "tenant_name", width: 25 },
            { header: "Property", key: "property_name", width: 25 },
            { header: "Unit", key: "unit_name", width: 15 },
            { header: "Monthly Rent", key: "rent", width: 15 },
            { header: "Deposit", key: "deposit", width: 15 },
            { header: "Maintenance", key: "maintenance", width: 15 },
            { header: "Subtotal", key: "subtotal", width: 15 },
            { header: "CGST", key: "cgst", width: 10 },
            { header: "SGST", key: "sgst", width: 10 },
            { header: "TDS", key: "tds", width: 10 },
            { header: "Total", key: "total", width: 15 },
        ];

        // 4. Add rows
        tenants.forEach((rent) => {
            if (!rent.unit) return;

            const financial = rent.financial_information || {};

            const monthlyRent = Number(financial.rent) || 0;
            const maintenance = Number(financial.maintenance) || 0;

            // CGST & SGST on basic rent only (not maintenance)
            const cgst = monthlyRent * 0.09;
            const sgst = monthlyRent * 0.09;

            // subtotal before discount = basic rent + taxes
            const subtotal = monthlyRent + cgst + sgst;

            // 10% discount on subtotal
            const tds = subtotal * 0.10;

            // final total = subtotal after discount + maintenance
            const total = subtotal - tds + maintenance;

            console.log("Total Rent:", total);


            worksheet.addRow({
                tenant_type: rent.tenant_type || "",
                tenant_name: rent.personal_information?.full_name || "",
                property_name: rent.unit?.propertyId?.property_name || rent?.unit?.land_name,
                unit_name: rent.unit?.unit_name || rent?.unit?.land_name,
                rent: monthlyRent,
                deposit: rent?.deposit,
                maintenance,
                subtotal,
                cgst,
                sgst,
                tds,
                total,
            });
        });

        // 5. Style header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

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
        const { tenant_type } = req.query
        console.log("Query", req.query)
        let tenants = [];
        if (tenant_type === 'All Types') {
            tenants = await TenantModel.find({ is_deleted: false })
                .populate({
                    path: "unit",
                    populate: { path: "propertyId", model: "property", strictPopulate: false }
                });
        } else {
            tenants = await TenantModel.find({ tenant_type: tenant_type, is_deleted: false })
                .populate({
                    path: "unit",
                    populate: { path: "propertyId", model: "property", strictPopulate: false }
                });
        }

        if (!tenants || tenants.length === 0) {
            return res.status(404).json({ success: false, message: "No rent data found" });
        }

        const logopath = path.join(process.cwd(), "public", "MGM_Logo.png")

        // 2. Setup PDF document
        const doc = new PDFDocument({ margin: 30, size: "A3" });

        // Stream PDF to response
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=TenantRentReport.pdf");
        doc.pipe(res);

        doc.image(logopath, 50, 15, { width: 130, height: 70 });

        // 3. Title
        doc.fontSize(18).font("Helvetica").text("Tenant over all Report", { align: "center" });
        doc.moveDown(1);

        doc.fontSize(12).font("Helvetica").text(`Date: ${new Date()}`, { align: "center" });
        doc.moveDown();

        // 4. Table header
        const headers = [
            "S.No", "Tenant Type", "Tenant Name", "Property", "Unit",
            "Monthly Rent", "Deposit", "Maintenance", "Subtotal",
            "CGST", "SGST", "TDS", "Total"
        ];

        // Adjust column widths (first one for serial number)
        const columnWidths = [40, 70, 70, 100, 60, 70, 70, 70, 70, 50, 50, 50, 70];

        let tableTopY = doc.y; // top Y for header
        let rowHeight = 20;

        // Function to draw cell box + text
        const drawCell = (text, x, y, width, height, isHeader = false) => {
            // Draw rectangle (border)
            doc.rect(x, y, width, height).stroke();

            // Draw text inside cell
            doc.font(isHeader ? "Helvetica-Bold" : "Helvetica")
                .fontSize(9)
                .text(text, x, y + 5, {
                    width: width,
                    height: height,
                    align: "center",
                    valign: "center"
                });
        };

        // Draw header row
        let startX = 0.5;
        headers.forEach((header, i) => {
            drawCell(header, startX, tableTopY, columnWidths[i], rowHeight, true);
            startX += columnWidths[i];
        });

        let currentY = tableTopY + rowHeight; // next row Y

        // 5. Table rows with serial numbers
        tenants.forEach((rent, index) => {
            if (!rent.unit) return;

            const financial = rent.financial_information || {};
            const monthlyRent = Number(financial.rent) || 0;
            const deposit = Number(rent.deposit) || 0;
            const maintenance = Number(financial.maintenance) || 0;

            // Calculate taxes on basic rent only
            const cgst = financial.cgst > 0 ? monthlyRent * 0.09 : 0;
            const sgst = financial.sgst > 0 ? monthlyRent * 0.09 : 0;

            // Subtotal = basic rent + taxes
            const subtotal = monthlyRent + cgst + sgst;

            // TDS / discount = 10% of subtotal
            const tds = financial.cgst > 0 && financial.sgst > 0 ? subtotal * 0.10 : 0;

            // Final total = subtotal - tds + maintenance
            const total = subtotal - tds + maintenance;

            console.log("Total Rent:", total);


            const row = [
                (index + 1).toString(), // Serial number
                rent.tenant_type || "",
                rent.personal_information?.full_name || "",
                rent.unit?.propertyId?.property_name || rent?.unit?.land_name,
                rent.unit?.unit_name || rent?.unit?.land_name,
                monthlyRent.toFixed(2),
                deposit.toFixed(2),
                maintenance.toFixed(2),
                subtotal.toFixed(2),
                cgst.toFixed(2),
                sgst.toFixed(2),
                tds.toFixed(2),
                total.toFixed(2)
            ];

            let rowX = 0.5;

            row.forEach((col, i) => {
                drawCell(col, rowX, currentY, columnWidths[i], rowHeight, false);
                rowX += columnWidths[i];
            });

            currentY += rowHeight;
        });

        // 6. Finalize PDF
        doc.end();

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating PDF report" });
        }
    }
};
