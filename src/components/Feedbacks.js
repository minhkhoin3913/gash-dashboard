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
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [orders, setOrders] = useState([]);
  const [variants, setVariants] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(20);
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
      // Sort feedbacks by order date descending (latest first)
      let sortedFeedbacks = Array.isArray(response) ? response.filter(detail => detail.feedback_details) : [];
      sortedFeedbacks.sort((a, b) => {
        const dateA = a.order_id?.orderDate ? new Date(a.order_id.orderDate) : new Date(0);
        const dateB = b.order_id?.orderDate ? new Date(b.order_id.orderDate) : new Date(0);
        return dateB - dateA;
      });
      setFeedbacks(sortedFeedbacks);
      console.log('Fetched feedbacks:', sortedFeedbacks); // <-- Add this line
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

  // Soft delete / undelete toggle
  const toggleDeleteFeedback = useCallback(async (feedback, nextDeletedState) => {
    if (nextDeletedState) {
      if (!window.confirm('Are you sure you want to soft-delete this feedback?')) return;
    }

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.put(`/order-details/${feedback._id}`, { is_deleted: nextDeletedState }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const updated = response.data.orderDetail || { ...feedback, is_deleted: nextDeletedState };
      setFeedbacks(prev => prev.map(f => f._id === feedback._id ? { ...f, ...updated } : f));
      setToast({ type: 'success', message: nextDeletedState ? 'Feedback marked as deleted' : 'Feedback restored' });
      if (editingFeedbackId === feedback._id) setEditingFeedbackId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update deletion state');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update deletion state' });
      console.error('Toggle delete feedback error:', err);
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

  // Pagination calculations
  const totalPages = Math.ceil(feedbacks.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentFeedbacks = feedbacks.slice(startIndex, endIndex);

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

  // Toggle filter visibility
  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useCallback(() => {
    return searchParams.startDate || searchParams.endDate || searchParams.productId || searchParams.username;
  }, [searchParams]);

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

      <div className="feedbacks-header">
      <h1 className="feedbacks-title">Feedback Management</h1>
        <div className="feedbacks-header-actions">
          <button
            className="feedbacks-filter-toggle"
            onClick={toggleFilters}
            aria-label="Toggle filters"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="feedbacks-filters">
          <h2 className="feedbacks-search-title">Search Feedback</h2>
          <div className="feedbacks-filters-grid">
            <div className="feedbacks-search-section">
              <div className="feedbacks-filter-group">
                <label htmlFor="search-start-date" className="feedbacks-filter-label">Start Date</label>
          <input
            id="search-start-date"
            type="date"
            value={searchParams.startDate}
                  onChange={(e) => { handleFieldChange(e, 'search', 'startDate'); fetchFeedbacks(); }}
                  className="feedbacks-filter-input"
            aria-label="Start Date"
          />
        </div>
              <div className="feedbacks-filter-group">
                <label htmlFor="search-end-date" className="feedbacks-filter-label">End Date</label>
          <input
            id="search-end-date"
            type="date"
            value={searchParams.endDate}
                  onChange={(e) => { handleFieldChange(e, 'search', 'endDate'); fetchFeedbacks(); }}
                  className="feedbacks-filter-input"
            aria-label="End Date"
          />
        </div>
            </div>
            <div className="feedbacks-filter-options">
              <div className="feedbacks-filter-group">
                <label htmlFor="search-product-id" className="feedbacks-filter-label">Product</label>
          <select
            id="search-product-id"
            value={searchParams.productId}
                  onChange={(e) => { handleFieldChange(e, 'search', 'productId'); fetchFeedbacks(); }}
                  className="feedbacks-filter-select"
            aria-label="Select Product"
          >
                  <option value="">All Products</option>
            {products.map(product => (
              <option key={product._id} value={product._id}>
                {product.pro_name || 'N/A'}
              </option>
            ))}
          </select>
        </div>
              <div className="feedbacks-filter-group">
                <label htmlFor="search-username" className="feedbacks-filter-label">Username</label>
          <select
            id="search-username"
            value={searchParams.username}
                  onChange={(e) => { handleFieldChange(e, 'search', 'username'); fetchFeedbacks(); }}
                  className="feedbacks-filter-select"
            aria-label="Select User"
          >
                  <option value="">All Users</option>
            {users.map(user => (
              <option key={user._id} value={user.username}>
                {user.username}
              </option>
            ))}
          </select>
        </div>
      </div>
          </div>
          <div className="feedbacks-filter-actions">
            <button
              onClick={clearSearch}
              className="feedbacks-cancel-button"
              aria-label="Clear search"
              disabled={loading || !hasActiveFilters()}
            >
              Clear
            </button>
            <div className="feedbacks-filter-summary">
              Showing {startIndex + 1} to {Math.min(endIndex, feedbacks.length)} of {feedbacks.length} feedbacks
            </div>
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
                <th>Order Feedback</th>
                <th>Product Feedback</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentFeedbacks.map((feedback, index) => (
                <tr key={feedback._id} className="feedbacks-table-row">
                  <td>{startIndex + index + 1}</td>
                  <td>{feedback.order_id?.orderDate ? new Date(feedback.order_id.orderDate).toLocaleDateString() : 'N/A'}</td>
                  <td>{feedback.order_id?.acc_id?.username || 'N/A'}</td>
                  <td>
                    {feedback.variant_id?.pro_id?.pro_name || 'N/A'} - 
                    {feedback.variant_id?.color_id?.color_name || 'N/A'} - 
                    {feedback.variant_id?.size_id?.size_name || 'N/A'}
                  </td>
                  <td>
                    {feedback.is_deleted ? 'Deleted' : (feedback.order_id?.feedback_order || 'None')}
                  </td>
                  <td>
                    {feedback.is_deleted ? 'Deleted' : feedback.feedback_details}
                  </td>
                  <td>
                      <div className="feedbacks-action-buttons">
                        {(user?.role === 'admin' || user?.role === 'manager' || feedback.order_id?.acc_id?._id === user?._id) && (
                          <button
                            onClick={() => toggleDeleteFeedback(feedback, !feedback.is_deleted)}
                            className="feedbacks-delete-button"
                            aria-label={`${feedback.is_deleted ? 'Undelete' : 'Delete'} feedback ${feedback._id}`}
                          >
                            {feedback.is_deleted ? 'Undelete' : 'Delete'}
                          </button>
                        )}
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {/*  */}
      {feedbacks.length > 0 && (
        <div className="feedbacks-pagination">
          <div className="feedbacks-pagination-info">
            Showing {startIndex + 1} to {Math.min(endIndex, feedbacks.length)} of {feedbacks.length} feedbacks
          </div>
          <div className="feedbacks-pagination-controls">
            <button
              className="feedbacks-pagination-button"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              Previous
            </button>
            <div className="feedbacks-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`feedbacks-pagination-page ${currentPage === page ? 'active' : ''}`}
                  onClick={() => handlePageChange(page)}
                  aria-label={`Page ${page}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              className="feedbacks-pagination-button"
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

export default Feedbacks;