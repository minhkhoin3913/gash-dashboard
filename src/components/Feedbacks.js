import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Feedbacks.css';
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
                    status === 403 ? 'Access denied' :
                    status === 404 ? 'Feedback not found' :
                    status >= 500 ? 'Server error - please try again later' :
                    'Network error - please check your connection';
    return Promise.reject({ ...error, message });
  }
);

// Fetch with retry
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

// Validate date string
const isValidDate = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

const Feedbacks = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [feedbacks, setFeedbacks] = useState([]);
  const [editingFeedbackId, setEditingFeedbackId] = useState(null);
  const [editFormData, setEditFormData] = useState({ feedback_details: '' });
  const [newFeedbackForm, setNewFeedbackForm] = useState({ order_id: '', variant_id: '', feedback_details: '', UnitPrice: '', Quantity: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchParams, setSearchParams] = useState({
    startDate: '',
    endDate: '',
    productId: '',
    username: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [orders, setOrders] = useState([]);
  const [variants, setVariants] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch feedbacks with search parameters
  const fetchFeedbacks = useCallback(async () => {
    if (!user?._id) {
      setError('User not authenticated');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');

      const { startDate, endDate, productId, username } = searchParams;
      const query = new URLSearchParams();
      if (startDate) query.append('startDate', startDate);
      if (endDate) query.append('endDate', endDate);
      if (productId) query.append('pro_id', productId);
      if (username) query.append('username', username);

      const url = `/order-details/search${query.toString() ? `?${query.toString()}` : ''}`;
      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeedbacks(Array.isArray(response) ? response.filter(detail => detail.feedback_details) : []);
      if (response.length === 0) {
        setToast({ type: 'info', message: 'No feedback found for the given criteria' });
      }
    } catch (err) {
      setError(err.message || 'Failed to load feedbacks');
      console.error('Fetch feedbacks error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, searchParams]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch orders error:', err);
    }
  }, []);

  // Fetch variants
  const fetchVariants = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/variants', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVariants(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch variants error:', err);
    }
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch products error:', err);
    }
  }, []);

  // Fetch users (updated to use /accounts endpoint)
  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch users error:', err);
    }
  }, []);

  // Create feedback
  const createFeedback = useCallback(async () => {
    setLoading(true);
    setError('');
    setToast(null);

    const { order_id, variant_id, feedback_details, UnitPrice, Quantity } = newFeedbackForm;
    if (!order_id || !variant_id || !feedback_details || !UnitPrice || !Quantity) {
      setError('All fields are required');
      setLoading(false);
      return;
    }
    if (feedback_details.length > 500) {
      setError('Feedback cannot exceed 500 characters');
      setLoading(false);
      return;
    }
    if (Quantity < 1) {
      setError('Quantity must be at least 1');
      setLoading(false);
      return;
    }
    if (UnitPrice < 0) {
      setError('Unit price cannot be negative');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.post('/order-details', newFeedbackForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeedbacks(prev => [...prev, response.data.orderDetail]);
      setToast({ type: 'success', message: 'Feedback created successfully' });
      setNewFeedbackForm({ order_id: '', variant_id: '', feedback_details: '', UnitPrice: '', Quantity: '' });
      setShowAddForm(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create feedback');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to create feedback' });
      console.error('Create feedback error:', err);
    } finally {
      setLoading(false);
    }
  }, [newFeedbackForm]);

  // Update feedback
  const updateFeedback = useCallback(async (feedbackId) => {
    setLoading(true);
    setError('');
    setToast(null);

    const { feedback_details } = editFormData;
    if (!feedback_details) {
      setError('Feedback is required');
      setLoading(false);
      return;
    }
    if (feedback_details.length > 500) {
      setError('Feedback cannot exceed 500 characters');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.put(`/order-details/${feedbackId}`, { feedback_details }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeedbacks(prev =>
        prev.map(feedback =>
          feedback._id === feedbackId ? response.data.orderDetail : feedback
        )
      );
      setToast({ type: 'success', message: 'Feedback updated successfully' });
      setEditingFeedbackId(null);
      setEditFormData({ feedback_details: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update feedback');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update feedback' });
      console.error('Update feedback error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData]);

  // Delete feedback
  const deleteFeedback = useCallback(async (feedbackId) => {
    if (!window.confirm('Are you sure you want to delete this feedback?')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/order-details/${feedbackId}`, { feedback_details: '' }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeedbacks(prev => prev.filter(feedback => feedback._id !== feedbackId));
      setToast({ type: 'success', message: 'Feedback deleted successfully' });
      if (editingFeedbackId === feedbackId) setEditingFeedbackId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete feedback');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete feedback' });
      console.error('Delete feedback error:', err);
    } finally {
      setLoading(false);
    }
  }, [editingFeedbackId]);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem('token')) {
      navigate('/login', { replace: true });
    } else if (user) {
      fetchFeedbacks();
      fetchOrders();
      fetchVariants();
      fetchProducts();
      fetchUsers();
    }
  }, [user, isAuthLoading, navigate, fetchFeedbacks, fetchOrders, fetchVariants, fetchProducts, fetchUsers]);

  // Start editing feedback
  const handleEditFeedback = useCallback((feedback) => {
    setEditingFeedbackId(feedback._id);
    setEditFormData({ feedback_details: feedback.feedback_details });
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingFeedbackId(null);
    setEditFormData({ feedback_details: '' });
  }, []);

  // Handle field change
  const handleFieldChange = useCallback((e, formType, field) => {
    const value = e.target.value;
    if (formType === 'edit') {
      setEditFormData(prev => ({ ...prev, [field]: value }));
    } else if (formType === 'search') {
      setSearchParams(prev => ({ ...prev, [field]: value }));
    } else {
      setNewFeedbackForm(prev => ({ ...prev, [field]: value }));
    }
  }, []);

  // Submit handlers
  const handleUpdateSubmit = useCallback((feedbackId) => {
    updateFeedback(feedbackId);
  }, [updateFeedback]);

  const handleCreateSubmit = useCallback(() => {
    createFeedback();
  }, [createFeedback]);

  // Toggle add form
  const toggleAddForm = useCallback(() => {
    setShowAddForm(prev => !prev);
    setNewFeedbackForm({ order_id: '', variant_id: '', feedback_details: '', UnitPrice: '', Quantity: '' });
    setError('');
  }, []);

  // Clear search parameters
  const clearSearch = useCallback(() => {
    setSearchParams({ startDate: '', endDate: '', productId: '', username: '' });
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Loading state during auth verification
  if (isAuthLoading) {
    return (
      <div className="feedbacks-container">
        <div className="feedbacks-loading" role="status" aria-live="polite">
          <div className="feedbacks-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="feedbacks-container">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`feedbacks-toast ${toast.type === 'success' ? 'feedbacks-toast-success' : toast.type === 'info' ? 'feedbacks-toast-info' : 'feedbacks-toast-error'}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <h1 className="feedbacks-title">Feedback Management</h1>

      {/* Search Form */}
      <div className="feedbacks-search-form">
        <h2 className="feedbacks-form-title">Search Feedback</h2>
        <div className="feedbacks-form-group">
          <label htmlFor="search-start-date">Start Date</label>
          <input
            id="search-start-date"
            type="date"
            value={searchParams.startDate}
            onChange={(e) => handleFieldChange(e, 'search', 'startDate')}
            className="feedbacks-form-input"
            aria-label="Start Date"
          />
        </div>
        <div className="feedbacks-form-group">
          <label htmlFor="search-end-date">End Date</label>
          <input
            id="search-end-date"
            type="date"
            value={searchParams.endDate}
            onChange={(e) => handleFieldChange(e, 'search', 'endDate')}
            className="feedbacks-form-input"
            aria-label="End Date"
          />
        </div>
        <div className="feedbacks-form-group">
          <label htmlFor="search-product-id">Product</label>
          <select
            id="search-product-id"
            value={searchParams.productId}
            onChange={(e) => handleFieldChange(e, 'search', 'productId')}
            className="feedbacks-form-select"
            aria-label="Select Product"
          >
            <option value="">Select Product</option>
            {products.map(product => (
              <option key={product._id} value={product._id}>
                {product.pro_name || 'N/A'}
              </option>
            ))}
          </select>
        </div>
        <div className="feedbacks-form-group">
          <label htmlFor="search-username">Username</label>
          <select
            id="search-username"
            value={searchParams.username}
            onChange={(e) => handleFieldChange(e, 'search', 'username')}
            className="feedbacks-form-select"
            aria-label="Select User"
          >
            <option value="">Select User</option>
            {users.map(user => (
              <option key={user._id} value={user.username}>
                {user.username}
              </option>
            ))}
          </select>
        </div>
        <div className="feedbacks-form-actions">
          <button
            onClick={fetchFeedbacks}
            className="feedbacks-create-button"
            aria-label="Search feedbacks"
            disabled={loading}
          >
            Search
          </button>
          <button
            onClick={clearSearch}
            className="feedbacks-cancel-button"
            aria-label="Clear search"
            disabled={loading}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Add Feedback Button */}
      <div className="feedbacks-add-button-container">
        <button
          onClick={toggleAddForm}
          className="feedbacks-add-button"
          aria-label={showAddForm ? 'Cancel adding feedback' : 'Add new feedback'}
        >
          {showAddForm ? 'Cancel' : 'Add Feedback'}
        </button>
      </div>

      {/* Add Feedback Form */}
      {showAddForm && (
        <div className="feedbacks-add-form">
          <h2 className="feedbacks-form-title">Add New Feedback</h2>
          <div className="feedbacks-form-group">
            <label htmlFor="new-order-id">Order</label>
            <select
              id="new-order-id"
              value={newFeedbackForm.order_id}
              onChange={(e) => handleFieldChange(e, 'new', 'order_id')}
              className="feedbacks-form-select"
              aria-label="Select order"
              required
            >
              <option value="">Select Order</option>
              {orders.map(order => (
                <option key={order._id} value={order._id}>
                  {order.acc_id?.username || 'N/A'} - {new Date(order.orderDate).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
          <div className="feedbacks-form-group">
            <label htmlFor="new-variant-id">Product Variant</label>
            <select
              id="new-variant-id"
              value={newFeedbackForm.variant_id}
              onChange={(e) => handleFieldChange(e, 'new', 'variant_id')}
              className="feedbacks-form-select"
              aria-label="Select variant"
              required
            >
              <option value="">Select Variant</option>
              {variants.map(variant => (
                <option key={variant._id} value={variant._id}>
                  {variant.pro_id?.pro_name || 'N/A'} - {variant.color_id?.color_name || 'N/A'} - {variant.size_id?.size_name || 'N/A'}
                </option>
              ))}
            </select>
          </div>
          <div className="feedbacks-form-group">
            <label htmlFor="new-unit-price">Unit Price</label>
            <input
              id="new-unit-price"
              type="number"
              min="0"
              step="0.01"
              value={newFeedbackForm.UnitPrice}
              onChange={(e) => handleFieldChange(e, 'new', 'UnitPrice')}
              className="feedbacks-form-input"
              aria-label="Unit price"
              required
            />
          </div>
          <div className="feedbacks-form-group">
            <label htmlFor="new-quantity">Quantity</label>
            <input
              id="new-quantity"
              type="number"
              min="1"
              value={newFeedbackForm.Quantity}
              onChange={(e) => handleFieldChange(e, 'new', 'Quantity')}
              className="feedbacks-form-input"
              aria-label="Quantity"
              required
            />
          </div>
          <div className="feedbacks-form-group">
            <label htmlFor="new-feedback">Feedback</label>
            <textarea
              id="new-feedback"
              value={newFeedbackForm.feedback_details}
              onChange={(e) => handleFieldChange(e, 'new', 'feedback_details')}
              className="feedbacks-form-textarea"
              aria-label="Feedback"
              maxLength={500}
              required
            />
          </div>
          <div className="feedbacks-form-actions">
            <button
              onClick={handleCreateSubmit}
              className="feedbacks-create-button"
              aria-label="Create feedback"
              disabled={loading}
            >
              Create
            </button>
            <button
              onClick={toggleAddForm}
              className="feedbacks-cancel-button"
              aria-label="Cancel creating feedback"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="feedbacks-error" role="alert" aria-live="assertive">
          <span className="feedbacks-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="feedbacks-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading feedbacks"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="feedbacks-loading" role="status" aria-live="polite">
          <div className="feedbacks-progress-bar"></div>
          <p>Loading feedbacks...</p>
        </div>
      )}

      {/* Feedbacks Table */}
      {!loading && feedbacks.length === 0 && !error ? (
        <div className="feedbacks-empty" role="status">
          <p>No feedback found.</p>
          <button 
            className="feedbacks-continue-shopping-button"
            onClick={() => navigate('/')}
            aria-label="Continue shopping"
          >
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="feedbacks-table-container">
          <table className="feedbacks-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Order Date</th>
                <th>Username</th>
                <th>Product</th>
                <th>Feedback</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {feedbacks.map((feedback, index) => (
                <tr key={feedback._id} className="feedbacks-table-row">
                  <td>{index + 1}</td>
                  <td>{feedback.order_id?.orderDate ? new Date(feedback.order_id.orderDate).toLocaleDateString() : 'N/A'}</td>
                  <td>{feedback.order_id?.acc_id?.username || 'N/A'}</td>
                  <td>
                    {feedback.variant_id?.pro_id?.pro_name || 'N/A'} - 
                    {feedback.variant_id?.color_id?.color_name || 'N/A'} - 
                    {feedback.variant_id?.size_id?.size_name || 'N/A'}
                  </td>
                  <td>
                    {editingFeedbackId === feedback._id ? (
                      <textarea
                        value={editFormData.feedback_details}
                        onChange={(e) => handleFieldChange(e, 'edit', 'feedback_details')}
                        className="feedbacks-form-textarea"
                        aria-label="Edit feedback"
                        maxLength={500}
                        required
                      />
                    ) : (
                      feedback.feedback_details
                    )}
                  </td>
                  <td>
                    {editingFeedbackId === feedback._id ? (
                      <div className="feedbacks-action-buttons">
                        <button
                          onClick={() => handleUpdateSubmit(feedback._id)}
                          className="feedbacks-update-button"
                          aria-label={`Update feedback ${feedback._id}`}
                          disabled={loading || !editFormData.feedback_details}
                        >
                          Update
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="feedbacks-cancel-button"
                          aria-label={`Cancel editing feedback ${feedback._id}`}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="feedbacks-action-buttons">
                        {(user?.role === 'admin' || user?.role === 'manager' || feedback.order_id?.acc_id?._id === user?._id) && (
                          <button
                            onClick={() => handleEditFeedback(feedback)}
                            className="feedbacks-edit-button"
                            aria-label={`Edit feedback ${feedback._id}`}
                          >
                            Edit
                          </button>
                        )}
                        {(user?.role === 'admin' || user?.role === 'manager' || feedback.order_id?.acc_id?._id === user?._id) && (
                          <button
                            onClick={() => deleteFeedback(feedback._id)}
                            className="feedbacks-delete-button"
                            aria-label={`Delete feedback ${feedback._id}`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Feedbacks;