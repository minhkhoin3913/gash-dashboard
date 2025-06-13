import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Orders.css';
import axios from 'axios';

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
      console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

const Orders = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    order_status: '',
    pay_status: '',
    shipping_status: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  // Status options
  const orderStatusOptions = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const payStatusOptions = ['unpaid', 'paid', 'failed'];
  const shippingStatusOptions = ['not_shipped', 'in_transit', 'delivered'];

  // Fetch orders
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

      const response = await fetchWithRetry(`/orders?acc_id=${user?._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched orders:', response);
      setOrders(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
      console.error('Fetch orders error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch order details
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
      console.log('Fetched order details:', response);
      setOrderDetails(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load order details');
      console.error('Fetch order details error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId, user]);

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

  // Handle authentication state
  useEffect(() => {
    console.log('Orders useEffect: user=', user, 'isAuthLoading=', isAuthLoading);
    if (isAuthLoading) {
      return;
    }
    if (!user && !localStorage.getItem('token')) {
      console.log('No user and no token, redirecting to login');
      navigate('/login', { replace: true });
    } else if (user) {
      fetchOrders();
    }
  }, [user, isAuthLoading, navigate, fetchOrders]);

  // Fetch order details when selectedOrderId changes
  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderDetails();
    }
  }, [selectedOrderId, fetchOrderDetails]);

  // Toggle order details visibility
  const handleToggleDetails = useCallback((orderId) => {
    setSelectedOrderId(prev => prev === orderId ? null : orderId);
  }, []);

  // Start editing order
  const handleEditOrder = useCallback((order) => {
    setEditingOrderId(order._id);
    setEditFormData({
      order_status: order.order_status || 'pending',
      pay_status: order.pay_status || 'unpaid',
      shipping_status: order.shipping_status || 'not_shipped',
    });
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingOrderId(null);
    setEditFormData({ order_status: '', pay_status: '', shipping_status: '' });
  }, []);

  // Handle status change
  const handleStatusChange = useCallback((e, field) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Submit updated statuses
  const handleUpdateSubmit = useCallback((orderId) => {
    updateOrder(orderId, editFormData);
  }, [editFormData, updateOrder]);

  // Retry fetching orders
  const handleRetry = useCallback(() => {
    fetchOrders();
    if (selectedOrderId) {
      fetchOrderDetails();
    }
  }, [fetchOrders, fetchOrderDetails, selectedOrderId]);

  // Format price
  const formatPrice = useCallback((price) => {
    if (typeof price !== 'number' || isNaN(price)) return 'N/A';
    return `$${price.toFixed(2)}`;
  }, []);

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="orders-container">
        <div className="orders-loading" role="status" aria-live="true">
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

      <h1 className="orders-title">Admin Order Management</h1>

      {/* Error Display */}
      {error && (
        <div className="orders-error" role="alert" aria-live="true">
          <span className="orders-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="orders-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading orders"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="orders-loading" role="status" aria-live="true">
          <div className="orders-loading-spinner"></div>
          <p>Loading orders...</p>
        </div>
      )}

      {/* Orders Table */}
      {!loading && orders.length === 0 && !error ? (
        <div className="orders-empty" role="status">
          <p>No orders found.</p>
          <button 
            className="orders-continue-shopping-button"
            onClick={() => navigate('/')}
            aria-label="Continue shopping"
          >
            Continue Shopping
          </button>
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
              {orders.map((order, index) => (
                <React.Fragment key={order._id}>
                  <tr className="orders-table-row">
                    <td>{index + 1}</td>
                    <td>{order._id}</td>
                    <td>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'}</td>
                    <td>{formatPrice(order.totalPrice)}</td>
                    <td className={`orders-status-${order.order_status?.toLowerCase() || 'unknown'}`}>
                      {editingOrderId === order._id ? (
                        <select
                          value={editFormData.order_status}
                          onChange={(e) => handleStatusChange(e, 'order_status')}
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
                    <td>
                      {editingOrderId === order._id ? (
                        <select
                          value={editFormData.pay_status}
                          onChange={(e) => handleStatusChange(e, 'pay_status')}
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
                    <td>
                      {editingOrderId === order._id ? (
                        <select
                          value={editFormData.shipping_status}
                          onChange={(e) => handleStatusChange(e, 'shipping_status')}
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
                    <td>
                      {editingOrderId === order._id ? (
                        <div className="orders-action-buttons">
                          <button
                            onClick={() => handleUpdateSubmit(order._id)}
                            className="orders-update-button"
                            aria-label={`Update order ${order._id}`}
                            disabled={loading}
                          >
                            Update
                          </button>
                          <button
                            onClick={handleCancelEdit}
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
                            onClick={() => handleToggleDetails(order._id)}
                            className="orders-toggle-details"
                            aria-label={selectedOrderId === order._id ? `Hide details for order ${order._id}` : `View details for order ${order._id}`}
                          >
                            {selectedOrderId === order._id ? 'Hide Details' : 'View Details'}
                          </button>
                          <button
                            onClick={() => handleEditOrder(order)}
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
                      <td colSpan="8">
                        <div className="orders-details-section">
                          <h2 className="orders-details-title">Order Details</h2>
                          {orderDetails.length === 0 ? (
                            <p className="orders-no-details">No details available for this order.</p>
                          ) : (
                            <div className="orders-details-list">
                              {orderDetails.map((detail) => (
                                <div key={detail._id} className="orders-detail-item">
                                  <div className="orders-detail-info">
                                    <p className="orders-detail-name">
                                      {detail.variant_id?.pro_id?.pro_name || 'Unnamed Product'}
                                    </p>
                                    <p className="orders-detail-variant">
                                      Color: {detail.variant_id?.color_id?.color_name || 'N/A'}, 
                                      Size: {detail.variant_id?.size_id?.size_name || 'N/A'}
                                    </p>
                                    <p className="orders-detail-quantity">Quantity: {detail.Quantity || 0}</p>
                                    <p className="orders-detail-price">
                                      Unit Price: {formatPrice(detail.UnitPrice)}
                                    </p>
                                    <p className="orders-detail-feedback">
                                      Feedback: {detail.feedback_details || 'None'}
                                    </p>
                                  </div>
                                  <p className="orders-detail-total">
                                    {formatPrice((detail.UnitPrice || 0) * (detail.Quantity || 0))}
                                  </p>
                                </div>
                              ))}
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
    </div>
  );
};

export default Orders;