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
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);

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

  // Tính trạng thái voucher
  const getVoucherStatus = (voucher) => {
    if (voucher.isDeleted) return "DISABLED";

    const now = new Date();
    const start = new Date(voucher.startDate);
    const end = new Date(voucher.endDate);

    if (now < start) return "UPCOMING";
    if (now > end) return "EXPIRED";
    if (voucher.usedCount >= voucher.usageLimit) return "USED UP";

    return "ACTIVE";
  };

  // Xử lý nhập form
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "code") {
      const formatted = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30);
      setFormData((prev) => ({ ...prev, [name]: formatted }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Tạo / cập nhật voucher
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const token = localStorage.getItem("token");

      const payload = {
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue),
        minOrderValue: Number(formData.minOrderValue),
        usageLimit: Number(formData.usageLimit),
        startDate: new Date(formData.startDate),
        endDate: new Date(formData.endDate),
      };

      if (formData.discountType === "percentage" && formData.maxDiscount !== "") {
        payload.maxDiscount = Number(formData.maxDiscount);
      }

      if (editMode && editId) {
        await axios.put(`${API_BASE}/update-voucher/${editId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessage("✅ Cập nhật voucher thành công!");
      } else {
        payload.code = formData.code;
        await axios.post(`${API_BASE}/create-voucher`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessage("🎉 Tạo voucher thành công!");
      }

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
      setShowForm(false);
      setEditMode(false);
      setEditId(null);
      fetchVouchers();
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Sửa voucher
  const handleEdit = (voucher) => {
    if (voucher.isDeleted) return;
    setFormData({
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      minOrderValue: voucher.minOrderValue,
      maxDiscount: voucher.maxDiscount || "",
      startDate: new Date(voucher.startDate).toISOString().split("T")[0],
      endDate: new Date(voucher.endDate).toISOString().split("T")[0],
      usageLimit: voucher.usageLimit,
      isDeleted: voucher.isDeleted,
    });
    setEditMode(true);
    setEditId(voucher.id || voucher._id);
    setShowForm(true);
  };

  // Xóa / Disable voucher
  const handleDelete = async (voucher) => {
    if (!window.confirm(`Bạn có chắc muốn disable voucher ${voucher.code}?`)) return;

    try {
      const token = localStorage.getItem("token");
      const voucherId = voucher.id || voucher._id;
      if (!voucherId) {
        alert("Không tìm thấy ID voucher!");
        return;
      }
      await axios.delete(`${API_BASE}/disable-voucher/${voucherId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchVouchers();
    } catch (err) {
      console.error(err);
      alert("❌ Không thể disable voucher: " + (err.response?.data?.message || err.message));
    }
  };

  // Sort voucher theo ngày bắt đầu (mới nhất lên đầu)
  const sortedVouchers = [...vouchers].sort(
    (a, b) => new Date(b.startDate) - new Date(a.startDate)
  );

  // Lọc voucher theo trạng thái, loại và mã tìm kiếm
  const filteredVouchers = sortedVouchers.filter((v) => {
    const matchesStatus =
      statusFilter === "all" || getVoucherStatus(v) === statusFilter;
    const matchesType =
      typeFilter === "all" || v.discountType === typeFilter;
    const matchesSearch =
      searchTerm === "" || v.code.includes(searchTerm);

    return matchesStatus && matchesType && matchesSearch;
  });

  return (
    <div className="vouchers-header">
      {showForm ? (
        <div className="voucher-create-form">
          <h2>{editMode ? "✏️ Edit Voucher" : "Create New Voucher"}</h2>
          <button
            className="centered-back-btn"
            onClick={() => {
              setShowForm(false);
              setEditMode(false);
              setEditId(null);
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
            }}
          >
            ⬅ Back
          </button>
          <form onSubmit={handleSubmit}>
            <label>
              Voucher Code:
              <input
                name="code"
                value={formData.code}
                onChange={handleChange}
                required={!editMode}
                disabled={editMode}
              />
            </label>

            <label>
              Discount Type:
              <select
                name="discountType"
                value={formData.discountType}
                onChange={handleChange}
                disabled={formData.isDeleted}
              >
                <option value="percentage">(%)</option>
                <option value="fixed">Fixed Price</option>
              </select>
            </label>

            <label>
              {formData.discountType === "percentage" ? "Discount (%):" : "Giảm (₫)"}:
              <input
                type="number"
                name="discountValue"
                value={formData.discountValue}
                onChange={handleChange}
                min={formData.discountType === "percentage" ? 1 : 1000}
                max={formData.discountType === "percentage" ? 100 : undefined}
                required
                disabled={formData.isDeleted}
              />
            </label>

            <label>
              Minimum Order:
              <input
                type="number"
                name="minOrderValue"
                value={formData.minOrderValue}
                onChange={handleChange}
                disabled={formData.isDeleted}
              />
            </label>

            {formData.discountType === "percentage" && (
              <label>
               Maximum Discount (VND):
                <input
                  type="number"
                  name="maxDiscount"
                  value={formData.maxDiscount}
                  onChange={handleChange}
                  disabled={formData.isDeleted}
                />
              </label>
            )}

            <label>
              Start Date:
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={handleChange}
                disabled={formData.isDeleted}
              />
            </label>

            <label>
              End Date:
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                min={formData.startDate}
                onChange={handleChange}
                disabled={formData.isDeleted}
              />
            </label>

            <label>
              Validity Limit:
              <input
                type="number"
                name="usageLimit"
                value={formData.usageLimit}
                onChange={handleChange}
                min={1}
                disabled={formData.isDeleted}
              />
            </label>

            <button type="submit" disabled={loading || formData.isDeleted}>
              {loading ? "Processing..." : editMode ? "Update" : "Create Voucher"}
            </button>
          </form>
          {message && <p className="message">{message}</p>}
        </div>
      ) : (
        <>
          <h1>🎟️ Voucher Management</h1>
          <div className="vouchers-actions">
            <input
              type="text"
              className="voucher-search"
              placeholder="Search by code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            />
            <select
              className="type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount</option>
            </select>
            <select
              className="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="USED UP">Used Up</option>
              <option value="EXPIRED">Expired</option>
              <option value="DISABLED">Disabled</option>
            </select>
            <button
              className="create-btn"
              onClick={() => setShowForm(true)}
            >
              ➕ Create Voucher
            </button>
          </div>

          <div className="voucher-table-container">
            <table className="voucher-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Discount</th>
                  <th>Min Order</th>
                  <th>Max Discount</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Usage Limit</th>
                  <th>Used</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVouchers.length > 0 ? (
                  filteredVouchers.map((v) => {
                    const status = getVoucherStatus(v);
                    return (
                      <tr key={v.id || v._id}>
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
                        <td>
                          <span className={`voucher-status ${getVoucherStatus(v).toLowerCase().replace(" ", "-")}`}>
                            {getVoucherStatus(v)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="edit-btn"
                            onClick={() => handleEdit(v)}
                            disabled={v.isDeleted}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleDelete(v)}
                            disabled={v.isDeleted}
                          >
                            {v.isDeleted ? "Disabled" : "❌ Delete"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="11" style={{ textAlign: "center" }}>
                      Không có voucher nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}