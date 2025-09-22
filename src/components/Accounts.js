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
    role: 'user',
    acc_status: 'active',
  });
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

  // Update account
  const updateAccount = useCallback(async (accountId) => {
    if (!accountId) return;
    
    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      const updateData = {
        role: user.role === 'admin' ? editFormData.role : undefined,
        acc_status: user.role === 'admin' ? editFormData.acc_status : undefined,
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
        role: 'user',
        acc_status: 'active',
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update account' });
      console.error('Update account error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData, user]);

  // Soft delete account
  const softDeleteAccount = useCallback(async (accountId) => {
    if (!window.confirm('Are you sure you want to soft delete this account? This will mark all fields as deleted.')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/accounts/soft/${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(prev => prev.filter(account => account._id !== accountId));
      setToast({ type: 'success', message: 'Account soft deleted successfully' });
      if (editingAccountId === accountId) setEditingAccountId(null);
      if (accountId === user._id) {
        localStorage.removeItem('token');
        navigate('/login', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to soft delete account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to soft delete account' });
      console.error('Soft delete account error:', err);
    } finally {
      setLoading(false);
    }
  }, [editingAccountId, user, navigate]);

  // Hard delete account
  const hardDeleteAccount = useCallback(async (accountId) => {
    if (!window.confirm('Are you sure you want to permanently delete this account? This action cannot be undone.')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/accounts/${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(prev => prev.filter(account => account._id !== accountId));
      setToast({ type: 'success', message: 'Account permanently deleted successfully' });
      if (editingAccountId === accountId) setEditingAccountId(null);
      if (accountId === user._id) {
        localStorage.removeItem('token');
        navigate('/login', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete account' });
      console.error('Hard delete account error:', err);
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
      role: account.role || 'user',
      acc_status: account.acc_status || 'active',
    });
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingAccountId(null);
    setEditFormData({
      role: 'user',
      acc_status: 'active',
    });
  }, []);

  // Handle field change for edit form
  const handleEditFieldChange = useCallback((e, field) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Submit updated fields
  const handleUpdateSubmit = useCallback((accountId) => {
    updateAccount(accountId);
  }, [updateAccount]);

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
        <div className={`accounts-toast ${toast.type === 'success' ? 'accounts-toast-success' : 'accounts-toast-error'}`}
          role="alert"
          aria-live="assertive">
          {toast.message}
        </div>
      )}

      <h1 className="accounts-title">Account Management</h1>

      {/* Error Display */}
      {error && (
        <div className="accounts-error" role="alert" aria-live="assertive">
          <span className="accounts-error-icon">⚠</span>
          <span>{error}</span>
          <button className="accounts-retry-button" onClick={handleRetry} aria-label="Retry loading accounts">Retry</button>
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
          <button className="accounts-continue-shopping-button" onClick={() => navigate('/')} aria-label="Continue shopping">Continue Shopping</button>
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
              </tr>
            </thead>
            <tbody>
              {accounts.map((account, index) => (
                <tr key={account._id} className="accounts-table-row">
                  <td>{index + 1}</td>
                  <td>{account.username || 'N/A'}</td>
                  <td>{account.name || 'N/A'}</td>
                  <td>{account.email || 'N/A'}</td>
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
                    {/* Hide Update and Delete buttons if is_deleted is true */}
                    {account.is_deleted ? null : (
                      editingAccountId === account._id ? (
                        <div className="accounts-action-buttons">
                          <button
                            onClick={() => handleUpdateSubmit(account._id)}
                            className="accounts-update-button"
                            aria-label={`Update account ${account._id}`}
                            disabled={loading}
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
                              onClick={() => softDeleteAccount(account._id)}
                              className="accounts-delete-button"
                              aria-label={`Delete account ${account._id}`}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )
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