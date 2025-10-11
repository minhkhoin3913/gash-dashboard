import RefundProofModal from "./RefundProofModal";

import React, { useState, useEffect, useContext, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "../styles/Orders.css";
import axios from "axios";
import { io } from "socket.io-client";

// Định dạng ngày dd/MM/yyyy
function formatDateVN(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "N/A";
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Helper to determine which order status options should be enabled for update
const getOrderStatusOptionDisabled = (currentStatus, optionValue) => {
  // Only allow valid transitions
  // If cancelled or delivered, disable all options
  if (currentStatus === "cancelled" || currentStatus === "delivered")
    return true;

  let allowedStatuses = [];
  if (currentStatus === "pending") {
    allowedStatuses = ["confirmed", "shipping", "delivered", "cancelled"];
  } else if (currentStatus === "confirmed") {
    allowedStatuses = ["shipping", "delivered"];
  } else if (currentStatus === "shipping") {
    allowedStatuses = ["delivered"];
  }

  // Disable 'cancelled' unless currentStatus is 'pending'
  if (optionValue === "cancelled" && currentStatus !== "pending") return true;

  // Always allow current status to be selected
  if (optionValue === currentStatus) return false;
  // Disable if not in allowedStatuses
  return !allowedStatuses.includes(optionValue);
};

// API client with interceptors
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000",
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message =
      status === 401
        ? "Unauthorized access - please log in"
        : status === 404
          ? "Resource not found"
        : status >= 500
          ? "Server error - please try again later"
          : "Network error - please check your connection";
    return Promise.reject({ ...error, message });
  }
);

// API functions
const fetchWithRetry = async (url, options = {}, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await apiClient.get(url, options);
      return response.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, i))
      );
    }
  }
};

