import { NotifyModel } from "../../models/Notification/index.js"

export const notificationGetAll = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found"
      });
    }

    const specialUsers = [
      "68bbf79c6fdf3d22f86710c1",
      "68bc38c3027d23d88e0dff8e"
    ].map(id => id.toString());

    let filter = { is_deleted: false };

    if (!specialUsers.includes(userId.toString())) {
      filter.action = { $ne: "delete" };
    }

    const [notifications, total] = await Promise.all([
      NotifyModel.find(filter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      NotifyModel.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      message: "Notification Retrieved Successfully",
      data: notifications,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



export const markedAsRead = async (req, res) => {
    try {
        const { uuid } = req.params;
        const updated = await NotifyModel.findOneAndUpdate(
            { _id: uuid },
            { is_read: true },
            { new: true}
        );
        return res.status(200).json({
            success: true,
            message: "Updated notification marked as read"
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        })
    }
}

export const markedAsAllRead = async (req, res) => {
    try {
        const updated = await NotifyModel.updateMany({is_read: false}, {$set: {is_read: true}});
        return res.status(200).json({
            success: true,
            message: "Updated notification all marked as read"
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        })
    }
}

export const deleteNotify = async (req, res) => {
    try {
        const { uuid } = req.params;
        const updated = await NotifyModel.findOneAndUpdate(
            { _id: uuid },
            { is_deleted: true },
            { new: true}
        );
        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully"
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        })
    }
}