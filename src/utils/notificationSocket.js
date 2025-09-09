import { io, onlineUsers } from "../../app.js";
import { NotifyModel } from "../models/Notification/index.js";

export const sendNotification = async ({
  userId,
  userIds,
  title,
  description,
  notifyType,
  action
}) => {
  try {
    // Normalize users to always be an array of IDs (strings)
    let targetUserIds = [];

    if (userIds && userIds.length > 0) {
      targetUserIds = userIds.map(id => id.toString());
    } else if (userId) {
      targetUserIds = [userId.toString()];
    }

    if (targetUserIds.length === 0) {
      console.warn("No target users provided for notification");
      return;
    }

    await createAndEmit(
      targetUserIds,
      title,
      description,
      notifyType,
      action
    );
  } catch (err) {
    console.error("Error sending notification:", err.message);
  }
};

const createAndEmit = async (
  userIds,
  title,
  description,
  notifyType,
  action
) => {
  // ✅ Save a single notification document for multiple users
  const newNotification = new NotifyModel({
    user: userIds,   // user field must be an Array in schema
    title,
    description,
    notifyType,
    action,
    is_read: false,
    createdAt: new Date()
  });

  await newNotification.save();

  // Emit notification to each online user
  for (const userId of userIds) {
    const session = onlineUsers.get(userId);
    if (session) {
      io.to(session.socketId).emit("newNotification", newNotification);
      console.log(`Sent real-time notification to user ${userId}`);
    } else {
      console.log(`User ${userId} is offline, stored in DB only`);
    }
  }
};