const Orders = () => {
  // State cho modal ảnh refund proof
  const [showRefundProofModal, setShowRefundProofModal] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState("");
  // State cho upload refund proof
  const [refundProofFile, setRefundProofFile] = useState(null);
  const [refundProofPreview, setRefundProofPreview] = useState("");
  const [uploadingRefundProof, setUploadingRefundProof] = useState(false);
  // Chỉ preview khi chọn file, chưa upload
  const handleRefundProofChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRefundProofFile(file);
    setRefundProofPreview(URL.createObjectURL(file));
  };
  const { user, isAuthLoading } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  // So sánh dữ liệu chỉnh sửa với dữ liệu gốc
  const isOrderDataChanged = (order) => {
    // Compare all editable fields, treat undefined and empty string as equal
    const fields = ["order_status", "pay_status", "shipping_status", "refund_status"];
    for (let key of fields) {
      const oldVal = order[key] ?? "";
      const newVal = editFormData[key] ?? "";
      if (oldVal !== newVal) return true;
    }
    return false;
  };
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    order_status: "",
    pay_status: "",
    shipping_status: "",
    refund_proof: ""
  });

  // Filter states
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    orderStatus: "",
    payStatus: "",
    shippingStatus: "",
    minPrice: "",
    maxPrice: "",
  });
  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(20);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const socketRef = useRef(null);

  // Order status options
  const orderStatusOptions = [
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "shipping", label: "Shipping" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" },
  ];

  // Payment status options
  const payStatusOptions = [
    { value: "unpaid", label: "Unpaid" },
    { value: "paid", label: "Paid" },
  ];

  // Refund status options
  const refundStatusOptions = [
    { value: "not_applicable", label: "Not Applicable" },
    { value: "pending_refund", label: "Pending Refund" },
    { value: "refunded", label: "Refuned" },
  ];

  // Helper: Hiển thị đẹp và viết hoa chữ cái đầu cho các trạng thái
  const displayStatus = (str) => {
    if (!str || typeof str !== "string") return str || "N/A";
    if (str === "not_applicable") return "Not Applicable";
    if (str === "pending_refund") return "Pending Refund";
    if (str === "refunded") return "Refunded";
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Disable Update button for specific cases
  const shouldDisableUpdate = (method, status, pay, refund) => {
    return (
      (method === "COD" &&
        status === "delivered" &&
        pay === "paid" &&
        refund === "not_applicable") ||
      (method === "COD" &&
        status === "cancelled" &&
        pay === "unpaid" &&
        refund === "not_applicable") ||
      (method === "VNPAY" &&
        status === "delivered" &&
        pay === "paid" &&
        refund === "not_applicable") ||
      (method === "VNPAY" &&
        status === "cancelled" &&
        pay === "paid" &&
        refund === "refunded")
      // Trường hợp Cancelled, VNPAY, Paid vẫn cho update nên loại bỏ trường hợp này khỏi disable
    );
  };

  // Check if any filters are active
  const hasActiveFilters = useCallback(() => {
    return (
      filters.dateFrom ||
      filters.dateTo ||
      filters.orderStatus ||
      filters.payStatus ||
      filters.shippingStatus ||
      filters.minPrice ||
      filters.maxPrice ||
      filters.searchQuery
    );
  }, [filters]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch orders with filters (server-side filtering)
  const fetchOrders = useCallback(async () => {
    if (!user?._id) {
      setError("User not authenticated");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");
      // Build query params
      const params = {};
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.orderStatus) params.order_status = filters.orderStatus;
      if (filters.payStatus) params.pay_status = filters.payStatus;
      if (filters.shippingStatus)
        params.shipping_status = filters.shippingStatus;
      if (filters.minPrice) params.minPrice = filters.minPrice;
      if (filters.maxPrice) params.maxPrice = filters.maxPrice;
      // Only admin/manager can filter by acc_id
      if ((user.role === "admin" || user.role === "manager") && filters.accId)
        params.acc_id = filters.accId;
      const queryString = new URLSearchParams(params).toString();
      const url = `/orders/search${queryString ? `?${queryString}` : ""}`;
      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // console.log("Orders API response:", response);
      setOrders(
        Array.isArray(response)
          ? response.sort(
            (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
          )
          : []
      );
    } catch (err) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [user, filters]);

  // Search handler FE: lọc orders theo name, addressReceive, phone
  // Search realtime: lọc khi nhập
  useEffect(() => {
    if (!orders || !Array.isArray(orders)) return;
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) {
      setFilteredOrders(orders);
      return;
    }
    const filtered = orders.filter(order => {
      const name = (order.acc_id?.name || "").toLowerCase();
      const address = (order.addressReceive || "").toLowerCase();
      const phone = (order.phone || order.acc_id?.phone || "").toLowerCase();
      return (
        name.includes(keyword) ||
        address.includes(keyword) ||
        phone.includes(keyword)
      );
    });
    setFilteredOrders(filtered);
  }, [orders, searchText]);

  // Update filtered orders when orders change (pagination only)
  useEffect(() => {
    const sortedOrders = Array.isArray(orders)
      ? [...orders].sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
      : [];
    setFilteredOrders(sortedOrders);
  }, [orders]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentOrders = filteredOrders.slice(startIndex, endIndex);

  // Handle page change
  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  // Handle previous/next page
  const handlePreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);
  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  // Handle filter changes
  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      orderStatus: "",
      payStatus: "",
      shippingStatus: "",
      minPrice: "",
      maxPrice: "",
      searchQuery: "",
    });
  }, []);

  // Toggle filter visibility
  const toggleFilters = useCallback(() => {
    setShowFilters((prev) => !prev);
  }, []);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem("token")) {
      navigate("/login", { replace: true });
    } else if (user) {
      fetchOrders();
    }
  }, [user, isAuthLoading, navigate, fetchOrders]);

  // Real-time order status updates
  useEffect(() => {
    if (!user?._id) return;
    if (!socketRef.current) {
      socketRef.current = io(
        process.env.REACT_APP_API_URL || "http://localhost:5000",
        {
          transports: ["websocket"],
          withCredentials: true,
        }
      );
    }
    const socket = socketRef.current;
    // Listen for order updates (any order change)
    const handleOrderUpdated = (data) => {
      // Optionally, filter by userId if you only want to update for certain users
      fetchOrders();
    };
    socket.on("orderUpdated", handleOrderUpdated);
    return () => {
      socket.off("orderUpdated", handleOrderUpdated);
      // Optionally disconnect socket on unmount
      // socket.disconnect();
    };
  }, [user, fetchOrders]);

  // Fetch order details when selectedOrderId changes
  const fetchOrderDetails = useCallback(async () => {
    if (!selectedOrderId || !user?._id) return;
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");
      const response = await fetchWithRetry(
        `/order-details?order_id=${selectedOrderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setOrderDetails(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || "Failed to load order details");
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId, user]);

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderDetails();
    }
  }, [selectedOrderId, fetchOrderDetails]);

  // Update order statuses
  const updateOrder = useCallback(async (orderId, updatedData) => {
    setLoading(true);
    setError("");
    setToast(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      // Find the original order
      const originalOrder = orders.find(o => o._id === orderId);
      if (!originalOrder) throw new Error("Order not found");

      // Helper to build changed fields
      const buildChangedFields = (refundProofUrl) => {
        const changedFields = {};
        ["order_status", "pay_status", "shipping_status", "refund_status"].forEach(key => {
          const oldVal = originalOrder[key] ?? "";
          const newVal = updatedData[key] ?? "";
          if (oldVal !== newVal) {
            changedFields[key] = newVal;
          }
        });

        if (refundProofFile) {
          setUploadingRefundProof(true);
          const formData = new FormData();
          formData.append("image", refundProofFile);
          const uploadResult = await axios.post(
            `${process.env.REACT_APP_API_URL || "http://localhost:5000"}/upload`,
            formData,
            { headers: { "Content-Type": "multipart/form-data" } }
          );
          setUploadingRefundProof(false);
          setLoading(false);
          return;
        }
        setUploadingRefundProof(false);
        if (uploadResult.data && uploadResult.data.url) {
          // Sau khi upload thành công, gọi update với refundProofUrl
          const refundProofUrl = uploadResult.data.url;
          const changedFields = buildChangedFields(refundProofUrl);
          if (Object.keys(changedFields).length === 0) {
            setToast({ type: "info", message: "No changes detected. Nothing to update." });
            setEditingOrderId(null);
            setEditFormData({
              order_status: "",
              pay_status: "",
              shipping_status: "",
            });
            setLoading(false);
            return;
          }
          const response = await apiClient.put(`/orders/${orderId}`, changedFields, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setOrders((prev) =>
            prev.map((order) =>
              order._id === orderId ? { ...order, ...response.data } : order
            )
          );
          setToast({ type: "success", message: "Order updated successfully" });
          setEditingOrderId(null);
          setEditFormData({
            order_status: "",
            pay_status: "",
            shipping_status: "",
          });
        } else {
          setToast({ type: "error", message: "Upload refund proof thất bại!" });
          setLoading(false);
          return;
        }
      } else {
        // Không có file mới, chỉ update các trường khác
        const refundProofUrl = updatedData.refund_proof;
        const changedFields = buildChangedFields(refundProofUrl);
        if (Object.keys(changedFields).length === 0) {
          setToast({ type: "info", message: "No changes detected. Nothing to update." });
          setEditingOrderId(null);
          setEditFormData({
            order_status: "",
            pay_status: "",
            shipping_status: "",
          });
          setLoading(false);
          return;
        }
        const response = await apiClient.put(`/orders/${orderId}`, changedFields, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOrders((prev) =>
          prev.map((order) =>
            order._id === orderId ? { ...order, ...response.data } : order
          )
        );
        setToast({ type: "success", message: "Order updated successfully" });
        setEditingOrderId(null);
        setEditFormData({
          order_status: "",
          pay_status: "",
          shipping_status: "",
        });
      }
    } catch (err) {
      setError(err.message || "Failed to update order");
      setToast({
        type: "error",
        message: err.message || "Failed to update order",
      });
      console.error("Update order error:", err);
    } finally {
      setLoading(false);
    }
  }, [orders, refundProofFile]);

  // Format price
  const formatPrice = useCallback((price) => {
    if (typeof price !== "number" || isNaN(price)) return "N/A";
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(price);
  }, []);

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="orders-container">
        <div className="orders-loading" role="status" aria-live="polite">
          <div className="orders-loading-spinner"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-container">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`orders-toast ${toast.type === "success"
            ? "orders-toast-success"
            : "orders-toast-error"
            }`}
          role="alert"
        >
          {toast.message}
        </div>
      )}

      <div className="orders-header">
        <h1 className="orders-title">Admin Order Management</h1>
        {/* Di chuyển nút filter xuống dưới search */}
        <div style={{ marginBottom: 16 }}></div>
      </div>

      {/* Search Section */}
      <div className="orders-search-bar" style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Search by name, phone, address..."
          className="orders-filter-input"
          style={{ width: 300 }}
        />
      </div>

      {/* Nút filter chuyển xuống dưới search */}
      <div className="orders-header-actions" style={{ marginBottom: 16 }}>
        <button
          className="orders-filter-toggle"
          onClick={toggleFilters}
          aria-label="Toggle filters"
        >
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="orders-filters">
          <div className="orders-filters-grid">
            <div className="orders-filter-options">
              {/* Date Range */}
              <div className="orders-filter-group">
                <label htmlFor="dateFrom" className="orders-filter-label">
                  Date From
                </label>
                <input
                  type="date"
                  id="dateFrom"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    handleFilterChange("dateFrom", e.target.value)
                  }
                  className="orders-filter-input"
                />
              </div>
              <div className="orders-filter-group">
                <label htmlFor="dateTo" className="orders-filter-label">
                  Date To
                </label>
                <input
                  type="date"
                  id="dateTo"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                  className="orders-filter-input"
                />
              </div>
              {/* Status Filters */}
              <div className="orders-filter-group">
                <label htmlFor="orderStatus" className="orders-filter-label">
                  Order Status
                </label>
                <select
                  id="orderStatus"
                  value={filters.orderStatus}
                  onChange={(e) =>
                    handleFilterChange("orderStatus", e.target.value)
                  }
                  className="orders-filter-select"
                >
                  <option value="">All Statuses</option>
                  {orderStatusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="orders-filter-group">
                <label htmlFor="payStatus" className="orders-filter-label">
                  Payment Status
                </label>
                <select
                  id="payStatus"
                  value={filters.payStatus}
                  onChange={(e) =>
                    handleFilterChange("payStatus", e.target.value)
                  }
                  className="orders-filter-select"
                >
                  <option value="">All Payment Statuses</option>
                  {payStatusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Price Range */}
              <div className="orders-filter-group">
                <label htmlFor="minPrice" className="orders-filter-label">
                  Min Price
                </label>
                <input
                  type="number"
                  id="minPrice"
                  value={filters.minPrice}
                  onChange={(e) =>
                    handleFilterChange("minPrice", e.target.value)
                  }
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="orders-filter-input"
                />
              </div>
              <div className="orders-filter-group">
                <label htmlFor="maxPrice" className="orders-filter-label">
                  Max Price
                </label>
                <input
                  type="number"
                  id="maxPrice"
                  value={filters.maxPrice}
                  onChange={(e) =>
                    handleFilterChange("maxPrice", e.target.value)
                  }
                  placeholder="9999.99"
                  min="0"
                  step="0.01"
                  className="orders-filter-input"
                />
              </div>
            </div>
          </div>
          <div className="orders-filter-actions">
            <button
              className="orders-clear-filters"
              onClick={clearFilters}
              disabled={!hasActiveFilters()}
              aria-label="Clear all filters"
            >
              Clear Filters
            </button>
            <div className="orders-filter-summary">
              Showing {startIndex + 1} to{" "}
              {Math.min(endIndex, filteredOrders.length)} of{" "}
              {filteredOrders.length} orders
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="orders-error" role="alert" aria-live="polite">
          <span className="orders-error-icon">⚠</span>
          <span>{error}</span>
          <button
            className="orders-retry-button"
            onClick={fetchOrders}
            aria-label="Retry loading orders"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="orders-loading" role="status" aria-live="polite">
          <div className="orders-loading-spinner"></div>
          <p>Loading orders...</p>
        </div>
      )}

      {/* Orders Table */}
      {!loading && filteredOrders.length === 0 && !error ? (
        <div className="orders-empty" role="status">
          <p>
            {orders.length === 0
              ? "No orders found."
              : "No orders match the current filters."}
          </p>
          {/* {orders.length === 0 && (
            <button
              className="orders-continue-shopping-button"
              onClick={() => navigate("/")}
              aria-label="Continue shopping"
            >
              Continue Shopping
            </button>
          )} */}
        </div>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Order ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Order Date</th>
                <th>Total</th>
                <th>Order Status</th>
                <th>Payment Method</th>
                <th>Payment Status</th>
                <th>Refund</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentOrders.map((order, index) => (
                <React.Fragment key={order._id}>
                  <tr className="orders-table-row">
                    <td style={{ textAlign: "center" }}>{startIndex + index + 1}</td>
                    <td>{order._id}</td>
                    <td style={{ textAlign: "center" }}>{formatDateVN(order.orderDate)}</td>
                    <td style={{ textAlign: "center" }}>{order.acc_id?.name || order.acc_id?.username || "Guest"}</td>
                    <td style={{ textAlign: "center" }}>{order.phone}</td>
                    <td>{order.addressReceive}</td>
                    <td style={{ textAlign: "center" }}>{formatPrice(order.totalPrice)}</td>
                    <td style={{ textAlign: "center" }}>{formatPrice(order.discountAmount || 0)}</td>
                    <td style={{ textAlign: "center" }}>{formatPrice(order.finalPrice || order.totalPrice)}</td>
                    <td style={{ textAlign: "center" }}>
                      {editingOrderId === order._id ? (
                        <select
                          className="orders-edit-select"
                          value={editFormData.order_status || order.order_status}
                          onChange={(e) =>
                            handleEditChange("order_status", e.target.value)
                          }
                          disabled={loading}
                          aria-label="Edit order status"
                        >
                          {orderStatusOptions.map((opt) => (
                            <option
                              key={opt.value}
                              value={opt.value}
                              disabled={getOrderStatusOptionDisabled(
                                order.order_status,
                                opt.value
                              )}
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        displayStatus(order.order_status)
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {displayStatus(order.payment_method)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {editingOrderId === order._id ? (
                        <select
                          className="orders-edit-select"
                          value={editFormData.pay_status || order.pay_status}
                          onChange={(e) =>
                            handleEditChange("pay_status", e.target.value)
                          }
                          disabled={loading}
                          aria-label="Edit payment status"
                        >
                          {payStatusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        displayStatus(order.pay_status)
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {editingOrderId === order._id ? (
                        <>
                          <select
                            className="orders-edit-select"
                            value={editFormData.refund_status || order.refund_status}
                            onChange={(e) =>
                              handleEditChange("refund_status", e.target.value)
                            }
                            disabled={loading}
                            aria-label="Edit refund status"
                          >
                            {refundStatusOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          {(editFormData.refund_status === "pending_refund" ||
                            editFormData.refund_status === "refunded" ||
                            order.refund_status === "refunded") && (
                            <div style={{ marginTop: 8 }}>
                              <input
                                id={`refund-proof-upload-${order._id}`}
                                type="file"
                                accept="image/*"
                                onChange={handleRefundProofChange}
                                disabled={uploadingRefundProof}
                                style={{ marginLeft: 8 }}
                              />
                              {(refundProofPreview || editFormData.refund_proof) && (
                                <div style={{ marginTop: 8 }}>
                                  <img
                                    src={refundProofPreview || editFormData.refund_proof}
                                    alt="Refund proof preview"
                                    style={{
                                      maxWidth: 180,
                                      maxHeight: 180,
                                      border: "1px solid #ccc",
                                      marginTop: 4,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          {order.refund_proof && (
                            <div style={{ marginTop: 4 }}>
                              <img
                                src={order.refund_proof}
                                alt="Refund proof"
                                style={{
                                  maxWidth: 180,
                                  maxHeight: 180,
                                  border: "1px solid #ccc",
                                }}
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {displayStatus(order.refund_status)}
                          {order.refund_proof && (
                            <div style={{ marginTop: 4 }}>
                              <img
                                src={order.refund_proof}
                                alt="Refund proof"
                                style={{
                                  maxWidth: 180,
                                  maxHeight: 180,
                                  border: "1px solid #ccc",
                                  cursor: "pointer",
                                }}
                                onClick={() => {
                                  setModalImageUrl(order.refund_proof);
                                  setShowRefundProofModal(true);
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {editingOrderId === order._id ? (
                        <div className="orders-action-buttons">
                          <button
                            onClick={() => {
                              if (!isOrderDataChanged(order)) {
                                setToast({
                                  type: "info",
                                  message: "No changes detected",
                                });
                                setEditingOrderId(null);
                                setEditFormData({
                                  order_status: "",
                                  pay_status: "",
                                  refund_status: "",
                                  refund_proof: "",
                                });
                                return;
                              }
                              updateOrder(order._id, editFormData);
                            }}
                            className="orders-update-button"
                            disabled={loading || uploadingRefundProof}
                            aria-label={`Update order ${order._id}`}
                          >
                            Update
                          </button>
                          <button
                            onClick={() => {
                              setEditingOrderId(null);
                              setEditFormData({
                                order_status: "",
                                pay_status: "",
                                refund_status: "",
                                refund_proof: "",
                              });
                              setRefundProofFile(null);
                              setRefundProofPreview("");
                            }}
                            className="orders-cancel-button"
                            disabled={loading}
                            aria-label={`Cancel editing order ${order._id}`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="orders-action-buttons">
                          <button
                            onClick={() =>
                              setSelectedOrderId(
                                selectedOrderId === order._id ? null : order._id
                              )
                            }
                            className="orders-edit-button"
                            aria-label={
                              selectedOrderId === order._id
                                ? `Hide details for order ${order._id}`
                                : `View details for order ${order._id}`
                            }
                          >
                            {selectedOrderId === order._id
                              ? "Hide Details"
                              : "View Details"}
                          </button>
                          <button
                            onClick={() => {
                              setEditingOrderId(order._id);
                              setEditFormData({
                                order_status: order.order_status,
                                pay_status: order.pay_status,
                                refund_status: order.refund_status,
                                refund_proof: order.refund_proof || "",
                              });
                            }}
                            className="orders-edit-button"
                            aria-label={`Edit order ${order._id}`}
                            disabled={shouldDisableUpdate(
                              order.payment_method,
                              order.order_status,
                              order.pay_status,
                              order.refund_status
                            )}
                          >
                            Update
                          </button>
                          <button
                            onClick={() => cancelOrder(order._id)}
                            className="orders-cancel-button"
                            aria-label={`Cancel order ${order._id}`}
                            disabled={
                              order.order_status !== "pending" || loading
                            }
                          >
                            Cancel Order
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {selectedOrderId === order._id && (
                    <tr className="orders-details-row">
                      <td colSpan="14" className="orders-details-cell">
                        <div className="orders-details-section">
                          <h2 className="orders-details-title">Order Details</h2>
                          {orderDetails.length === 0 ? (
                            <p className="orders-no-details">
                              No details available for this order. This may be due to no items being associated or restricted access.
                            </p>
                          ) : (
                            <>
                              <p>Rendering {orderDetails.length} order details</p>
                              <div className="orders-details-table-container" style={{ display: 'table', visibility: 'visible', width: '100%' }}>
                                <table className="orders-details-table" style={{ display: 'table', visibility: 'visible', width: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th>Product</th>
                                      <th>Color</th>
                                      <th>Size</th>
                                      <th>Quantity</th>
                                      <th>Unit Price</th>
                                      <th>Total</th>
                                      <th>Discount</th>
                                      <th>Voucher</th>
                                      <th>Feedback</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {orderDetails.map((detail, index) => {
                                      console.log(`Rendering detail ${index}:`, detail);
                                      console.log(`Variant data for detail ${index}:`, detail.variant);
                                      return (
                                        <tr
                                          key={detail._id || index}
                                          className="orders-detail-item-row"
                                          style={{ display: 'table-row', visibility: 'visible' }}
                                        >
                                          <td>
                                            {detail.variant?.name ||
                                              detail.variant_id?.pro_id?.pro_name ||
                                              detail.pro_id?.pro_name ||
                                              "Unnamed Product"}
                                          </td>
                                          <td>
                                            {detail.variant?.color ||
                                              detail.variant_id?.color_id?.color_name ||
                                              "N/A"}
                                          </td>
                                          <td>
                                            {detail.variant?.size ||
                                              detail.variant_id?.size_id?.size_name ||
                                              "N/A"}
                                          </td>
                                          <td style={{ textAlign: "center" }}>
                                            {detail.quantity || detail.Quantity || 0}
                                          </td>
                                          <td style={{ textAlign: "center" }}>
                                            {formatPrice(detail.unitPrice || detail.UnitPrice || 0)}
                                          </td>
                                          <td style={{ textAlign: "center" }}>
                                            {formatPrice(
                                              (detail.unitPrice || detail.UnitPrice || 0) *
                                              (detail.quantity || detail.Quantity || 0)
                                            )}
                                          </td>
                                          <td style={{ textAlign: "center" }}>
                                            {index === 0 ? formatPrice(order.discountAmount || 0) : "-"}
                                          </td>
                                          <td style={{ textAlign: "center" }}>
                                            {index === 0 ? (order.voucher_id ? order.voucher_id.voucher_name || order.voucher_id : "None") : "-"}
                                          </td>
                                          <td>
                                            {detail.feedback &&
                                            (detail.feedback.rating ||
                                              detail.feedback.content) ? (
                                              <div>
                                                {detail.feedback.rating &&
                                                  `Rating: ${detail.feedback.rating}/5`}
                                                {detail.feedback.rating &&
                                                  detail.feedback.content && <br />}
                                                {detail.feedback.content}
                                              </div>
                                            ) : (
                                              "None"
                                            )}
                                          </td>
                                          <td style={{ textAlign: "center" }}>
                                            {order.order_status === "delivered" && (
                                              <div className="orders-action-buttons">
                                                {detail.feedback &&
                                                (detail.feedback.rating ||
                                                  detail.feedback.content) ? (
                                                  <>
                                                    <button
                                                      onClick={() => {
                                                        setEditingFeedback({
                                                          orderId: order._id,
                                                          variantId: detail.variant?._id || detail.variantId || detail._id,
                                                        });
                                                        setFeedbackForm({
                                                          orderId: order._id,
                                                          variantId: detail.variant?._id || detail.variantId || detail._id,
                                                          content: detail.feedback.content || "",
                                                          rating: detail.feedback.rating || null,
                                                        });
                                                      }}
                                                      className="orders-edit-button"
                                                      aria-label={`Edit feedback for variant ${detail.variant?._id || detail.variantId || detail._id}`}
                                                    >
                                                      Edit Feedback
                                                    </button>
                                                    <button
                                                      onClick={() =>
                                                        deleteFeedback(
                                                          order._id,
                                                          detail.variant?._id || detail.variantId || detail._id
                                                        )
                                                      }
                                                      className="orders-cancel-button"
                                                      aria-label={`Delete feedback for variant ${detail.variant?._id || detail.variantId || detail._id}`}
                                                    >
                                                      Delete Feedback
                                                    </button>
                                                  </>
                                                ) : (
                                                  <button
                                                    onClick={() => {
                                                      setFeedbackForm({
                                                        orderId: order._id,
                                                        variantId: detail.variant?._id || detail.variantId || detail._id,
                                                        content: "",
                                                        rating: null,
                                                      });
                                                    }}
                                                    className="orders-edit-button"
                                                    aria-label={`Add feedback for variant ${detail.variant?._id || detail.variantId || detail._id}`}
                                                  >
                                                    Add Feedback
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    <tr className="orders-detail-total-row">
                                      <td
                                        colSpan={5}
                                        style={{ textAlign: "right", fontWeight: "bold" }}
                                      >
                                        Total for all products:
                                      </td>
                                      <td style={{ textAlign: "center", fontWeight: "bold" }}>
                                        {formatPrice(
                                          orderDetails.reduce(
                                            (sum, detail) =>
                                              sum +
                                              (detail.unitPrice || detail.UnitPrice || 0) *
                                              (detail.quantity || detail.Quantity || 0),
                                            0
                                          )
                                        )}
                                      </td>
                                      <td style={{ textAlign: "center", fontWeight: "bold" }}>
                                        {formatPrice(order.discountAmount || 0)}
                                      </td>
                                      <td style={{ textAlign: "center", fontWeight: "bold" }}>
                                        {order.voucher_id ? order.voucher_id.voucher_name || order.voucher_id : "None"}
                                      </td>
                                      <td colSpan={2}></td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              {(feedbackForm.orderId || editingFeedback) && (
                                <div style={{ marginTop: 24 }}>
                                  <h3>
                                    {editingFeedback
                                      ? "Edit Feedback"
                                      : "Add Feedback"}
                                  </h3>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <textarea
                                      value={feedbackForm.content}
                                      onChange={(e) =>
                                        handleFeedbackChange("content", e.target.value)
                                      }
                                      placeholder="Enter feedback content"
                                      maxLength={500}
                                      style={{ height: 100, resize: "vertical" }}
                                      aria-label="Feedback content"
                                    />
                                    <select
                                      value={feedbackForm.rating || ""}
                                      onChange={(e) =>
                                        handleFeedbackChange("rating", parseInt(e.target.value))
                                      }
                                      aria-label="Feedback rating"
                                    >
                                      <option value="" disabled>
                                        Select rating
                                      </option>
                                      {[1, 2, 3, 4, 5].map((rating) => (
                                        <option key={rating} value={rating}>
                                          {rating}/5
                                        </option>
                                      ))}
                                    </select>
                                    <div className="orders-action-buttons">
                                      <button
                                        onClick={editingFeedback ? editFeedback : addFeedback}
                                        className="orders-update-button"
                                        disabled={loading}
                                        aria-label={
                                          editingFeedback
                                            ? "Update feedback"
                                            : "Submit feedback"
                                        }
                                      >
                                        {editingFeedback ? "Update" : "Submit"}
                                      </button>
                                      <button
                                        onClick={() => {
                                          setFeedbackForm({
                                            orderId: null,
                                            variantId: null,
                                            content: "",
                                            rating: null,
                                          });
                                          setEditingFeedback(null);
                                        }}
                                        className="orders-cancel-button"
                                        disabled={loading}
                                        aria-label="Cancel feedback"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                              <table style={{ marginTop: 24, width: "100%" }}>
                                <tbody>
                                  <tr>
                                    <td
                                      style={{ textAlign: "left", width: "180px" }}
                                    >
                                      <strong>Order Status:</strong>
                                    </td>
                                    <td style={{ textAlign: "left" }}>
                                      {displayStatus(order.order_status)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{ textAlign: "left", width: "180px" }}
                                    >
                                      <strong>Payment Method:</strong>
                                    </td>
                                    <td style={{ textAlign: "left" }}>
                                      {displayStatus(order.payment_method)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{ textAlign: "left", width: "180px" }}
                                    >
                                      <strong>Payment Status:</strong>
                                    </td>
                                    <td style={{ textAlign: "left" }}>
                                      {displayStatus(order.pay_status)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{ textAlign: "left", width: "180px" }}
                                    >
                                      <strong>Refund:</strong>
                                    </td>
                                    <td style={{ textAlign: "left" }}>
                                      {displayStatus(order.refund_status)}
                                      {order.refund_proof && (
                                        <div style={{ marginTop: 4 }}>
                                          <img
                                            src={order.refund_proof}
                                            alt="Refund proof"
                                            style={{
                                              maxWidth: 180,
                                              maxHeight: 180,
                                              border: "1px solid #ccc",
                                              cursor: "pointer",
                                            }}
                                            onClick={() => {
                                              setModalImageUrl(order.refund_proof);
                                              setShowRefundProofModal(true);
                                            }}
                                          />
                                        </div>
                                      )}
                                      <RefundProofModal
                                        imageUrl={
                                          showRefundProofModal ? modalImageUrl : ""
                                        }
                                        onClose={() => setShowRefundProofModal(false)}
                                      />
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{ textAlign: "left", width: "180px" }}
                                    >
                                      <strong>Voucher:</strong>
                                    </td>
                                    <td style={{ textAlign: "left" }}>
                                      {order.voucher_id
                                        ? `${order.voucher_id.voucher_name || order.voucher_id} (${order.voucher_id.code || "N/A"})`
                                        : "None"}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      style={{ textAlign: "left", width: "180px" }}
                                    >
                                      <strong>Order Feedback:</strong>
                                    </td>
                                    <td style={{ textAlign: "left" }}>
                                      {order.feedback_ids && order.feedback_ids.length > 0
                                        ? order.feedback_ids.map((fb, idx) => (
                                            <div key={idx}>
                                              {fb.feedback.rating &&
                                                `Rating: ${fb.feedback.rating}/5`}
                                              {fb.feedback.rating &&
                                                fb.feedback.content && <br />}
                                              {fb.feedback.content}
                                            </div>
                                          ))
                                        : "None"}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filteredOrders.length > 0 && (
        <div className="orders-pagination">
          <div className="orders-pagination-info">
            Showing {startIndex + 1} to{" "}
            {Math.min(endIndex, filteredOrders.length)} of{" "}
            {filteredOrders.length} orders
          </div>
          <div className="orders-pagination-controls">
            <button
              className="orders-pagination-button"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              Previous
            </button>
            <div className="orders-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    className={`orders-pagination-page ${currentPage === page ? "active" : ""
                      }`}
                    onClick={() => handlePageChange(page)}
                    aria-label={`Page ${page}`}
                  >
                    {page}
                  </button>
                )
              )}
            </div>
            <button
              className="orders-pagination-button"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
