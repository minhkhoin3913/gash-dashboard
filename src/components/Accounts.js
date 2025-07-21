import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Accounts.css';
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

const Accounts = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [accounts, setAccounts] = useState([]);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    username: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    image: '',
    role: 'user',
    acc_status: 'active',
    password: '',
  });
  const [includePassword, setIncludePassword] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({
    username: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    image: '',
    role: 'user',
    acc_status: 'active',
    password: '',
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    if (!user?._id) {
      setError('User not authenticated');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');

      const url = user.role === 'admin' ? '/accounts' : `/accounts/${user._id}`;
      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(user.role === 'admin' ? (Array.isArray(response) ? response : []) : [response]);
    } catch (err) {
      setError(err.message || 'Failed to load accounts');
      console.error('Fetch accounts error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create account
  const createAccount = useCallback(async () => {
    setLoading(true);
    setError('');
    setToast(null);

    const { username, name, email, phone, address, password, image, role, acc_status } = newAccountForm;
    if (!username || !name || !email || !phone || !address || !password) {
      setError('All required fields must be filled');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.post('/accounts', {
        username, name, email, phone, address, password,
        image: image || 'http://localhost:4000/default-pfp.jpg',
        role, acc_status,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(prev => [...prev, response.data.account]);
      setToast({ type: 'success', message: 'Account created successfully' });
      setNewAccountForm({
        username: '', name: '', email: '', phone: '', address: '',
        image: '', role: 'user', acc_status: 'active', password: '',
      });
      setShowAddForm(false);
      setIncludePassword(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to create account' });
      console.error('Create account error:', err);
    } finally {
      setLoading(false);
    }
  }, [newAccountForm]);

  // Update account
  const updateAccount = useCallback(async (accountId) => {
    setLoading(true);
    setError('');
    setToast(null);

    const { username, name, email, phone, address, image, role, acc_status, password } = editFormData;
    if (!username || !name || !email || !phone || !address) {
      setError('All required fields must be filled');
      setLoading(false);
      return;
    }
    if (includePassword && !password) {
      setError('Password is required if included');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const updateData = {
        username, name, email, phone, address, image,
        role: user.role === 'admin' ? role : undefined,
        acc_status: user.role === 'admin' ? acc_status : undefined,
        ...(includePassword && { password }),
      };
      const response = await apiClient.put(`/accounts/${accountId}`, updateData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(prev =>
        prev.map(account =>
          account._id === accountId ? response.data.account : account
        )
      );
      setToast({ type: 'success', message: 'Account updated successfully' });
      setEditingAccountId(null);
      setEditFormData({
        username: '', name: '', email: '', phone: '', address: '',
        image: '', role: 'user', acc_status: 'active', password: '',
      });
      setIncludePassword(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update account' });
      console.error('Update account error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData, includePassword, user]);

  // Delete account
  const deleteAccount = useCallback(async (accountId) => {
    if (!window.confirm('Are you sure you want to delete this account?')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/accounts/${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(prev => prev.filter(account => account._id !== accountId));
      setToast({ type: 'success', message: 'Account deleted successfully' });
      if (editingAccountId === accountId) setEditingAccountId(null);
      if (accountId === user._id) {
        localStorage.removeItem('token');
        navigate('/login', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete account' });
      console.error('Delete account error:', err);
    } finally {
      setLoading(false);
    }
  }, [editingAccountId, user, navigate]);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem('token')) {
      navigate('/login', { replace: true });
    } else if (user) {
      fetchAccounts();
    }
  }, [user, isAuthLoading, navigate, fetchAccounts]);

  // Start editing account
  const handleEditAccount = useCallback((account) => {
    setEditingAccountId(account._id);
    setEditFormData({
      username: account.username,
      name: account.name,
      email: account.email,
      phone: account.phone,
      address: account.address,
      image: account.image,
      role: account.role,
      acc_status: account.acc_status,
      password: '',
    });
    setIncludePassword(false);
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingAccountId(null);
    setEditFormData({
      username: '', name: '', email: '', phone: '', address: '',
      image: '', role: 'user', acc_status: 'active', password: '',
    });
    setIncludePassword(false);
  }, []);

  // Handle field change for edit form
  const handleEditFieldChange = useCallback((e, field) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Handle field change for new account form
  const handleNewFieldChange = useCallback((e, field) => {
    setNewAccountForm(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Submit updated fields
  const handleUpdateSubmit = useCallback((accountId) => {
    updateAccount(accountId);
  }, [updateAccount]);

  // Submit new account
  const handleCreateSubmit = useCallback(() => {
    createAccount();
  }, [createAccount]);

  // Toggle add form
  const toggleAddForm = useCallback(() => {
    setShowAddForm(prev => !prev);
    setNewAccountForm({
      username: '', name: '', email: '', phone: '', address: '',
      image: '', role: 'user', acc_status: 'active', password: '',
    });
    setIncludePassword(false);
    setError('');
  }, []);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="accounts-container">
        <div className="accounts-loading" role="status" aria-live="polite">
          <div className="accounts-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="accounts-container">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`accounts-toast ${toast.type === 'success' ? 'accounts-toast-success' : 'accounts-toast-error'}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <h1 className="accounts-title">Account Management</h1>

      {/* Add Account Button (Admin Only) */}
      {user?.role === 'admin' && (
        <div className="accounts-add-button-container">
          <button
            onClick={toggleAddForm}
            className="accounts-add-button"
            aria-label={showAddForm ? 'Cancel adding account' : 'Add new account'}
          >
            {showAddForm ? 'Cancel' : 'Add Account'}
          </button>
        </div>
      )}

      {/* Add Account Form (Admin Only) */}
      {user?.role === 'admin' && showAddForm && (
        <div className="accounts-add-form">
          <h2 className="accounts-form-title">Add New Account</h2>
          <div className="accounts-form-group">
            <label htmlFor="new-username">Username</label>
            <input
              id="new-username"
              type="text"
              value={newAccountForm.username}
              onChange={(e) => handleNewFieldChange(e, 'username')}
              className="accounts-form-input"
              aria-label="Username"
              required
            />
          </div>
          <div className="accounts-form-group">
            <label htmlFor="new-name">Name</label>
            <input
              id="new-name"
              type="text"
              value={newAccountForm.name}
              onChange={(e) => handleNewFieldChange(e, 'name')}
              className="accounts-form-input"
              aria-label="Name"
              required
            />
          </div>
          <div className="accounts-form-group">
            <label htmlFor="new-email">Email</label>
            <input
              id="new-email"
              type="email"
              value={newAccountForm.email}
              onChange={(e) => handleNewFieldChange(e, 'email')}
              className="accounts-form-input"
              aria-label="Email"
              required
            />
          </div>
          <div className="accounts-form-group">
            <label htmlFor="new-phone">Phone</label>
            <input
              id="new-phone"
              type="tel"
              value={newAccountForm.phone}
              onChange={(e) => handleNewFieldChange(e, 'phone')}
              className="accounts-form-input"
              aria-label="Phone"
              required
            />
          </div>
          <div className="accounts-form-group">
            <label htmlFor="new-address">Address</label>
            <input
              id="new-address"
              type="text"
              value={newAccountForm.address}
              onChange={(e) => handleNewFieldChange(e, 'address')}
              className="accounts-form-input"
              aria-label="Address"
              required
            />
          </div>
          <div className="accounts-form-group">
            <label htmlFor="new-password">Password</label>
            <input
              id="new-password"
              type="password"
              value={newAccountForm.password}
              onChange={(e) => handleNewFieldChange(e, 'password')}
              className="accounts-form-input"
              aria-label="Password"
              required
            />
          </div>
          <div className="accounts-form-group">
            <label htmlFor="new-image">Image URL</label>
            <input
              id="new-image"
              type="text"
              value={newAccountForm.image}
              onChange={(e) => handleNewFieldChange(e, 'image')}
              className="accounts-form-input"
              aria-label="Image URL"
            />
          </div>
          <div className="accounts-form-group">
            <label htmlFor="new-role">Role</label>
            <select
              id="new-role"
              value={newAccountForm.role}
              onChange={(e) => handleNewFieldChange(e, 'role')}
              className="accounts-form-select"
              aria-label="Role"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div className="accounts-form-group">
            <label htmlFor="new-acc-status">Status</label>
            <select
              id="new-acc-status"
              value={newAccountForm.acc_status}
              onChange={(e) => handleNewFieldChange(e, 'acc_status')}
              className="accounts-form-select"
              aria-label="Status"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="accounts-form-actions">
            <button
              onClick={handleCreateSubmit}
              className="accounts-create-button"
              aria-label="Create account"
              disabled={loading}
            >
              Create
            </button>
            <button
              onClick={toggleAddForm}
              className="accounts-cancel-button"
              aria-label="Cancel creating account"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="accounts-error" role="alert" aria-live="assertive">
          <span className="accounts-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="accounts-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading accounts"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="accounts-loading" role="status" aria-live="polite">
          <div className="accounts-progress-bar"></div>
          <p>Loading accounts...</p>
        </div>
      )}

      {/* Accounts Table */}
      {!loading && accounts.length === 0 && !error ? (
        <div className="accounts-empty" role="status">
          <p>No accounts found.</p>
          <button 
            className="accounts-continue-shopping-button"
            onClick={() => navigate('/')}
            aria-label="Continue shopping"
          >
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="accounts-table-container">
          <table className="accounts-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Username</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Action</th>
                <th>Image</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account, index) => (
                <tr key={account._id} className="accounts-table-row">
                  <td>{index + 1}</td>
                  <td>
                    {editingAccountId === account._id ? (
                      <input
                        type="text"
                        value={editFormData.username}
                        onChange={(e) => handleEditFieldChange(e, 'username')}
                        className="accounts-form-input"
                        aria-label="Username"
                        required
                      />
                    ) : (
                      account.username || 'N/A'
                    )}
                  </td>
                  <td>
                    {editingAccountId === account._id ? (
                      <input
                        type="text"
                        value={editFormData.name}
                        onChange={(e) => handleEditFieldChange(e, 'name')}
                        className="accounts-form-input"
                        aria-label="Name"
                        required
                      />
                    ) : (
                      account.name || 'N/A'
                    )}
                  </td>
                  <td>
                    {editingAccountId === account._id ? (
                      <input
                        type="email"
                        value={editFormData.email}
                        onChange={(e) => handleEditFieldChange(e, 'email')}
                        className="accounts-form-input"
                        aria-label="Email"
                        required
                      />
                    ) : (
                      account.email || 'N/A'
                    )}
                  </td>
                  <td>
                    {editingAccountId === account._id && user.role === 'admin' ? (
                      <select
                        value={editFormData.role}
                        onChange={(e) => handleEditFieldChange(e, 'role')}
                        className="accounts-field-select"
                        aria-label="Role"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                      </select>
                    ) : (
                      account.role || 'N/A'
                    )}
                  </td>
                  <td>
                    {editingAccountId === account._id && user.role === 'admin' ? (
                      <select
                        value={editFormData.acc_status}
                        onChange={(e) => handleEditFieldChange(e, 'acc_status')}
                        className="accounts-field-select"
                        aria-label="Status"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    ) : (
                      account.acc_status || 'N/A'
                    )}
                  </td>
                  <td>
                    {editingAccountId === account._id ? (
                      <div className="accounts-action-buttons">
                        <button
                          onClick={() => handleUpdateSubmit(account._id)}
                          className="accounts-update-button"
                          aria-label={`Update account ${account._id}`}
                          disabled={loading || !editFormData.username || !editFormData.name || 
                                    !editFormData.email || !editFormData.phone || !editFormData.address ||
                                    (includePassword && !editFormData.password)}
                        >
                          Update
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="accounts-cancel-button"
                          aria-label={`Cancel editing account ${account._id}`}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="accounts-action-buttons">
                        {(user.role === 'admin' || user._id === account._id) && (
                          <button
                            onClick={() => handleEditAccount(account)}
                            className="accounts-edit-button"
                            aria-label={`Edit account ${account._id}`}
                          >
                            Update
                          </button>
                        )}
                        {(user.role === 'admin' || user._id === account._id) && (
                          <button
                            onClick={() => deleteAccount(account._id)}
                            className="accounts-delete-button"
                            aria-label={`Delete account ${account._id}`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {editingAccountId === account._id ? (
                      <div>
                        <input
                          type="text"
                          value={editFormData.image}
                          onChange={(e) => handleEditFieldChange(e, 'image')}
                          className="accounts-form-input"
                          aria-label="Image URL"
                        />
                        <div className="accounts-form-checkbox">
                          <label>
                            <input
                              type="checkbox"
                              checked={includePassword}
                              onChange={() => setIncludePassword(prev => !prev)}
                              aria-label="Include password"
                            />
                            Include Password
                          </label>
                          {includePassword && (
                            <input
                              type="password"
                              value={editFormData.password}
                              onChange={(e) => handleEditFieldChange(e, 'password')}
                              className="accounts-form-input"
                              aria-label="Password"
                            />
                          )}
                        </div>
                      </div>
                    ) : account.image ? (
                      <img
                        src={account.image}
                        alt={account.username}
                        className="accounts-image"
                        onError={(e) => {
                          e.target.src = 'http://localhost:4000/default-pfp.jpg';
                          e.target.alt = 'Image not available';
                        }}
                      />
                    ) : (
                      'N/A'
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

export default Accounts;