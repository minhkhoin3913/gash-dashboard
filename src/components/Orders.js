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
        // Nếu có refundProofUrl mới thì gửi lên
        if (refundProofUrl && refundProofUrl !== originalOrder.refund_proof) {
          changedFields.refund_proof = refundProofUrl;
        }
        return changedFields;
      };

      // Nếu có file refundProofFile thì upload trước
      if (refundProofFile) {
        setUploadingRefundProof(true);
        const formData = new FormData();
        formData.append("image", refundProofFile);
        let uploadResult;
        try {
          uploadResult = await axios.post("http://localhost:5000/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (err) {
          setToast({ type: "error", message: "Upload refund proof thất bại!" });
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
              {currentOrders.map((order, index) => {
                const isEditEnabled = editingOrderId === order._id;
                return (
                  <React.Fragment key={order._id}>
                    <tr className="orders-table-row">
                      <td style={{ textAlign: "center" }}>
                        {startIndex + index + 1}
                      </td>
                      <td>
                        {selectedOrderId === order._id
                          ? order._id
                          : order._id?.slice(0, 8) + (order._id?.length > 8 ? '...' : '')}
                      </td>
                      <td>{order.acc_id?.name || "N/A"}</td>
                      <td>{order.phone || order.acc_id?.phone || "N/A"}</td>
                      <td>{order.addressReceive || "N/A"}</td>
                      <td style={{ textAlign: "center" }}>
                        {order.orderDate
                          ? formatDateVN(order.orderDate)
                          : "N/A"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {formatPrice(order.totalPrice)}
                      </td>
                      <td
                        className={`orders-status-${order.order_status?.toLowerCase() || "unknown"
                          }`}
                        style={{ textAlign: "center" }}
                      >
                        {isEditEnabled ? (
                          <select
                            value={editFormData.order_status}
                            onChange={(e) => {
                              const newStatus = e.target.value;
                              setEditFormData((prev) => {
                                let newPayStatus = prev.pay_status;
                                // Nếu là COD thì delivered = paid, còn lại = unpaid
                                if (order.payment_method === "COD") {
                                  newPayStatus = newStatus === "delivered" ? "paid" : "unpaid";
                                } else {
                                  // Giữ logic cũ cho các phương thức khác
                                  newPayStatus = newStatus === "delivered" ? "paid" : prev.pay_status;
                                }
                                return {
                                  ...prev,
                                  order_status: newStatus,
                                  pay_status: newPayStatus,
                                };
                              });
                            }}
                            className="orders-status-select"
                            aria-label="Order status"
                            disabled={!isEditEnabled}
                          >
                            {orderStatusOptions.map((status) => (
                              <option
                                key={status.value}
                                value={status.value}
                                disabled={getOrderStatusOptionDisabled(order.order_status, status.value)}
                              >
                                {status.label}
                              </option>
                            ))}
                          </select>

                        ) : (
                          order.order_status ? displayStatus(order.order_status) : "N/A"
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {order.payment_method ? displayStatus(order.payment_method) : "N/A"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {isEditEnabled ? (
                          <select
                            value={editFormData.pay_status}
                            onChange={(e) =>
                              setEditFormData((prev) => ({
                                ...prev,
                                pay_status: e.target.value,
                              }))
                            }
                            className="orders-status-select"
                            aria-label="Payment status"
                            disabled={!isEditEnabled}
                          >
                            {payStatusOptions.map((status) => (
                              <option
                                key={status.value}
                                value={status.value}
                                disabled={
                                  (order.payment_method === "VNPAY" && status.value === "unpaid") ||
                                  (order.payment_method === "COD" && status.value === "paid")
                                }
                              >
                                {status.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          order.pay_status ? displayStatus(order.pay_status) : "N/A"
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {isEditEnabled ? (
                          <>
                            <select
                              value={
                                editFormData.refund_status ||
                                order.refund_status ||
                                "not_applicable"
                              }
                              onChange={(e) =>
                                setEditFormData((prev) => ({
                                  ...prev,
                                  refund_status: e.target.value,
                                }))
                              }
                              className="orders-status-select"
                              aria-label="Refund status"
                              disabled={!isEditEnabled}
                            >
                              {refundStatusOptions.map((opt) => {
                                const currentRefund =
                                  editFormData.refund_status ||
                                  order.refund_status ||
                                  "not_applicable";
                                let isDisabled = false;
                                // Nếu order_status khác 'cancelled' thì không thể chọn pending_refund/refunded
                                if (
                                  editFormData.order_status !== "cancelled" &&
                                  (opt.value === "pending_refund" ||
                                    opt.value === "refunded")
                                ) {
                                  isDisabled = true;
                                }
                                // Nếu current là refunded, chỉ cho chọn refunded
                                if (
                                  currentRefund === "refunded" &&
                                  opt.value !== "refunded"
                                ) {
                                  isDisabled = true;
                                }
                                // Nếu current là pending_refund, disable not_applicable
                                if (
                                  currentRefund === "pending_refund" &&
                                  opt.value === "not_applicable"
                                ) {
                                  isDisabled = true;
                                }
                                return (
                                  <option
                                    key={opt.value}
                                    value={opt.value}
                                    disabled={isDisabled}
                                  >
                                    {opt.label}
                                  </option>
                                );
                              })}
                            </select>
                            {/* Nếu chọn refunded thì hiển thị form upload ảnh */}
                            {(editFormData.refund_status === "refunded" || order.refund_status === "refunded") && (
                              <div style={{ marginTop: 8 }}>
                                {/* <label htmlFor={`refund-proof-upload-${order._id}`}>Upload refund proof:</label> */}
                                <input
                                  id={`refund-proof-upload-${order._id}`}
                                  type="file"
                                  accept="image/*"
                                  onChange={handleRefundProofChange}
                                  disabled={uploadingRefundProof}
                                  style={{ marginLeft: 8 }}
                                />
                                {/* {uploadingRefundProof && <span style={{ color: '#888', marginLeft: 8 }}>Đang upload...</span>} */}
                                {/* Preview ảnh */}
                                {(refundProofPreview || editFormData.refund_proof) && (
                                  <div style={{ marginTop: 8 }}>
                                    {/* <span>Preview:</span><br /> */}
                                    <img
                                      src={refundProofPreview || editFormData.refund_proof}
                                      alt="Refund proof preview"
                                      style={{ maxWidth: 180, maxHeight: 180, border: '1px solid #ccc', marginTop: 4 }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Nếu đã có proof thì hiển thị url */}
                            {order.refund_proof && (
                              <>
                                <br />
                                <div style={{ marginTop: 4 }}>
                                  <img src={order.refund_proof} alt="Refund proof" style={{ maxWidth: 180, maxHeight: 180, border: '1px solid #ccc' }} />
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {order.refund_status ? displayStatus(order.refund_status) : "N/A"}

                          </>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {editingOrderId === order._id ? (
                          <div className="orders-action-buttons">
                            <button
                              onClick={() => {
                                // Validate required fields
                                if (!isOrderDataChanged(order)) {
                                  setEditingOrderId(null);
                                  setEditFormData({
                                    order_status: "",
                                    pay_status: "",
                                    shipping_status: "",
                                  });
                                  setToast({ type: "info", message: "No changes detected. Nothing to update." });
                                  return;
                                }
                                // Nếu refund_status là refunded, phải có ảnh (file mới hoặc đã có refund_proof)
                                const isRefunded = (editFormData.refund_status === "refunded" || order.refund_status === "refunded");
                                const hasProof = refundProofFile || editFormData.refund_proof || order.refund_proof;
                                if (isRefunded && !hasProof) {
                                  setToast({ type: "error", message: "Please select refund confirmation photo!" });
                                  return;
                                }
                                updateOrder(order._id, editFormData);
                              }}
                              className="orders-update-button"
                              aria-label={`Update order ${order._id}`}
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
                              onClick={() => setEditingOrderId(null)}
                              className="orders-cancel-button"
                              aria-label={`Cancel editing order ${order._id}`}
                              disabled={loading}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="orders-action-buttons">
                            <button
                              onClick={() =>
                                setSelectedOrderId(
                                  selectedOrderId === order._id
                                    ? null
                                    : order._id
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
                                  shipping_status: order.shipping_status,
                                  refund_proof: order.refund_proof || ""
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
                          </div>
                        )}
                      </td>
                    </tr>
                    {selectedOrderId === order._id && (
                      <tr className="orders-details-row">
                        <td colSpan="8" className="orders-details-cell">
                          <div className="orders-details-section">
                            <h2 className="orders-details-title">Order Details</h2>
                            {orderDetails.filter((detail) => {
                              const detailOrderId =
                                typeof detail.order_id === "object"
                                  ? detail.order_id._id
                                  : detail.order_id;
                              return detailOrderId === order._id;
                            }).length === 0 ? (
                              <p className="orders-no-details">No details available for this order.</p>
                            ) : (
                              <>
                                <div className="orders-details-table-container">
                                  <table className="orders-details-table">
                                    <thead>
                                      <tr>
                                        <th>Product</th>
                                        <th>Color</th>
                                        <th>Size</th>
                                        <th>Quantity</th>
                                        <th>Unit Price</th>
                                        <th>Total</th>
                                        <th>Feedback</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(() => {
                                        const details = orderDetails.filter((detail) => {
                                          const detailOrderId =
                                            typeof detail.order_id === "object"
                                              ? detail.order_id._id
                                              : detail.order_id;
                                          return detailOrderId === order._id;
                                        });
                                        const total = details.reduce((sum, detail) => sum + (detail.UnitPrice || 0) * (detail.Quantity || 0), 0);
                                        return (
                                          <>
                                            {details.map((detail) => (
                                              <tr key={detail._id} className="orders-detail-item-row">
                                                <td>{detail.variant_id?.pro_id?.pro_name || "Unnamed Product"}</td>
                                                <td>{detail.variant_id?.color_id?.color_name || "N/A"}</td>
                                                <td>{detail.variant_id?.size_id?.size_name || "N/A"}</td>
                                                <td style={{ textAlign: "center" }}>{detail.Quantity || 0}</td>
                                                <td style={{ textAlign: "center" }}>{formatPrice(detail.UnitPrice)}</td>
                                                <td style={{ textAlign: "center" }}>{formatPrice((detail.UnitPrice || 0) * (detail.Quantity || 0))}</td>
                                                <td>{detail.feedback_details || "None"}</td>
                                              </tr>
                                            ))}
                                            <tr className="orders-detail-total-row">
                                              <td colSpan={5} style={{ textAlign: "right", fontWeight: "bold" }}>Total for all products:</td>
                                              <td style={{ textAlign: "center", fontWeight: "bold" }}>{formatPrice(total)}</td>
                                              <td></td>
                                            </tr>
                                          </>
                                        );
                                      })()}
                                    </tbody>
                                  </table>
                                </div>
                                {/* Thông tin order phía dưới bảng sản phẩm, mỗi dòng một thông tin */}
                                <table style={{ marginTop: 24, width: '100%' }}>
                                  <tbody>
                                    <tr>
                                      <td style={{ textAlign: 'left', width: '180px' }}><strong>Order Status:</strong></td>
                                      <td style={{ textAlign: 'left' }}>{displayStatus(order.order_status)}</td>
                                    </tr>
                                    <tr>
                                      <td style={{ textAlign: 'left', width: '180px' }}><strong>Payment Method:</strong></td>
                                      <td style={{ textAlign: 'left' }}>{displayStatus(order.payment_method)}</td>
                                    </tr>
                                    <tr>
                                      <td style={{ textAlign: 'left', width: '180px' }}><strong>Payment Status:</strong></td>
                                      <td style={{ textAlign: 'left' }}>{displayStatus(order.pay_status)}</td>
                                    </tr>
                                    <tr>
                                      <td style={{ textAlign: 'left', width: '180px' }}><strong>Refund:</strong></td>
                                      <td style={{ textAlign: 'left' }}>
                                        {displayStatus(order.refund_status)}
                                        {order.refund_proof ? (
                                          <div style={{ marginTop: 4 }}>
                                            <img
                                              src={order.refund_proof}
                                              alt="Refund proof"
                                              style={{ maxWidth: 180, maxHeight: 180, border: '1px solid #ccc', cursor: 'pointer' }}
                                              onClick={() => {
                                                setModalImageUrl(order.refund_proof);
                                                setShowRefundProofModal(true);
                                              }}
                                            />
                                          </div>
                                        ) : null}
                                        {/* Modal hiển thị ảnh refund proof to */}
                                        <RefundProofModal
                                          imageUrl={showRefundProofModal ? modalImageUrl : ""}
                                          onClose={() => setShowRefundProofModal(false)}
                                        />
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
                );
              })}
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
