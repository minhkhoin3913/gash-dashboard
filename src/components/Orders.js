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

// Format price to VND
function formatPrice(price) {
  if (typeof price !== 'number' || isNaN(price)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);
}

// Helper to determine which order status options should be enabled for update
const getOrderStatusOptionDisabled = (currentStatus, optionValue) => {
  if (currentStatus === "cancelled" || currentStatus === "delivered") return true;

  let allowedStatuses = [];
  if (currentStatus === "pending") {
    allowedStatuses = ["confirmed", "shipping", "delivered", "cancelled"];
  } else if (currentStatus === "confirmed") {
    allowedStatuses = ["shipping", "delivered"];
  } else if (currentStatus === "shipping") {
    allowedStatuses = ["delivered"];
  }

  if (optionValue === "cancelled" && currentStatus !== "pending") return true;
  if (optionValue === currentStatus) return false;
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
  const [showRefundProofModal, setShowRefundProofModal] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState("");
  const [refundProofFile, setRefundProofFile] = useState(null);
  const [refundProofPreview, setRefundProofPreview] = useState("");
  const [uploadingRefundProof, setUploadingRefundProof] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    orderId: null,
    variantId: null,
    content: "",
    rating: null,
  });
  const [editingFeedback, setEditingFeedback] = useState(null);

  const handleRefundProofChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRefundProofFile(file);
    setRefundProofPreview(URL.createObjectURL(file));
  };

  const { user, isAuthLoading } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    order_status: "",
    pay_status: "",
    refund_status: "",
    refund_proof: "",
  });

  const isOrderDataChanged = (order) => {
    const fields = ["order_status", "pay_status", "refund_status", "refund_proof"];
    for (let key of fields) {
      const oldVal = order[key] ?? "";
      const newVal = editFormData[key] ?? "";
      if (key === "refund_proof" && refundProofFile) return true;
      if (oldVal !== newVal) return true;
    }
    return false;
  };

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    orderStatus: "",
    payStatus: "",
    minPrice: "",
    maxPrice: "",
  });
  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(20);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const orderStatusOptions = [
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "shipping", label: "Shipping" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const payStatusOptions = [
    { value: "unpaid", label: "Unpaid" },
    { value: "paid", label: "Paid" },
  ];

  const refundStatusOptions = [
    { value: "not_applicable", label: "Not Applicable" },
    { value: "pending_refund", label: "Pending Refund" },
    { value: "refunded", label: "Refunded" },
  ];

  const displayStatus = (str) => {
    if (!str || typeof str !== "string") return str || "N/A";
    if (str === "not_applicable") return "Not Applicable";
    if (str === "pending_refund") return "Pending Refund";
    if (str === "refunded") return "Refunded";
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

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
    );
  };

  const hasActiveFilters = useCallback(() => {
    return (
      filters.dateFrom ||
      filters.dateTo ||
      filters.orderStatus ||
      filters.payStatus ||
      filters.minPrice ||
      filters.maxPrice ||
      searchText
    );
  }, [filters, searchText]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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
      const params = {};
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.orderStatus) params.order_status = filters.orderStatus;
      if (filters.payStatus) params.pay_status = filters.payStatus;
      if (filters.minPrice) params.minPrice = filters.minPrice;
      if (filters.maxPrice) params.maxPrice = filters.maxPrice;
      if (searchText) params.q = searchText;
      if (user.role === "admin" || user.role === "manager") {
        if (filters.accId) params.acc_id = filters.accId;
      }
      const queryString = new URLSearchParams(params).toString();
      const url = `/orders/search${queryString ? `?${queryString}` : ""}`;
      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("Orders Response:", response);
      setOrders(
        Array.isArray(response)
          ? response.sort(
              (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
            )
          : []
      );
    } catch (err) {
      setError(err.message || "Failed to load orders");
      console.error("Fetch Orders Error:", err);
    } finally {
      setLoading(false);
    }
  }, [user, filters, searchText]);

  useEffect(() => {
    setFilteredOrders(orders);
  }, [orders]);

  const fetchOrderDetails = useCallback(async () => {
    if (!selectedOrderId || !user?._id) return;
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");
      const response = await fetchWithRetry(
        `/order-details/get-all-order-details/${selectedOrderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log("Order Details Response:", response);
      setOrderDetails(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error("Fetch Order Details Error:", err);
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

  const addFeedback = useCallback(async () => {
    if (!feedbackForm.orderId || !feedbackForm.variantId) return;
    if (!feedbackForm.content || feedbackForm.content.length > 500) {
      setToast({
        type: "error",
        message: "Feedback content must be non-empty and less than 500 characters",
      });
      return;
    }
    if (!feedbackForm.rating || feedbackForm.rating < 1 || feedbackForm.rating > 5) {
      setToast({ type: "error", message: "Rating must be between 1 and 5" });
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await apiClient.patch(
        `/orders/${feedbackForm.orderId}/add-feedback/${feedbackForm.variantId}`,
        {
          feedback: {
            content: feedbackForm.content,
            rating: feedbackForm.rating,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setToast({ type: "success", message: "Feedback added successfully" });
      setFeedbackForm({ orderId: null, variantId: null, content: "", rating: null });
      fetchOrderDetails();
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to add feedback" });
    } finally {
      setLoading(false);
    }
  }, [feedbackForm, fetchOrderDetails]);

  const editFeedback = useCallback(async () => {
    if (!editingFeedback?.orderId || !editingFeedback?.variantId) return;
    if (!feedbackForm.content || feedbackForm.content.length > 500) {
      setToast({
        type: "error",
        message: "Feedback content must be non-empty and less than 500 characters",
      });
      return;
    }
    if (!feedbackForm.rating || feedbackForm.rating < 1 || feedbackForm.rating > 5) {
      setToast({ type: "error", message: "Rating must be between 1 and 5" });
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await apiClient.put(
        `/orders/${editingFeedback.orderId}/edit-feedback/${editingFeedback.variantId}`,
        {
          feedback: {
            content: feedbackForm.content,
            rating: feedbackForm.rating,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setToast({ type: "success", message: "Feedback updated successfully" });
      setEditingFeedback(null);
      setFeedbackForm({ orderId: null, variantId: null, content: "", rating: null });
      fetchOrderDetails();
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to update feedback" });
    } finally {
      setLoading(false);
    }
  }, [editingFeedback, feedbackForm, fetchOrderDetails]);

  const deleteFeedback = useCallback(
    async (orderId, variantId) => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        await apiClient.delete(
          `/orders/${orderId}/delete-feedback/${variantId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setToast({ type: "success", message: "Feedback deleted successfully" });
        fetchOrderDetails();
      } catch (err) {
        setToast({
          type: "error",
          message: err.message || "Failed to delete feedback",
        });
      } finally {
        setLoading(false);
      }
    },
    [fetchOrderDetails]
  );

  const updateOrder = useCallback(
    async (orderId, updatedData) => {
      setLoading(true);
      setError("");
      setToast(null);
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No authentication token found");
        const originalOrder = orders.find((o) => o._id === orderId);
        if (!originalOrder) throw new Error("Order not found");

        const changedFields = {};
        ["order_status", "pay_status", "refund_status"].forEach((key) => {
          const oldVal = originalOrder[key] ?? "";
          const newVal = updatedData[key] ?? "";
          if (oldVal !== newVal) changedFields[key] = newVal;
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
          if (uploadResult.data?.url) {
            changedFields.refund_proof = uploadResult.data.url;
          } else {
            throw new Error("Failed to upload refund proof");
          }
        }

        if (Object.keys(changedFields).length === 0) {
          setToast({ type: "info", message: "No changes detected" });
          setEditingOrderId(null);
          setEditFormData({
            order_status: "",
            pay_status: "",
            refund_status: "",
            refund_proof: "",
          });
          return;
        }

        const newStatus = changedFields.order_status || originalOrder.order_status;
        const newPayStatus = changedFields.pay_status || originalOrder.pay_status;
        const newRefundStatus =
          changedFields.refund_status || originalOrder.refund_status;

        if (newStatus === "delivered" && newPayStatus !== "paid") {
          setToast({
            type: "error",
            message: "Delivered orders must have pay_status = paid",
          });
          return;
        }

        if (originalOrder.payment_method === "COD") {
          if (
            ["pending", "confirmed", "shipping"].includes(newStatus) &&
            newPayStatus === "paid"
          ) {
            setToast({
              type: "error",
              message: "COD orders cannot be paid before delivery",
            });
            return;
          }
        }

        if (originalOrder.payment_method === "VNPAY") {
          if (newStatus !== "cancelled" && newPayStatus !== "paid") {
            setToast({
              type: "error",
              message: "VNPAY orders must remain paid unless cancelled",
            });
            return;
          }
          if (newStatus === "cancelled" && newPayStatus === "paid") {
            if (!["pending_refund", "refunded"].includes(newRefundStatus)) {
              setToast({
                type: "error",
                message:
                  "Cancelled paid VNPAY orders must have refund_status = pending_refund or refunded",
              });
              return;
            }
            if (
              newRefundStatus === "refunded" &&
              !changedFields.refund_proof &&
              !originalOrder.refund_proof
            ) {
              setToast({
                type: "error",
                message: "Refunded status requires a refund proof",
              });
              return;
            }
          }
          if (
            originalOrder.refund_status === "pending_refund" &&
            Object.keys(changedFields).some(
              (key) => !["refund_status", "refund_proof"].includes(key)
            )
          ) {
            setToast({
              type: "error",
              message:
                "When in pending_refund, only refund_status and refund_proof can be updated",
            });
            return;
          }
        }

        const response = await apiClient.put(`/orders/${orderId}`, changedFields, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOrders((prev) =>
          prev.map((order) =>
            order._id === orderId ? { ...order, ...response.data } : order
          )
        );
        setEditingOrderId(null);
        setEditFormData({
          order_status: "",
          pay_status: "",
          refund_status: "",
          refund_proof: "",
        });
        setRefundProofFile(null);
        setRefundProofPreview("");
        setToast({ type: "success", message: "Order updated successfully!" });
      } catch (err) {
        setToast({ type: "error", message: err.message || "Failed to update order" });
      } finally {
        setLoading(false);
        setUploadingRefundProof(false);
      }
    },
    [orders, refundProofFile, user]
  );

  const cancelOrder = useCallback(
    async (orderId) => {
      setLoading(true);
      setError("");
      setToast(null);
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No authentication token found");
        await apiClient.patch(
          `/orders/${orderId}/cancel`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setToast({ type: "success", message: "Order cancelled successfully" });
        fetchOrders();
      } catch (err) {
        setToast({
          type: "error",
          message: err.message || "Failed to cancel order",
        });
      } finally {
        setLoading(false);
      }
    },
    [fetchOrders]
  );

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      orderStatus: "",
      payStatus: "",
      minPrice: "",
      maxPrice: "",
    });
    setSearchText("");
    setCurrentPage(1);
  }, []);

  const toggleFilters = useCallback(() => {
    setShowFilters((prev) => !prev);
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem("token")) {
      navigate("/login", { replace: true });
    } else if (user) {
      fetchOrders();
    }
  }, [user, isAuthLoading, navigate, fetchOrders]);

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
    socket.on("orderUpdated", () => fetchOrders());
    return () => {
      socket.off("orderUpdated");
    };
  }, [user, fetchOrders]);

  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentOrders = filteredOrders.slice(startIndex, endIndex);

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  const handlePreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const handleEditChange = useCallback((field, value) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleFeedbackChange = useCallback((field, value) => {
    setFeedbackForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  return (
    <div className="orders-container">
      {toast && (
        <div className={`orders-toast orders-toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
      {error && (
        <div className="orders-error">
          <span className="orders-error-icon">⚠️</span>
          {error}
          <button
            onClick={fetchOrders}
            className="orders-retry-button"
            disabled={loading}
          >
            Retry
          </button>
        </div>
      )}
      {loading && (
        <div className="orders-loading">
          <div className="orders-loading-spinner"></div>
          Loading orders...
        </div>
      )}
      {!loading && !error && filteredOrders.length === 0 && (
        <div className="orders-empty">
          <p>No orders found.</p>
          <button
            onClick={() => navigate("/")}
            className="orders-continue-shopping-button"
          >
            Continue Shopping
          </button>
        </div>
      )}
      {!loading && filteredOrders.length > 0 && (
        <div className="orders-header">
          <h1 className="orders-title">Orders</h1>
          <div className="orders-header-actions">
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by name, address, phone, or product"
              className="orders-filter-input"
              aria-label="Search orders"
            />
            <button
              onClick={toggleFilters}
              className="orders-filter-toggle"
              aria-label="Toggle filters"
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
            </button>
          </div>
        </div>
      )}
      {showFilters && (
        <div className="orders-filters">
          <h2 className="orders-search-title">Search Orders</h2>
          <div className="orders-filters-grid">
            <div className="orders-search-section">
              <div className="orders-filter-group">
                <label className="orders-filter-label">Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                  className="orders-filter-input"
                  aria-label="Date from"
                />
              </div>
              <div className="orders-filter-group">
                <label className="orders-filter-label">Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                  className="orders-filter-input"
                  aria-label="Date to"
                />
              </div>
            </div>
            <div className="orders-filter-options">
              <div className="orders-filter-group">
                <label className="orders-filter-label">Order Status</label>
                <select
                  value={filters.orderStatus}
                  onChange={(e) =>
                    handleFilterChange("orderStatus", e.target.value)
                  }
                  className="orders-filter-select"
                  aria-label="Order status"
                >
                  <option value="">All</option>
                  {orderStatusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="orders-filter-group">
                <label className="orders-filter-label">Payment Status</label>
                <select
                  value={filters.payStatus}
                  onChange={(e) => handleFilterChange("payStatus", e.target.value)}
                  className="orders-filter-select"
                  aria-label="Payment status"
                >
                  <option value="">All</option>
                  {payStatusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="orders-filter-group">
                <label className="orders-filter-label">Min Price</label>
                <input
                  type="number"
                  value={filters.minPrice}
                  onChange={(e) => handleFilterChange("minPrice", e.target.value)}
                  className="orders-filter-input"
                  placeholder="0"
                  min="0"
                  aria-label="Minimum price"
                />
              </div>
              <div className="orders-filter-group">
                <label className="orders-filter-label">Max Price</label>
                <input
                  type="number"
                  value={filters.maxPrice}
                  onChange={(e) => handleFilterChange("maxPrice", e.target.value)}
                  className="orders-filter-input"
                  placeholder="Any"
                  min="0"
                  aria-label="Maximum price"
                />
              </div>
            </div>
          </div>
          <div className="orders-filter-actions">
            <button
              onClick={clearFilters}
              className="orders-clear-filters"
              disabled={!hasActiveFilters()}
              aria-label="Clear filters"
            >
              Clear Filters
            </button>
            <span className="orders-filter-summary">
              {hasActiveFilters() ? "Filters applied" : "No filters applied"}
            </span>
          </div>
        </div>
      )}
      {!loading && filteredOrders.length > 0 && (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Index</th>
                <th>Order ID</th>
                <th>Order Date</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Total Price</th>
                <th>Discount</th>
                <th>Final Price</th>
                <th>Order Status</th>
                <th>Payment Method</th>
                <th>Payment Status</th>
                <th>Refund</th>
                <th>Actions</th>
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
      {filteredOrders.length > 0 && (
        <div className="orders-pagination">
          <div className="orders-pagination-info">
            Showing {startIndex + 1} to{" "}
            {Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length}{" "}
            orders
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
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`orders-pagination-page ${
                    currentPage === page ? "active" : ""
                  }`}
                  onClick={() => handlePageChange(page)}
                  aria-label={`Page ${page}`}
                >
                  {page}
                </button>
              ))}
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