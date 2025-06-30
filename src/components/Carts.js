import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Carts.css';
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
                    status === 404 ? 'Cart item not found' :
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

const Carts = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [carts, setCarts] = useState([]);
  const [editingCartId, setEditingCartId] = useState(null);
  const [editFormData, setEditFormData] = useState({ pro_quantity: '', pro_price: '' });
  const [newCartForm, setNewCartForm] = useState({ acc_id: '', variant_id: '', pro_quantity: '', pro_price: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [variants, setVariants] = useState([]);
  const navigate = useNavigate();

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch carts
  const fetchCarts = useCallback(async () => {
    if (!user?._id) {
      setError('User not authenticated');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry('/carts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCarts(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load cart items');
      console.error('Fetch carts error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch accounts (for admins/managers)
  const fetchAccounts = useCallback(async () => {
    if (!user?._id || (user.role !== 'admin' && user.role !== 'manager')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch accounts error:', err);
    }
  }, [user]);

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

  // Create cart item
  const createCart = useCallback(async () => {
    setLoading(true);
    setError('');
    setToast(null);

    const { acc_id, variant_id, pro_quantity, pro_price } = newCartForm;
    if (!acc_id || !variant_id || !pro_quantity || !pro_price) {
      setError('All fields are required');
      setLoading(false);
      return;
    }
    if (pro_quantity < 1) {
      setError('Quantity must be at least 1');
      setLoading(false);
      return;
    }
    if (pro_price < 0) {
      setError('Price cannot be negative');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.post('/carts', newCartForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCarts(prev => [...prev, response.data.cartItem]);
      setToast({ type: 'success', message: 'Cart item created successfully' });
      setNewCartForm({ acc_id: '', variant_id: '', pro_quantity: '', pro_price: '' });
      setShowAddForm(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create cart item');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to create cart item' });
      console.error('Create cart error:', err);
    } finally {
      setLoading(false);
    }
  }, [newCartForm]);

  // Update cart item
  const updateCart = useCallback(async (cartId) => {
    setLoading(true);
    setError('');
    setToast(null);

    const { pro_quantity, pro_price } = editFormData;
    if (!pro_quantity || !pro_price) {
      setError('Quantity and price are required');
      setLoading(false);
      return;
    }
    if (pro_quantity < 1) {
      setError('Quantity must be at least 1');
      setLoading(false);
      return;
    }
    if (pro_price < 0) {
      setError('Price cannot be negative');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.put(`/carts/${cartId}`, editFormData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCarts(prev =>
        prev.map(cart =>
          cart._id === cartId ? response.data.cartItem : cart
        )
      );
      setToast({ type: 'success', message: 'Cart item updated successfully' });
      setEditingCartId(null);
      setEditFormData({ pro_quantity: '', pro_price: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update cart item');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update cart item' });
      console.error('Update cart error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData]);

  // Delete cart item
  const deleteCart = useCallback(async (cartId) => {
    if (!window.confirm('Are you sure you want to delete this cart item?')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/carts/${cartId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCarts(prev => prev.filter(cart => cart._id !== cartId));
      setToast({ type: 'success', message: 'Cart item deleted successfully' });
      if (editingCartId === cartId) setEditingCartId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete cart item');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete cart item' });
      console.error('Delete cart error:', err);
    } finally {
      setLoading(false);
    }
  }, [editingCartId]);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem('token')) {
      navigate('/login', { replace: true });
    } else if (user) {
      fetchCarts();
      fetchAccounts();
      fetchVariants();
    }
  }, [user, isAuthLoading, navigate, fetchCarts, fetchAccounts, fetchVariants]);

  // Start editing cart
  const handleEditCart = useCallback((cart) => {
    setEditingCartId(cart._id);
    setEditFormData({ pro_quantity: cart.pro_quantity, pro_price: cart.pro_price });
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingCartId(null);
    setEditFormData({ pro_quantity: '', pro_price: '' });
  }, []);

  // Handle field change
  const handleFieldChange = useCallback((e, formType, field) => {
    const value = e.target.value;
    if (formType === 'edit') {
      setEditFormData(prev => ({ ...prev, [field]: value }));
    } else {
      setNewCartForm(prev => ({ ...prev, [field]: value }));
    }
  }, []);

  // Submit handlers
  const handleUpdateSubmit = useCallback((cartId) => {
    updateCart(cartId);
  }, [updateCart]);

  const handleCreateSubmit = useCallback(() => {
    createCart();
  }, [createCart]);

  // Toggle add form
  const toggleAddForm = useCallback(() => {
    setShowAddForm(prev => !prev);
    setNewCartForm({ acc_id: '', variant_id: '', pro_quantity: '', pro_price: '' });
    setError('');
  }, []);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchCarts();
  }, [fetchCarts]);

  // Loading state during auth verification
  if (isAuthLoading) {
    return (
      <div className="carts-container">
        <div className="carts-loading" role="status" aria-live="polite">
          <div className="carts-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="carts-container">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`carts-toast ${toast.type === 'success' ? 'carts-toast-success' : 'carts-toast-error'}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <h1 className="carts-title">Cart Management</h1>

      {/* Add Cart Item Button (Admin/Manager) */}
      {(user?.role === 'admin' || user?.role === 'manager') && (
        <div className="carts-add-button-container">
          <button
            onClick={toggleAddForm}
            className="carts-add-button"
            aria-label={showAddForm ? 'Cancel adding cart item' : 'Add new cart item'}
          >
            {showAddForm ? 'Cancel' : 'Add Cart Item'}
          </button>
        </div>
      )}

      {/* Add Cart Item Form (Admin/Manager only) */}
      {(user?.role === 'admin' || user?.role === 'manager') && showAddForm && (
        <div className="carts-add-form">
          <h2 className="carts-form-title">Add New Cart Item</h2>
          <div className="carts-form-group">
            <label htmlFor="new-acc-id">Account</label>
            <select
              id="new-acc-id"
              value={newCartForm.acc_id}
              onChange={(e) => handleFieldChange(e, 'new', 'acc_id')}
              className="carts-form-select"
              aria-label="Select account"
              required
            >
              <option value="">Select Account</option>
              {accounts.map(account => (
                <option key={account._id} value={account._id}>{account.username}</option>
              ))}
            </select>
          </div>
          <div className="carts-form-group">
            <label htmlFor="new-variant-id">Product Variant</label>
            <select
              id="new-variant-id"
              value={newCartForm.variant_id}
              onChange={(e) => handleFieldChange(e, 'new', 'variant_id')}
              className="carts-form-select"
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
          <div className="carts-form-group">
            <label htmlFor="new-quantity">Quantity</label>
            <input
              id="new-quantity"
              type="number"
              min="1"
              value={newCartForm.pro_quantity}
              onChange={(e) => handleFieldChange(e, 'new', 'pro_quantity')}
              className="carts-form-input"
              aria-label="Quantity"
              required
            />
          </div>
          <div className="carts-form-group">
            <label htmlFor="new-price">Price</label>
            <input
              id="new-price"
              type="number"
              min="0"
              step="0.01"
              value={newCartForm.pro_price}
              onChange={(e) => handleFieldChange(e, 'new', 'pro_price')}
              className="carts-form-input"
              aria-label="Price"
              required
            />
          </div>
          <div className="carts-form-actions">
            <button
              onClick={handleCreateSubmit}
              className="carts-create-button"
              aria-label="Create cart item"
              disabled={loading}
            >
              Create
            </button>
            <button
              onClick={toggleAddForm}
              className="carts-cancel-button"
              aria-label="Cancel creating cart item"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="carts-error" role="alert" aria-live="assertive">
          <span className="carts-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="carts-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading cart items"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="carts-loading" role="status" aria-live="polite">
          <div className="carts-progress-bar"></div>
          <p>Loading cart items...</p>
        </div>
      )}

      {/* Carts Table */}
      {!loading && carts.length === 0 && !error ? (
        <div className="carts-empty" role="status">
          <p>No cart items found.</p>
          <button 
            className="carts-continue-shopping-button"
            onClick={() => navigate('/')}
            aria-label="Continue shopping"
          >
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="carts-table-container">
          <table className="carts-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Account</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {carts.map((cart, index) => (
                <tr key={cart._id} className="carts-table-row">
                  <td>{index + 1}</td>
                  <td>{cart.acc_id?.username || 'N/A'}</td>
                  <td>
                    <div className="carts-product-info">
                      {cart.variant_id?.image_id?.imageURL && (
                        <img
                          src={cart.variant_id.image_id.imageURL}
                          alt={cart.variant_id.pro_id?.pro_name || 'Product'}
                          className="carts-image"
                        />
                      )}
                      <span>
                        {cart.variant_id?.pro_id?.pro_name || 'N/A'} - 
                        {cart.variant_id?.color_id?.color_name || 'N/A'} - 
                        {cart.variant_id?.size_id?.size_name || 'N/A'}
                      </span>
                    </div>
                  </td>
                  <td>
                    {editingCartId === cart._id ? (
                      <input
                        type="number"
                        min="1"
                        value={editFormData.pro_quantity}
                        onChange={(e) => handleFieldChange(e, 'edit', 'pro_quantity')}
                        className="carts-form-input"
                        aria-label="Quantity"
                        required
                      />
                    ) : (
                      cart.pro_quantity
                    )}
                  </td>
                  <td>
                    {editingCartId === cart._id ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editFormData.pro_price}
                        onChange={(e) => handleFieldChange(e, 'edit', 'pro_price')}
                        className="carts-form-input"
                        aria-label="Price"
                        required
                      />
                    ) : (
                      `$${cart.pro_price.toFixed(2)}`
                    )}
                  </td>
                  <td>${cart.Total_price.toFixed(2)}</td>
                  <td>
                    {editingCartId === cart._id ? (
                      <div className="carts-action-buttons">
                        <button
                          onClick={() => handleUpdateSubmit(cart._id)}
                          className="carts-update-button"
                          aria-label={`Update cart item ${cart._id}`}
                          disabled={loading || !editFormData.pro_quantity || !editFormData.pro_price}
                        >
                          Update
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="carts-cancel-button"
                          aria-label={`Cancel editing cart item ${cart._id}`}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="carts-action-buttons">
                        {(user?.role === 'admin' || user?.role === 'manager' || cart.acc_id?._id === user?._id) && (
                          <button
                            onClick={() => handleEditCart(cart)}
                            className="carts-edit-button"
                            aria-label={`Edit cart item ${cart._id}`}
                          >
                            Update
                          </button>
                        )}
                        {(user?.role === 'admin' || user?.role === 'manager' || cart.acc_id?._id === user?._id) && (
                          <button
                            onClick={() => deleteCart(cart._id)}
                            className="carts-delete-button"
                            aria-label={`Delete cart item ${cart._id}`}
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

export default Carts;