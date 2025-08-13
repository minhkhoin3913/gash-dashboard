import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Orders.css';
import axios from 'axios';
import { useRef } from 'react';
import { io } from 'socket.io-client';

// API client with interceptors
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 10000,
});

apiClient.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const message = status === 401 ? 'Unauthorized access - please log in' :
                    status === 404 ? 'Resource not found' :
                    status >= 500 ? 'Server error - please try again later' :
                    'Network error - please check your connection';
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
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

const Orders = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    order_status: '',
    pay_status: '',
    shipping_status: '',
  });

  // Filter states
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    orderStatus: '',
    payStatus: '',
    shippingStatus: '',
    minPrice: '',
    maxPrice: '',
    searchQuery: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(20);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const socketRef = useRef(null);

  // Status options
  const orderStatusOptions = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const payStatusOptions = ['unpaid', 'paid', 'failed'];
  const shippingStatusOptions = ['not_shipped', 'in_transit', 'delivered'];

  // Check if any filters are active
  const hasActiveFilters = useCallback(() => {
    return filters.dateFrom || filters.dateTo || filters.orderStatus || filters.payStatus || filters.shippingStatus || filters.minPrice || filters.maxPrice || filters.searchQuery;
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
      setError('User not authenticated');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      // Build query params
      const params = {};
      if (filters.searchQuery) params.q = filters.searchQuery;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.orderStatus) params.order_status = filters.orderStatus;
      if (filters.payStatus) params.pay_status = filters.payStatus;
      if (filters.shippingStatus) params.shipping_status = filters.shippingStatus;
      if (filters.minPrice) params.minPrice = filters.minPrice;
      if (filters.maxPrice) params.maxPrice = filters.maxPrice;
      // Only admin/manager can filter by acc_id
      if ((user.role === 'admin' || user.role === 'manager') && filters.accId) params.acc_id = filters.accId;
      const queryString = new URLSearchParams(params).toString();
      const url = `/orders/search${queryString ? `?${queryString}` : ''}`;
      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(Array.isArray(response) ? response.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate)) : []);
      setCurrentPage(1); // Reset to first page on new fetch
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [user, filters]);

  // Update filtered orders when orders change (pagination only)
  useEffect(() => {
    setFilteredOrders(orders);
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
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);
  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  // Handle filter changes
  const handleFilterChange = useCallback((field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      orderStatus: '',
      payStatus: '',
      shippingStatus: '',
      minPrice: '',
      maxPrice: '',
      searchQuery: ''
    });
  }, []);

  // Toggle filter visibility
  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem('token')) {
      navigate('/login', { replace: true });
    } else if (user) {
      fetchOrders();
    }
  }, [user, isAuthLoading, navigate, fetchOrders]);

  // Real-time order status updates
  useEffect(() => {
    if (!user?._id) return;
    if (!socketRef.current) {
      socketRef.current = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
        transports: ['websocket'],
        withCredentials: true,
      });
    }
    const socket = socketRef.current;
    // Listen for order updates (any order change)
    const handleOrderUpdated = (data) => {
      // Optionally, filter by userId if you only want to update for certain users
      fetchOrders();
    };
    socket.on('orderUpdated', handleOrderUpdated);
    return () => {
      socket.off('orderUpdated', handleOrderUpdated);
      // Optionally disconnect socket on unmount
      // socket.disconnect();
    };
  }, [user, fetchOrders]);

  // Fetch order details when selectedOrderId changes
  const fetchOrderDetails = useCallback(async () => {
    if (!selectedOrderId || !user?._id) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry(`/order-details?order_id=${selectedOrderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrderDetails(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load order details');
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
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');

      const response = await apiClient.put(`/orders/${orderId}`, updatedData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Order updated:', response.data);
      setOrders(prev =>
        prev.map(order =>
          order._id === orderId ? { ...order, ...updatedData } : order
        )
      );
      setToast({ type: 'success', message: 'Order updated successfully' });
      setEditingOrderId(null);
      setEditFormData({ order_status: '', pay_status: '', shipping_status: '' });
    } catch (err) {
      setError(err.message || 'Failed to update order');
      setToast({ type: 'error', message: err.message || 'Failed to update order' });
      console.error('Update order error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Format price
  const formatPrice = useCallback((price) => {
    if (typeof price !== 'number' || isNaN(price)) return 'N/A';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
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
          className={`orders-toast ${toast.type === 'success' ? 'orders-toast-success' : 'orders-toast-error'}`}
          role="alert"
        >
          {toast.message}
        </div>
      )}

      <div className="orders-header">
      <h1 className="orders-title">Admin Order Management</h1>
        <div className="orders-header-actions">
          <button 
            className="orders-filter-toggle"
            onClick={toggleFilters}
            aria-label="Toggle filters"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="orders-filters">
          <h2 className="orders-search-title">Search Orders</h2>
          <div className="orders-filters-grid">
            <div className="orders-search-section">
              {/* Search Query */}
              <div className="orders-filter-group">
                <label htmlFor="searchQuery" className="orders-filter-label">Search</label>
                <input
                  type="text"
                  id="searchQuery"
                  value={filters.searchQuery}
                  onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
                  placeholder="Search by order ID, status, address, phone..."
                  className="orders-filter-input"
                />
              </div>
            </div>
            <div className="orders-filter-options">
              {/* Date Range */}
              <div className="orders-filter-group">
                <label htmlFor="dateFrom" className="orders-filter-label">Date From</label>
                <input
                  type="date"
                  id="dateFrom"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className="orders-filter-input"
                />
              </div>
              <div className="orders-filter-group">
                <label htmlFor="dateTo" className="orders-filter-label">Date To</label>
                <input
                  type="date"
                  id="dateTo"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className="orders-filter-input"
                />
              </div>
              {/* Status Filters */}
              <div className="orders-filter-group">
                <label htmlFor="orderStatus" className="orders-filter-label">Order Status</label>
                <select
                  id="orderStatus"
                  value={filters.orderStatus}
                  onChange={(e) => handleFilterChange('orderStatus', e.target.value)}
                  className="orders-filter-select"
                >
                  <option value="">All Statuses</option>
                  {orderStatusOptions.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="orders-filter-group">
                <label htmlFor="payStatus" className="orders-filter-label">Payment Status</label>
                <select
                  id="payStatus"
                  value={filters.payStatus}
                  onChange={(e) => handleFilterChange('payStatus', e.target.value)}
                  className="orders-filter-select"
                >
                  <option value="">All Payment Statuses</option>
                  {payStatusOptions.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="orders-filter-group">
                <label htmlFor="shippingStatus" className="orders-filter-label">Shipping Status</label>
                <select
                  id="shippingStatus"
                  value={filters.shippingStatus}
                  onChange={(e) => handleFilterChange('shippingStatus', e.target.value)}
                  className="orders-filter-select"
                >
                  <option value="">All Shipping Statuses</option>
                  {shippingStatusOptions.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              {/* Price Range */}
              <div className="orders-filter-group">
                <label htmlFor="minPrice" className="orders-filter-label">Min Price</label>
                <input
                  type="number"
                  id="minPrice"
                  value={filters.minPrice}
                  onChange={(e) => handleFilterChange('minPrice', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="orders-filter-input"
                />
              </div>
              <div className="orders-filter-group">
                <label htmlFor="maxPrice" className="orders-filter-label">Max Price</label>
                <input
                  type="number"
                  id="maxPrice"
                  value={filters.maxPrice}
                  onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
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
              Showing {startIndex + 1} to {Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} orders
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
          <p>{orders.length === 0 ? 'No orders found.' : 'No orders match the current filters.'}</p>
          {orders.length === 0 && (
          <button 
            className="orders-continue-shopping-button"
            onClick={() => navigate('/')}
            aria-label="Continue shopping"
          >
            Continue Shopping
          </button>
          )}
        </div>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Order ID</th>
                <th>Order Date</th>
                <th>Total</th>
                <th>Order Status</th>
                <th>Payment Status</th>
                <th>Shipping Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentOrders.map((order, index) => (
                <React.Fragment key={order._id}>
                  <tr className="orders-table-row">
                    <td style={{ textAlign: 'center' }}>{startIndex + index + 1}</td>
                    <td>{order._id}</td>
                    <td style={{ textAlign: 'center' }}>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'}</td>
                    <td style={{ textAlign: 'center' }}>{formatPrice(order.totalPrice)}</td>
                    <td className={`orders-status-${order.order_status?.toLowerCase() || 'unknown'}`} style={{ textAlign: 'center' }}>
                      {editingOrderId === order._id ? (
                        <select
                          value={editFormData.order_status}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, order_status: e.target.value }))}
                          className="orders-status-select"
                          aria-label="Order status"
                        >
                          {orderStatusOptions.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        order.order_status || 'N/A'
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {editingOrderId === order._id ? (
                        <select
                          value={editFormData.pay_status}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, pay_status: e.target.value }))}
                          className="orders-status-select"
                          aria-label="Payment status"
                        >
                          {payStatusOptions.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        order.pay_status || 'N/A'
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {editingOrderId === order._id ? (
                        <select
                          value={editFormData.shipping_status}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, shipping_status: e.target.value }))}
                          className="orders-status-select"
                          aria-label="Shipping status"
                        >
                          {shippingStatusOptions.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        order.shipping_status || 'N/A'
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {editingOrderId === order._id ? (
                        <div className="orders-action-buttons">
                          <button
                            onClick={() => updateOrder(order._id, editFormData)}
                            className="orders-update-button"
                            aria-label={`Update order ${order._id}`}
                            disabled={loading}
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
                            onClick={() => setSelectedOrderId(selectedOrderId === order._id ? null : order._id)}
                            className="orders-edit-button"
                            aria-label={selectedOrderId === order._id ? `Hide details for order ${order._id}` : `View details for order ${order._id}`}
                          >
                            {selectedOrderId === order._id ? 'Hide Details' : 'View Details'}
                          </button>
                          <button
                            onClick={() => { setEditingOrderId(order._id); setEditFormData({ order_status: order.order_status, pay_status: order.pay_status, shipping_status: order.shipping_status }); }}
                            className="orders-edit-button"
                            aria-label={`Edit order ${order._id}`}
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
                          {orderDetails.filter(detail => {
                            // detail.order_id can be an object or string
                            const detailOrderId = typeof detail.order_id === 'object' ? detail.order_id._id : detail.order_id;
                            return detailOrderId === order._id;
                          }).length === 0 ? (
                            <p className="orders-no-details">No details available for this order.</p>
                          ) : (
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
                                  {orderDetails.filter(detail => {
                                    const detailOrderId = typeof detail.order_id === 'object' ? detail.order_id._id : detail.order_id;
                                    return detailOrderId === order._id;
                                  }).map((detail) => (
                                    <tr key={detail._id} className="orders-detail-item-row">
                                      <td>{detail.variant_id?.pro_id?.pro_name || 'Unnamed Product'}</td>
                                      <td>{detail.variant_id?.color_id?.color_name || 'N/A'}</td>
                                      <td>{detail.variant_id?.size_id?.size_name || 'N/A'}</td>
                                      <td style={{ textAlign: 'center' }}>{detail.Quantity || 0}</td>
                                      <td style={{ textAlign: 'center' }}>{formatPrice(detail.UnitPrice)}</td>
                                      <td style={{ textAlign: 'center' }}>{formatPrice((detail.UnitPrice || 0) * (detail.Quantity || 0))}</td>
                                      <td>{detail.feedback_details || 'None'}</td>
                                    </tr>
                              ))}
                                </tbody>
                              </table>
                            </div>
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
            Showing {startIndex + 1} to {Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} orders
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
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`orders-pagination-page ${currentPage === page ? 'active' : ''}`}
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