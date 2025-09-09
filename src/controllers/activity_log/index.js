import { ActivityLogModel } from "../../models/activity_log/index.js"


export const GetAllActivity = async (req, res) => {
    try {
        let { page = 1, perpage = 5 } = req.query;
        page = parseInt(page);
        perpage = parseInt(perpage);

        const totalCount = await ActivityLogModel.countDocuments();

        const data = await ActivityLogModel.find()
            .skip((page - 1) * perpage)
            .limit(perpage)
            .sort({ createdAt: -1 });

        const totalPages = Math.ceil(totalCount / perpage);

        res.status(200).json({
            success: true,
            message: "All activity fetched",
            data,
            totalPages,
            totalCount,
            currentPage: page
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


export const GetByIdActivity = async (req, res) => {
    try {
        const { uuid } = req.params

        const data = await ActivityLogModel.findOne({ uuid })

        res.status(200).json({ success: true, message: 'data fetched', data })
    } catch (error) {
        res.status(500).json({ success: false, message: error.message })
    }
}
