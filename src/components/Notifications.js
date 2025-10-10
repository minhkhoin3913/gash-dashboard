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
    { id: 1, name: "Khuyến mãi", title: "🎁 Ưu đãi mới", message: "Nhận ngay giảm giá 10% cho đơn hàng hôm nay!" },
    { id: 2, name: "Đơn hàng", title: "📦 Cập nhật đơn hàng", message: "Đơn hàng của bạn đang được xử lý." },
  ]);

  const [editingTemplate, setEditingTemplate] = useState(null);

  // 🔹 Lấy danh sách thông báo
  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await axios.get("http://localhost:5000/notifications/admin/all");
      setNotifications(res.data);
    } catch (error) {
      console.error("❌ Lỗi khi tải danh sách thông báo:", error);
    }
  };

  // 🔹 Gửi thông báo
  const handleSendNotification = async () => {
    try {
      if (!newNotification.title || !newNotification.message)
        return alert("Vui lòng nhập tiêu đề và nội dung!");

      const payload = {
        title: newNotification.title,
        message: newNotification.message,
        userId: newNotification.recipient === "all" ? null : newNotification.userId,
        type: "system",
      };

      const res = await axios.post("http://localhost:5000/notifications/admin/create", payload);
      alert("✅ Gửi thông báo thành công!");
      setNewNotification({ title: "", message: "", recipient: "all", userId: "" });
      fetchNotifications();
    } catch (error) {
      console.error("❌ Lỗi gửi thông báo:", error.response?.data || error.message);
      alert("Gửi thất bại!");
    }
  };

  // 🔹 Xóa thông báo
  const handleDeleteNotification = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa thông báo này không?")) return;
    try {
      await axios.delete(`http://localhost:5000/notifications/admin/${id}`);
      fetchNotifications();
    } catch (error) {
      console.error("❌ Lỗi khi xóa thông báo:", error);
    }
  };

  // 🔹 Lưu preferences
  const handleSavePreferences = () => {
    alert("💾 Cài đặt thông báo đã được lưu!");
    console.log("Preferences:", preferences);
  };

  // 🔹 Lưu template
  const handleSaveTemplate = () => {
    if (!editingTemplate) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === editingTemplate.id ? editingTemplate : t))
    );
    alert("💾 Template đã được cập nhật!");
    setEditingTemplate(null);
  };

  return (
    <div className="notifications-container">
      <h2>🔔 Quản lý thông báo</h2>

      {/* GỬI THÔNG BÁO */}
      <div className="notification-form">
        <h3>📨 Gửi thông báo mới</h3>

        <label>Tiêu đề:</label>
        <input
          type="text"
          value={newNotification.title}
          onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
          placeholder="Nhập tiêu đề..."
        />

        <label>Nội dung:</label>
        <textarea
          value={newNotification.message}
          onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
          placeholder="Nhập nội dung thông báo..."
        />

        <label>Người nhận:</label>
        <select
          value={newNotification.recipient}
          onChange={(e) => setNewNotification({ ...newNotification, recipient: e.target.value })}
        >
          <option value="all">Tất cả người dùng</option>
          <option value="single">Một người cụ thể</option>
        </select>

        {newNotification.recipient === "single" && (
          <input
            type="text"
            value={newNotification.userId}
            onChange={(e) => setNewNotification({ ...newNotification, userId: e.target.value })}
            placeholder="Nhập ID user cần gửi..."
          />
        )}

        <button onClick={handleSendNotification}>🚀 Gửi thông báo</button>
      </div>

      {/* DANH SÁCH THÔNG BÁO */}
      <div className="notification-list">
        <h3>📋 Danh sách thông báo</h3>
        {notifications.length === 0 ? (
          <p className="empty">Chưa có thông báo nào</p>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li key={n._id} className="notification-item">
                <div className="info">
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                  <span>👤 {n.userId ? `User ID: ${n.userId}` : "Tất cả người dùng"}</span>
                </div>
                <button className="delete-btn" onClick={() => handleDeleteNotification(n._id)}>
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ⚙️ EDIT PREFERENCES */}
      <div className="preferences-section">
        <h3>⚙️ Edit Notification Preferences</h3>
        <div className="preferences-grid">
          {Object.keys(preferences).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={preferences[key]}
                onChange={(e) => setPreferences({ ...preferences, [key]: e.target.checked })}
              />
              {key.charAt(0).toUpperCase() + key.slice(1)} Notifications
            </label>
          ))}
        </div>
        <button onClick={handleSavePreferences} className="save-btn">
          💾 Lưu thay đổi
        </button>
      </div>

      {/* 🧩 EDIT TEMPLATES */}
      <div className="templates-section">
        <h3>🧩 Edit Notification Templates</h3>
        {editingTemplate ? (
          <div className="edit-template">
            <input
              type="text"
              value={editingTemplate.name}
              onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
              placeholder="Tên template"
            />
            <input
              type="text"
              value={editingTemplate.title}
              onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
              placeholder="Tiêu đề"
            />
            <textarea
              value={editingTemplate.message}
              onChange={(e) => setEditingTemplate({ ...editingTemplate, message: e.target.value })}
              placeholder="Nội dung thông báo..."
            />
            <div className="template-actions">
              <button onClick={handleSaveTemplate}>💾 Lưu</button>
              <button onClick={() => setEditingTemplate(null)}>❌ Hủy</button>
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
                <button onClick={() => setEditingTemplate(t)} className="edit-btn">
                  ✏️ Sửa
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
