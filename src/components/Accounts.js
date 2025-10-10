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
  const [filteredAccounts, setFilteredAccounts] = useState([]);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone: '',
    address: '',
    gender: '',
    dob: '',
    role: 'user',
    acc_status: 'active',
  });
  const [filters, setFilters] = useState({
    searchQuery: '',
    roleFilter: '',
    statusFilter: '',
    hasImage: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(20);
  const navigate = useNavigate();

  const roleOptions = ['user', 'admin', 'manager'];
  const statusOptions = ['active', 'suspended'];

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
      const fetchedAccounts = user.role === 'admin' ? (Array.isArray(response) ? response : []) : [response];
      setAccounts(fetchedAccounts);
    } catch (err) {
      setError(err.message || 'Failed to load accounts');
      console.error('Fetch accounts error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Apply filters
  const applyFilters = useCallback((accountsList, filterSettings) => {
    return accountsList.filter(account => {
      // Search query filter
      if (filterSettings.searchQuery) {
        const query = filterSettings.searchQuery.toLowerCase();
        const username = account.username?.toLowerCase() || '';
        const name = account.name?.toLowerCase() || '';
        const email = account.email?.toLowerCase() || '';
        const phone = account.phone?.toLowerCase() || '';
        const accountId = account._id?.toLowerCase() || '';
        
        if (!username.includes(query) && 
            !name.includes(query) && 
            !email.includes(query) && 
            !phone.includes(query) && 
            !accountId.includes(query)) {
          return false;
        }
      }

      // Role filter
      if (filterSettings.roleFilter && account.role !== filterSettings.roleFilter) {
        return false;
      }

      // Status filter
      if (filterSettings.statusFilter && account.acc_status !== filterSettings.statusFilter) {
        return false;
      }

      // Has custom image filter
      const defaultImage = 'http://localhost:4000/default-pfp.jpg';
      if (filterSettings.hasImage === 'true' && (account.image === defaultImage || !account.image)) {
        return false;
      }
      if (filterSettings.hasImage === 'false' && account.image !== defaultImage) {
        return false;
      }

      return true;
    });
  }, []);

  // Update filtered accounts when accounts or filters change
  useEffect(() => {
    setFilteredAccounts(applyFilters(accounts, filters));
    setCurrentPage(1); // Reset to first page when filters change
  }, [accounts, filters, applyFilters]);

  // Update account
  const updateAccount = useCallback(async (accountId) => {
    if (!accountId) return;
    
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      const updateData = {
        name: editFormData.name,
        phone: editFormData.phone,
        address: editFormData.address,
        gender: editFormData.gender,
        dob: editFormData.dob,
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
      setShowEditModal(false);
      setEditFormData({
        name: '',
        phone: '',
        address: '',
        gender: '',
        dob: '',
        role: 'user',
        acc_status: 'active',
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update account' });
      console.error('Update account error:', err);
    }
  }, [editFormData, user]);

  // Disable account (set acc_status = 'inactive')
  const disableAccount = useCallback(async (accountId) => {
    if (!window.confirm('Are you sure you want to disable this account? The account will be inactive but not deleted.')) return;

    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/accounts/disable/${accountId}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(prev => prev.map(account => 
        account._id === accountId 
          ? { ...account, acc_status: 'inactive' }
          : account
      ));
      setToast({ type: 'success', message: 'Account disabled successfully' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to disable account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to disable account' });
      console.error('Disable account error:', err);
    }
  }, []);

  // Soft delete account (set is_deleted = true and acc_status = 'deleted')
  const softDeleteAccount = useCallback(async (accountId) => {
    if (!window.confirm('Are you sure you want to delete this account? This will permanently mark the account as deleted.')) return;

    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/accounts/soft/${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(prev => prev.map(account => 
        account._id === accountId 
          ? { ...account, is_deleted: true, acc_status: 'deleted' }
          : account
      ));
      setToast({ type: 'success', message: 'Account deleted successfully' });
      if (editingAccountId === accountId) setEditingAccountId(null);
      if (accountId === user._id) {
        localStorage.removeItem('token');
        navigate('/login', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete account');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete account' });
      console.error('Soft delete account error:', err);
    }
  }, [editingAccountId, user, navigate]);

  // Hard delete account
  const hardDeleteAccount = useCallback(async (accountId) => {
    if (!window.confirm('Are you sure you want to permanently delete this account? This action cannot be undone.')) return;

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
      name: account.name || '',
      phone: account.phone || '',
      address: account.address || '',
      gender: account.gender || '',
      dob: account.dob || '',
      role: account.role || 'user',
      acc_status: account.acc_status || 'active',
    });
    setShowEditModal(true);
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingAccountId(null);
    setShowEditModal(false);
    setEditFormData({
      name: '',
      phone: '',
      address: '',
      gender: '',
      dob: '',
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

  // Handle filter change
  const handleFilterChange = (e) => {
    const { id, value } = e.target;
    setFilters(prev => ({ ...prev, [id]: value }));
  };

  // Clear filters
  const handleClearFilters = () => {
    setFilters({
      searchQuery: '',
      roleFilter: '',
      statusFilter: '',
      hasImage: ''
    });
  };

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredAccounts.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentAccounts = filteredAccounts.slice(startIndex, endIndex);

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

      {/* Header */}
      <div className="accounts-header">
        <h1 className="accounts-title">Account Management</h1>
        <div className="accounts-header-actions">
          <button
            className="accounts-filter-toggle"
            onClick={() => setShowFilters(prev => !prev)}
            aria-label={showFilters ? "Hide filters" : "Show filters"}
            aria-expanded={showFilters}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="accounts-filters">
          <h2 className="accounts-filter-title">Filters</h2>
          <div className="accounts-filters-grid">
            <div className="accounts-filter-group">
              <label htmlFor="searchQuery" className="accounts-filter-label">Search</label>
              <input
                id="searchQuery"
                type="text"
                value={filters.searchQuery}
                onChange={handleFilterChange}
                className="accounts-filter-input"
                placeholder="Search by username, name, email, phone..."
                aria-label="Search accounts"
              />
            </div>
            <div className="accounts-filter-group">
              <label htmlFor="roleFilter" className="accounts-filter-label">Role</label>
              <select
                id="roleFilter"
                value={filters.roleFilter}
                onChange={handleFilterChange}
                className="accounts-filter-select"
                aria-label="Filter by role"
              >
                <option value="">All Roles</option>
                {roleOptions.map(role => (
                  <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="accounts-filter-group">
              <label htmlFor="statusFilter" className="accounts-filter-label">Status</label>
              <select
                id="statusFilter"
                value={filters.statusFilter}
                onChange={handleFilterChange}
                className="accounts-filter-select"
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="accounts-filter-group">
              <label htmlFor="hasImage" className="accounts-filter-label">Has Custom Image</label>
              <select
                id="hasImage"
                value={filters.hasImage}
                onChange={handleFilterChange}
                className="accounts-filter-select"
                aria-label="Filter by custom image"
              >
                <option value="">All</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
          <div className="accounts-filter-actions">
            <button
              onClick={handleClearFilters}
              className="accounts-clear-filters"
              aria-label="Clear all filters"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

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
      {!loading && filteredAccounts.length === 0 && !error ? (
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
                <th>Phone</th>
                <th>Address</th>
                <th>Gender</th>
                <th>Date of Birth</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentAccounts.map((account, index) => (
                <tr key={account._id} className={`accounts-table-row ${account.is_deleted ? 'deleted-account' : ''}`}>
                  <td data-label="#">{startIndex + index + 1}</td>
                  <td data-label="Username">
                    {account.is_deleted ? '[DELETED]' : (account.username || 'N/A')}
                  </td>
                  <td data-label="Name">
                    {account.is_deleted ? '[DELETED]' : (account.name || 'N/A')}
                  </td>
                  <td data-label="Email">
                    {account.is_deleted ? '[DELETED]' : (account.email || 'N/A')}
                  </td>
                  <td data-label="Phone">
                    {account.is_deleted ? '[DELETED]' : (account.phone || 'N/A')}
                  </td>
                  <td data-label="Address">
                    {account.is_deleted ? '[DELETED]' : (account.address || 'N/A')}
                  </td>
                  <td data-label="Gender">
                    {account.is_deleted ? '[DELETED]' : (account.gender || 'N/A')}
                  </td>
                  <td data-label="Date of Birth">
                    {account.is_deleted ? '[DELETED]' : (account.dob ? new Date(account.dob).toLocaleDateString() : 'N/A')}
                  </td>
                  <td data-label="Role">
                    {editingAccountId === account._id && user.role === 'admin' && !account.is_deleted ? (
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
                      <span className={`role-badge ${account.role || 'user'}`}>
                        {account.role || 'N/A'}
                      </span>
                    )}
                  </td>
                  <td data-label="Status">
                    {editingAccountId === account._id && user.role === 'admin' && !account.is_deleted ? (
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
                      <span className={`status-badge ${account.is_deleted ? 'deleted' : (account.acc_status || 'active')}`}>
                        {account.is_deleted ? 'DELETED' : (account.acc_status || 'N/A')}
                      </span>
                    )}
                  </td>
                  <td data-label="Created">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </td>
                  <td data-label="Action">
                    {account.is_deleted ? (
                      <span className="no-actions">No actions available</span>
                    ) : (
                      editingAccountId === account._id ? (
                        <div className="accounts-action-buttons">
                          <button
                            onClick={() => handleUpdateSubmit(account._id)}
                            className="accounts-update-button"
                            aria-label={`Update account ${account._id}`}
                          >
                            Update
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="accounts-cancel-button"
                            aria-label={`Cancel editing account ${account._id}`}
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
                              Edit
                            </button>
                          )}
                          {user.role === 'admin' && account.acc_status === 'active' && (
                            <button
                              onClick={() => disableAccount(account._id)}
                              className="accounts-disable-button"
                              aria-label={`Disable account ${account._id}`}
                            >
                              Disable
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

      {/* Pagination */}
      {filteredAccounts.length > 0 && (
        <div className="accounts-pagination">
          <div className="accounts-pagination-info">
            Showing {startIndex + 1} to {Math.min(endIndex, filteredAccounts.length)} of {filteredAccounts.length} accounts
          </div>
          <div className="accounts-pagination-controls">
            <button
              className="accounts-pagination-button"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              Previous
            </button>
            <div className="accounts-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`accounts-pagination-page ${currentPage === page ? 'active' : ''}`}
                  onClick={() => handlePageChange(page)}
                  aria-label={`Page ${page}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              className="accounts-pagination-button"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="edit-modal-overlay" onClick={handleCancelEdit}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-modal-header">
              <h2>Edit Staff Information</h2>
              <button className="edit-modal-close" onClick={handleCancelEdit}>×</button>
            </div>
            <div className="edit-modal-body">
              <div className="edit-form-grid">
                <div className="edit-form-group">
                  <label htmlFor="edit-name">Name</label>
                  <input
                    id="edit-name"
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => handleEditFieldChange(e, 'name')}
                    className="edit-form-input"
                  />
                </div>
                <div className="edit-form-group">
                  <label htmlFor="edit-phone">Phone</label>
                  <input
                    id="edit-phone"
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => handleEditFieldChange(e, 'phone')}
                    className="edit-form-input"
                  />
                </div>
                <div className="edit-form-group">
                  <label htmlFor="edit-address">Address</label>
                  <input
                    id="edit-address"
                    type="text"
                    value={editFormData.address}
                    onChange={(e) => handleEditFieldChange(e, 'address')}
                    className="edit-form-input"
                  />
                </div>
                <div className="edit-form-group">
                  <label htmlFor="edit-gender">Gender</label>
                  <select
                    id="edit-gender"
                    value={editFormData.gender}
                    onChange={(e) => handleEditFieldChange(e, 'gender')}
                    className="edit-form-select"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="edit-form-group">
                  <label htmlFor="edit-dob">Date of Birth</label>
                  <input
                    id="edit-dob"
                    type="date"
                    value={editFormData.dob}
                    onChange={(e) => handleEditFieldChange(e, 'dob')}
                    className="edit-form-input"
                  />
                </div>
                {user.role === 'admin' && (
                  <>
                    <div className="edit-form-group">
                      <label htmlFor="edit-role">Role</label>
                      <select
                        id="edit-role"
                        value={editFormData.role}
                        onChange={(e) => handleEditFieldChange(e, 'role')}
                        className="edit-form-select"
                      >
                        <option value="user">User</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="edit-form-group">
                      <label htmlFor="edit-status">Status</label>
                      <select
                        id="edit-status"
                        value={editFormData.acc_status}
                        onChange={(e) => handleEditFieldChange(e, 'acc_status')}
                        className="edit-form-select"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="edit-modal-footer">
              <button className="edit-modal-cancel" onClick={handleCancelEdit}>
                Cancel
              </button>
              <button 
                className="edit-modal-save" 
                onClick={() => handleUpdateSubmit(editingAccountId)}
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;