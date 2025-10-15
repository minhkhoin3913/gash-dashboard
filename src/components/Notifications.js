import React, { useState, useEffect } from "react";
import axios from "axios";
import "../styles/Notifications.css";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [newNotification, setNewNotification] = useState({
    title: "",
    message: "",
    recipient: "all",
    userId: "",
  });

  const [preferences, setPreferences] = useState({
    system: true,
    order: true,
    promotion: true,
  });

  const [templates, setTemplates] = useState([
    {
      id: 1,
      name: "Promotion",
      title: "🎁 New Offer Available!",
      message: "Get 10% off on your order today!",
    },
    {
      id: 2,
      name: "Order Update",
      title: "📦 Your Order is Being Processed",
      message: "Your order is currently being prepared and will ship soon.",
    },
  ]);

  const [editingTemplate, setEditingTemplate] = useState(null);

  // Fetch all notifications
  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await axios.get("http://localhost:5000/notifications/admin/all");
      setNotifications(res.data);
    } catch (error) {
      console.error("❌ Error fetching notifications:", error);
    }
  };

  // Send new notification
  const handleSendNotification = async () => {
    if (!newNotification.title || !newNotification.message)
      return alert("Please enter both title and message!");

    try {
      const payload = {
        title: newNotification.title,
        message: newNotification.message,
        userId:
          newNotification.recipient === "all" ? null : newNotification.userId,
        type: "system",
      };

      await axios.post("http://localhost:5000/notifications/admin/create", payload);
      alert("✅ Notification sent successfully!");
      setNewNotification({ title: "", message: "", recipient: "all", userId: "" });
      fetchNotifications();
    } catch (error) {
      console.error("❌ Error sending notification:", error);
      alert("Failed to send notification.");
    }
  };

  // Delete a notification
  const handleDeleteNotification = async (id) => {
    if (!window.confirm("Are you sure you want to delete this notification?")) return;
    try {
      await axios.delete(`http://localhost:5000/notifications/admin/${id}`);
      fetchNotifications();
    } catch (error) {
      console.error("❌ Error deleting notification:", error);
    }
  };

  // Save preferences
  const handleSavePreferences = () => {
    alert("💾 Notification preferences saved!");
    console.log("Preferences:", preferences);
  };

  // Save template
  const handleSaveTemplate = () => {
    if (!editingTemplate) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === editingTemplate.id ? editingTemplate : t))
    );
    alert("💾 Template updated successfully!");
    setEditingTemplate(null);
  };

  return (
    <div className="notifications-container">
      <h2>🔔 Notification Management</h2>

      {/* SEND NEW NOTIFICATION */}
      <div className="notification-form">
        <h3>📨 Send a New Notification</h3>

        <label>Title:</label>
        <input
          type="text"
          value={newNotification.title}
          onChange={(e) =>
            setNewNotification({ ...newNotification, title: e.target.value })
          }
          placeholder="Enter notification title..."
        />

        <label>Message:</label>
        <textarea
          value={newNotification.message}
          onChange={(e) =>
            setNewNotification({ ...newNotification, message: e.target.value })
          }
          placeholder="Enter notification message..."
        />

        <label>Recipient:</label>
        <select
          value={newNotification.recipient}
          onChange={(e) =>
            setNewNotification({ ...newNotification, recipient: e.target.value })
          }
        >
          <option value="all">All Users</option>
          <option value="single">Specific User</option>
        </select>

        {newNotification.recipient === "single" && (
          <input
            type="text"
            value={newNotification.userId}
            onChange={(e) =>
              setNewNotification({ ...newNotification, userId: e.target.value })
            }
            placeholder="Enter user ID..."
          />
        )}

        <button onClick={handleSendNotification}>🚀 Send Notification</button>
      </div>

      {/* NOTIFICATION LIST */}
      <div className="notification-list">
        <h3>📋 Notification List</h3>
        {notifications.length === 0 ? (
          <p className="empty">No notifications yet</p>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li key={n._id} className="notification-item">
                <div className="info">
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                  <span>
                    👤 {n.userId ? `User ID: ${n.userId}` : "All Users"}
                  </span>
                </div>
                <button
                  className="delete-btn"
                  onClick={() => handleDeleteNotification(n._id)}
                  title="Delete"
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* PREFERENCES */}
      <div className="preferences-section">
        <h3>⚙️ Notification Preferences</h3>
        <div className="preferences-grid">
          {Object.keys(preferences).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={preferences[key]}
                onChange={(e) =>
                  setPreferences({ ...preferences, [key]: e.target.checked })
                }
              />
              {key.charAt(0).toUpperCase() + key.slice(1)} Notifications
            </label>
          ))}
        </div>
        <button onClick={handleSavePreferences} className="save-btn">
          💾 Save Changes
        </button>
      </div>

      {/* TEMPLATE EDITOR */}
      <div className="templates-section">
        <h3>🧩 Notification Templates</h3>
        {editingTemplate ? (
          <div className="edit-template">
            <input
              type="text"
              value={editingTemplate.name}
              onChange={(e) =>
                setEditingTemplate({ ...editingTemplate, name: e.target.value })
              }
              placeholder="Template name..."
            />
            <input
              type="text"
              value={editingTemplate.title}
              onChange={(e) =>
                setEditingTemplate({ ...editingTemplate, title: e.target.value })
              }
              placeholder="Notification title..."
            />
            <textarea
              value={editingTemplate.message}
              onChange={(e) =>
                setEditingTemplate({ ...editingTemplate, message: e.target.value })
              }
              placeholder="Notification message..."
            />
            <div className="template-actions">
              <button onClick={handleSaveTemplate}>💾 Save</button>
              <button onClick={() => setEditingTemplate(null)}>❌ Cancel</button>
            </div>
          </div>
        ) : (
          <ul className="template-list">
            {templates.map((t) => (
              <li key={t.id} className="template-item">
                <div>
                  <strong>{t.name}</strong>
                  <p>{t.title}</p>
                </div>
                <button
                  onClick={() => setEditingTemplate(t)}
                  className="edit-btn"
                >
                  ✏️ Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}