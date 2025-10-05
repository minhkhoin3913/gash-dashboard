import React, { useEffect, useState } from "react";
import axios from "axios";
import "../styles/Vouchers.css";

export default function Vouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [formData, setFormData] = useState({
    code: "",
    discountType: "percentage",
    discountValue: "",
    minOrderValue: 0,
    maxDiscount: "",
    startDate: "",
    endDate: "",
    usageLimit: 1,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  // ✅ Backend API (không có /api)
  const API_BASE = "http://localhost:5000/vouchers";

  // Lấy danh sách voucher
  const fetchVouchers = async () => {
  try {
    const token = localStorage.getItem("token");
    const res = await axios.get(`${API_BASE}/get-all-vouchers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setVouchers(res.data.data);
  } catch (err) {
    console.error(err);
    if (err.response?.status === 403) {
      alert("❌ Bạn không có quyền xem danh sách voucher (cần quyền admin hoặc manager)");
    }
  }
};

  useEffect(() => {
    fetchVouchers();
  }, []);

  // Xử lý nhập form
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "code") {
      // Tự động chuyển in hoa, giới hạn 12 ký tự, chỉ cho phép A–Z 0–9
      const formatted = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      setFormData((prev) => ({ ...prev, [name]: formatted }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Gửi tạo voucher
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const token = localStorage.getItem("token");
await axios.post(`${API_BASE}/create-voucher`, formData, {
  headers: { Authorization: `Bearer ${token}` },
});

      setMessage("🎉 Tạo voucher thành công!");
      setFormData({
        code: "",
        discountType: "percentage",
        discountValue: "",
        minOrderValue: 0,
        maxDiscount: "",
        startDate: "",
        endDate: "",
        usageLimit: 1,
      });
      fetchVouchers();
      setShowForm(false);
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
  <div className="vouchers-container">
    <div className="vouchers-header">
      <h1>🎟️ Quản lý Voucher</h1>
      <button className="create-btn" onClick={() => setShowForm(!showForm)}>
        {showForm ? "⬅ Quay lại" : "➕ Create Voucher"}
      </button>
    </div>

    {/* Form tạo voucher */}
    {showForm ? (
      <div className="voucher-create-form">
        <h2>Tạo Voucher Mới</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setMessage("");
            try {
              const payload = { ...formData };
              // ✅ Không gửi maxDiscount nếu là giảm cố định
              if (payload.discountType === "fixed") delete payload.maxDiscount;

              await axios.post(`${API_BASE}/create-voucher`, payload);
              setMessage("🎉 Tạo voucher thành công!");
              setFormData({
                code: "",
                discountType: "fixed",
                discountValue: 100000,
                minOrderValue: 200000,
                maxDiscount: "",
                startDate: new Date().toISOString().split("T")[0],
                endDate: "",
                usageLimit: 5,
              });
              fetchVouchers();
              setShowForm(false);
            } catch (err) {
              setMessage("❌ " + (err.response?.data?.message || err.message));
            } finally {
              setLoading(false);
            }
          }}
        >
          <label>
            Mã Voucher:
            <input
              name="code"
              value={formData.code}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Loại Giảm:
            <select
              name="discountType"
              value={formData.discountType}
              onChange={handleChange}
            >
              <option value="percentage">Phần trăm (%)</option>
              <option value="fixed">Giá cố định</option>
            </select>
          </label>

          <label>
            {formData.discountType === "percentage"
              ? "Giảm (%)"
              : "Giảm (₫)"}:
            <input
              type="number"
              name="discountValue"
              value={formData.discountValue}
              onChange={handleChange}
              min={formData.discountType === "percentage" ? 1 : 1000}
              max={formData.discountType === "percentage" ? 100 : undefined}
              required
            />
          </label>

          <label>
            Đơn tối thiểu:
            <input
              type="number"
              name="minOrderValue"
              value={formData.minOrderValue}
              onChange={handleChange}
            />
          </label>

          {formData.discountType === "percentage" && (
            <label>
              Giảm tối đa (₫):
              <input
                type="number"
                name="maxDiscount"
                value={formData.maxDiscount}
                onChange={handleChange}
              />
            </label>
          )}

          <label>
            Ngày bắt đầu:
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={handleChange}
            />
          </label>

          <label>
            Ngày kết thúc:
            <input
              type="date"
              name="endDate"
              value={formData.endDate}
              min={formData.startDate}
              onChange={handleChange}
            />
          </label>

          <label>
            Giới hạn sử dụng:
            <input
              type="number"
              name="usageLimit"
              value={formData.usageLimit}
              onChange={handleChange}
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Đang tạo..." : "Tạo Voucher"}
          </button>
        </form>
        {message && <p className="message">{message}</p>}
      </div>
    ) : (
      // ✅ Danh sách voucher
      <div className="voucher-table-container">
        <table className="voucher-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Loại</th>
              <th>Giá trị</th>
              <th>Đơn tối thiểu</th>
              <th>Giảm tối đa</th>
              <th>Ngày bắt đầu</th>
              <th>Ngày kết thúc</th>
              <th>Giới hạn</th>
              <th>Đã dùng</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.length > 0 ? (
              vouchers.map((v) => (
                <tr key={v._id}>
                  <td>{v.code}</td>
                  <td>{v.discountType}</td>
                  <td>
                    {v.discountType === "percentage"
                      ? `${v.discountValue}%`
                      : `₫${v.discountValue.toLocaleString("vi-VN")}`}
                  </td>
                  <td>₫{v.minOrderValue.toLocaleString("vi-VN")}</td>
                  <td>
                    {v.discountType === "percentage"
                      ? v.maxDiscount
                        ? `₫${v.maxDiscount.toLocaleString("vi-VN")}`
                        : "-"
                      : "-"}
                  </td>
                  <td>{new Date(v.startDate).toLocaleDateString("vi-VN")}</td>
                  <td>{new Date(v.endDate).toLocaleDateString("vi-VN")}</td>
                  <td>{v.usageLimit}</td>
                  <td>{v.usedCount}</td>
                  <td
                    className={`voucher-status ${
                      v.status.toLowerCase() === "active"
                        ? "status-active"
                        : v.status.toLowerCase() === "deleted"
                        ? "status-deleted"
                        : "status-expired"
                    }`}
                  >
                    {v.status.toUpperCase()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10" style={{ textAlign: "center" }}>
                  Không có voucher nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
}
