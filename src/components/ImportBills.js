import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/ImportBills.css';
import axios from 'axios';

// API client with interceptors
const apiClient = axios.create({
  baseURL: (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/$/, ''),
  timeout: 10000,
});

apiClient.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const message = error.response?.data?.message || 
                    (status === 401 ? 'Unauthorized access - please log in' :
                     status === 404 ? 'Resource not found' :
                     status >= 500 ? 'Server error - please try again later' :
                     'Invalid request - please check your input');
    console.error('API error:', { url: error.config.url, status, message, data: error.response?.data });
    return Promise.reject({ ...error, message, skipRetry: status === 400 });
  }
);

// API functions
const fetchWithRetry = async (url, options = {}, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching ${url}, attempt ${i + 1}`);
      const response = await apiClient.get(url, options);
      return response.data;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
      if (i === retries - 1 || error.skipRetry) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

// Validate date string
const isValidDate = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

const ImportBills = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [bills, setBills] = useState([]);
  const [variants, setVariants] = useState([]);
  const [billDetails, setBillDetails] = useState([]);
  const [selectedBillId, setSelectedBillId] = useState(null);
  const [editingBillId, setEditingBillId] = useState(null);
  const [editingDetailId, setEditingDetailId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newBillForm, setNewBillForm] = useState({
    bill: { create_date: '', total_amount: '', image_bill: '' },
    details: [{ variant_id: '', quantity: '', import_price: '' }],
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchParams, setSearchParams] = useState({
    startDate: '',
    endDate: '',
    minAmount: '',
    maxAmount: '',
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

  // Fetch import bills
  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/imports', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBills(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load import bills');
      console.error('Fetch import bills error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch product variants
  const fetchVariants = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/variants', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVariants(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load variants');
      console.error('Fetch variants error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch bill details for a specific bill
  const fetchBillDetails = useCallback(async (billId) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry(`/imports/details/bill/${billId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBillDetails(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load bill details');
      console.error('Fetch bill details error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search import bills
  const searchBills = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { startDate, endDate, minAmount, maxAmount } = searchParams;

      if (startDate && !isValidDate(startDate)) {
        setError('Invalid start date format');
        setLoading(false);
        return;
      }

      if (endDate && !isValidDate(endDate)) {
        setError('Invalid end date format');
        setLoading(false);
        return;
      }

      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        setError('Start date cannot be after end date');
        setLoading(false);
        return;
      }

      if (minAmount && (isNaN(minAmount) || Number(minAmount) < 0)) {
        setError('Minimum amount must be a non-negative number');
        setLoading(false);
        return;
      }

      if (maxAmount && (isNaN(maxAmount) || Number(maxAmount) < 0)) {
        setError('Maximum amount must be a non-negative number');
        setLoading(false);
        return;
      }

      if (minAmount && maxAmount && Number(minAmount) > Number(maxAmount)) {
        setError('Minimum amount cannot be greater than maximum amount');
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');
      const query = new URLSearchParams();
      if (startDate) query.append('startDate', startDate);
      if (endDate) query.append('endDate', endDate);
      if (minAmount) query.append('minAmount', minAmount);
      if (maxAmount) query.append('maxAmount', maxAmount);

      const url = `/imports/search${query.toString() ? `?${query.toString()}` : ''}`;
      console.log('Sending search request to:', `${apiClient.defaults.baseURL}${url}`);
      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBills(Array.isArray(response) ? response : []);
      if (response.length === 0) {
        setToast({ type: 'info', message: 'No import bills found for the given criteria' });
      }
    } catch (err) {
      setError(err.message || 'Failed to search import bills');
      console.error('Search import bills error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  // Create import bill with details
  const createBillWithDetails = useCallback(async () => {
    setLoading(true);
    setError('');
    setToast(null);

    const { bill, details } = newBillForm;

    // Validate bill data
    if (!bill.create_date || !bill.total_amount) {
      setError('Creation date and total amount are required');
      setLoading(false);
      return;
    }

    if (!isValidDate(bill.create_date)) {
      setError('Invalid creation date format');
      setLoading(false);
      return;
    }

    if (isNaN(bill.total_amount) || Number(bill.total_amount) <= 0) {
      setError('Total amount must be a positive number');
      setLoading(false);
      return;
    }

    // Validate details
    for (let i = 0; i < details.length; i++) {
      const detail = details[i];
      if (!detail.variant_id || !detail.quantity || !detail.import_price) {
        setError(`Detail ${i + 1}: Variant, quantity, and import price are required`);
        setLoading(false);
        return;
      }
      if (isNaN(detail.quantity) || Number(detail.quantity) <= 0) {
        setError(`Detail ${i + 1}: Quantity must be a positive number`);
        setLoading(false);
        return;
      }
      if (isNaN(detail.import_price) || Number(detail.import_price) < 0) {
        setError(`Detail ${i + 1}: Import price must be a non-negative number`);
        setLoading(false);
        return;
      }
    }

    try {
      const token = localStorage.getItem('token');
      // Create bill
      const billResponse = await apiClient.post('/imports', bill, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const newBill = billResponse.data.importBill;

      // Create details
      const detailPromises = details.map(detail =>
        apiClient.post('/imports/details', { ...detail, bill_id: newBill._id }, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      await Promise.all(detailPromises);

      setBills(prev => [...prev, newBill]);
      setToast({ type: 'success', message: 'Import bill and details created successfully' });
      setNewBillForm({
        bill: { create_date: '', total_amount: '', image_bill: '' },
        details: [{ variant_id: '', quantity: '', import_price: '' }],
      });
      setShowAddForm(false);
      setSelectedBillId(newBill._id);
      fetchBillDetails(newBill._id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create import bill and details');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to create import bill and details' });
      console.error('Create import bill and details error:', err);
    } finally {
      setLoading(false);
    }
  }, [newBillForm, fetchBillDetails]);

  // Update import bill
  const updateBill = useCallback(async (id) => {
    setLoading(true);
    setError('');
    setToast(null);

    if (!editFormData.create_date || !editFormData.total_amount) {
      setError('Creation date and total amount are required');
      setLoading(false);
      return;
    }

    if (!isValidDate(editFormData.create_date)) {
      setError('Invalid creation date format');
      setLoading(false);
      return;
    }

    if (isNaN(editFormData.total_amount) || Number(editFormData.total_amount) <= 0) {
      setError('Total amount must be a positive number');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.put(`/imports/${id}`, editFormData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBills(prev => prev.map(item => item._id === id ? response.data.importBill : item));
      setToast({ type: 'success', message: 'Import bill updated successfully' });
      setEditingBillId(null);
      setEditFormData({});
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update import bill');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update import bill' });
      console.error('Update import bill error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData]);

  // Update import bill detail
  const updateDetail = useCallback(async (detailId) => {
    setLoading(true);
    setError('');
    setToast(null);

    if (!editFormData.bill_id || !editFormData.variant_id || !editFormData.quantity || !editFormData.import_price) {
      setError('Bill ID, variant ID, quantity, and import price are required');
      setLoading(false);
      return;
    }

    if (isNaN(editFormData.quantity) || Number(editFormData.quantity) <= 0) {
      setError('Quantity must be a positive number');
      setLoading(false);
      return;
    }

    if (isNaN(editFormData.import_price) || Number(editFormData.import_price) < 0) {
      setError('Import price must be a non-negative number');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.put(`/imports/details/${detailId}`, editFormData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBillDetails(prev => prev.map(detail => 
        detail._id === detailId ? response.data.importBillDetail : detail
      ));
      setToast({ type: 'success', message: 'Import bill detail updated successfully' });
      setEditingDetailId(null);
      setEditFormData({});
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update import bill detail');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update import bill detail' });
      console.error('Update import bill detail error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData]);

  // Delete import bill
  const deleteBill = useCallback(async (id) => {
    if (!window.confirm('Are you sure you want to delete this import bill and all its details?')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/imports/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBills(prev => prev.filter(item => item._id !== id));
      if (selectedBillId === id) {
        setSelectedBillId(null);
        setBillDetails([]);
      }
      setToast({ type: 'success', message: 'Import bill deleted successfully' });
      setEditingBillId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete import bill');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete import bill' });
      console.error('Delete import bill error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedBillId]);

  // Delete import bill detail
  const deleteDetail = useCallback(async (detailId) => {
    if (!window.confirm('Are you sure you want to delete this import bill detail?')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/imports/details/${detailId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBillDetails(prev => prev.filter(detail => detail._id !== detailId));
      setToast({ type: 'success', message: 'Import bill detail deleted successfully' });
      setEditingDetailId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete import bill detail');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete import bill detail' });
      console.error('Delete import bill detail error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem('token')) {
      navigate('/login', { replace: true });
    } else if (user) {
      fetchBills();
      fetchVariants();
    }
  }, [user, isAuthLoading, navigate, fetchBills, fetchVariants]);

  // Fetch bill details when a bill is selected
  useEffect(() => {
    if (selectedBillId) {
      fetchBillDetails(selectedBillId);
    } else {
      setBillDetails([]);
    }
  }, [selectedBillId, fetchBillDetails]);

  // Handle field change for edit form
  const handleEditFieldChange = useCallback((e, field) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Handle field change for new bill form
  const handleNewBillFieldChange = useCallback((e, field) => {
    setNewBillForm(prev => ({
      ...prev,
      bill: { ...prev.bill, [field]: e.target.value },
    }));
  }, []);

  // Handle field change for new detail in form
  const handleNewDetailFieldChange = useCallback((e, index, field) => {
    setNewBillForm(prev => {
      const updatedDetails = [...prev.details];
      updatedDetails[index] = { ...updatedDetails[index], [field]: e.target.value };
      return { ...prev, details: updatedDetails };
    });
  }, []);

  // Add new detail row
  const addDetailRow = useCallback(() => {
    setNewBillForm(prev => ({
      ...prev,
      details: [...prev.details, { variant_id: '', quantity: '', import_price: '' }],
    }));
  }, []);

  // Remove detail row
  const removeDetailRow = useCallback((index) => {
    setNewBillForm(prev => {
      const updatedDetails = prev.details.filter((_, i) => i !== index);
      return { ...prev, details: updatedDetails.length > 0 ? updatedDetails : [{ variant_id: '', quantity: '', import_price: '' }] };
    });
  }, []);

  // Handle search field change
  const handleSearchFieldChange = useCallback((e, field) => {
    setSearchParams(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Handle bill selection for details view
  const handleBillSelect = useCallback((billId) => {
    if (selectedBillId === billId) {
      setSelectedBillId(null);
      setBillDetails([]);
    } else {
      setSelectedBillId(billId);
    }
  }, [selectedBillId]);

  // Submit updated fields
  const handleUpdateSubmit = useCallback((type, id, detailId) => {
    if (type === 'bills') {
      updateBill(id);
    } else {
      updateDetail(detailId);
    }
  }, [updateBill, updateDetail]);

  // Toggle add form
  const toggleAddForm = useCallback(() => {
    setShowAddForm(prev => !prev);
    setNewBillForm({
      bill: { create_date: '', total_amount: '', image_bill: '' },
      details: [{ variant_id: '', quantity: '', import_price: '' }],
    });
    setError('');
  }, []);

  // Clear search parameters and fetch all bills
  const clearSearch = useCallback(() => {
    setSearchParams({ startDate: '', endDate: '', minAmount: '', maxAmount: '' });
    fetchBills();
  }, [fetchBills]);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchBills();
    fetchVariants();
    if (selectedBillId) {
      fetchBillDetails(selectedBillId);
    }
  }, [fetchBills, fetchVariants, fetchBillDetails, selectedBillId]);

  // Get formatted variant description by variant ID
  const getProductNameByVariant = useCallback((variantId) => {
    const variant = variants.find(v => v._id === variantId);
    if (!variant) return 'N/A';
    const productName = variant.pro_id?.pro_name || 'Unknown Product';
    const colorName = variant.color_id?.color_name || 'Unknown Color';
    const sizeName = variant.size_id?.size_name || 'Unknown Size';
    return `${productName} - ${colorName} - ${sizeName}`;
  }, [variants]);

  // Format price
  const formatPrice = useCallback((price) => {
    if (typeof price !== 'number' || isNaN(price)) return 'N/A';
    return `$${price.toFixed(2)}`;
  }, []);

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="imports-container">
        <div className="imports-loading" role="status" aria-live="polite">
          <div className="imports-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="imports-container">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`imports-toast ${toast.type === 'success' ? 'imports-toast-success' : toast.type === 'info' ? 'imports-toast-info' : 'imports-toast-error'}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <h1 className="imports-title">Import Bills</h1>

      {/* Search Form */}
      <div className="imports-search-form">
        <h2 className="imports-form-title">Search Import Bills</h2>
        <div className="imports-form-group">
          <label htmlFor="search-start-date">Start Date</label>
          <input
            id="search-start-date"
            type="date"
            value={searchParams.startDate}
            onChange={(e) => handleSearchFieldChange(e, 'startDate')}
            className="imports-form-input"
            aria-label="Start Date"
          />
        </div>
        <div className="imports-form-group">
          <label htmlFor="search-end-date">End Date</label>
          <input
            id="search-end-date"
            type="date"
            value={searchParams.endDate}
            onChange={(e) => handleSearchFieldChange(e, 'endDate')}
            className="imports-form-input"
            aria-label="End Date"
          />
        </div>
        <div className="imports-form-group">
          <label htmlFor="search-min-amount">Min Amount</label>
          <input
            id="search-min-amount"
            type="number"
            value={searchParams.minAmount}
            onChange={(e) => handleSearchFieldChange(e, 'minAmount')}
            className="imports-form-input"
            aria-label="Minimum Amount"
            min="0"
          />
        </div>
        <div className="imports-form-group">
          <label htmlFor="search-max-amount">Max Amount</label>
          <input
            id="search-max-amount"
            type="number"
            value={searchParams.maxAmount}
            onChange={(e) => handleSearchFieldChange(e, 'maxAmount')}
            className="imports-form-input"
            aria-label="Maximum Amount"
            min="0"
          />
        </div>
        <div className="imports-form-actions">
          <button
            onClick={searchBills}
            className="imports-create-button"
            aria-label="Search bills"
            disabled={loading}
          >
            Search
          </button>
          <button
            onClick={clearSearch}
            className="imports-cancel-button"
            aria-label="Clear search"
            disabled={loading}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="imports-error" role="alert" aria-live="assertive">
          <span className="imports-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="imports-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading import bills"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="imports-loading" role="status" aria-live="polite">
          <div className="imports-progress-bar"></div>
          <p>Loading...</p>
        </div>
      )}

      {/* Bills Section */}
      {!loading && (
        <div className="imports-section">
          <div className="imports-add-button-container">
            <button
              onClick={toggleAddForm}
              className="imports-add-button"
              aria-label={showAddForm ? 'Cancel adding bill' : 'Add new bill'}
            >
              {showAddForm ? 'Cancel' : 'Add Bill'}
            </button>
          </div>

          {showAddForm && (
            <div className="imports-add-form">
              <h2 className="imports-form-title">Add New Import Bill</h2>
              <div className="imports-form-group">
                <label htmlFor="new-bill-create-date">Creation Date</label>
                <input
                  id="new-bill-create-date"
                  type="date"
                  value={newBillForm.bill.create_date}
                  onChange={(e) => handleNewBillFieldChange(e, 'create_date')}
                  className="imports-form-input"
                  aria-label="Creation Date"
                  required
                />
              </div>
              <div className="imports-form-group">
                <label htmlFor="new-bill-total-amount">Total Amount</label>
                <input
                  id="new-bill-total-amount"
                  type="number"
                  value={newBillForm.bill.total_amount}
                  onChange={(e) => handleNewBillFieldChange(e, 'total_amount')}
                  className="imports-form-input"
                  aria-label="Total Amount"
                  min="0"
                  required
                />
              </div>
              <div className="imports-form-group">
                <label htmlFor="new-bill-image-bill">Image Bill URL</label>
                <input
                  id="new-bill-image-bill"
                  type="text"
                  value={newBillForm.bill.image_bill}
                  onChange={(e) => handleNewBillFieldChange(e, 'image_bill')}
                  className="imports-form-input"
                  aria-label="Image Bill URL"
                />
              </div>
              <h3 className="imports-form-title">Bill Details</h3>
              {newBillForm.details.map((detail, index) => (
                <div key={index} className="imports-form-group">
                  <h4>Detail {index + 1}</h4>
                  <div className="imports-form-group">
                    <label htmlFor={`new-detail-variant-id-${index}`}>Variant</label>
                    <select
                      id={`new-detail-variant-id-${index}`}
                      value={detail.variant_id}
                      onChange={(e) => handleNewDetailFieldChange(e, index, 'variant_id')}
                      className="imports-form-select"
                      aria-label={`Variant ${index + 1}`}
                      required
                    >
                      <option value="">Select Variant</option>
                      {variants.map(variant => (
                        <option key={variant._id} value={variant._id}>
                          {getProductNameByVariant(variant._id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="imports-form-group">
                    <label htmlFor={`new-detail-quantity-${index}`}>Quantity</label>
                    <input
                      id={`new-detail-quantity-${index}`}
                      type="number"
                      value={detail.quantity}
                      onChange={(e) => handleNewDetailFieldChange(e, index, 'quantity')}
                      className="imports-form-input"
                      aria-label={`Quantity ${index + 1}`}
                      min="1"
                      required
                    />
                  </div>
                  <div className="imports-form-group">
                    <label htmlFor={`new-detail-import-price-${index}`}>Import Price</label>
                    <input
                      id={`new-detail-import-price-${index}`}
                      type="number"
                      value={detail.import_price}
                      onChange={(e) => handleNewDetailFieldChange(e, index, 'import_price')}
                      className="imports-form-input"
                      aria-label={`Import Price ${index + 1}`}
                      min="0"
                      required
                    />
                  </div>
                  {newBillForm.details.length > 1 && (
                    <button
                      onClick={() => removeDetailRow(index)}
                      className="imports-delete-button"
                      aria-label={`Remove detail ${index + 1}`}
                    >
                      Remove Detail
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addDetailRow}
                className="imports-create-button"
                aria-label="Add another detail"
              >
                Add Another Detail
              </button>
              <div className="imports-form-actions">
                <button
                  onClick={createBillWithDetails}
                  className="imports-create-button"
                  aria-label="Create bill and details"
                  disabled={loading}
                >
                  Create Bill and Details
                </button>
                <button
                  onClick={toggleAddForm}
                  className="imports-cancel-button"
                  aria-label="Cancel creating bill"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {bills.length === 0 && !showAddForm ? (
            <div className="imports-empty" role="status">
              <p>No import bills found.</p>
              <button 
                className="imports-continue-shopping-button"
                onClick={() => navigate('/')}
                aria-label="Continue shopping"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="imports-table-container">
              <table className="imports-table bills">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Creation Date</th>
                    <th>Total Amount</th>
                    <th>Image Bill</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill, index) => (
                    <React.Fragment key={bill._id}>
                      <tr className="imports-table-row">
                        <td>{index + 1}</td>
                        <td>
                          {editingBillId === bill._id ? (
                            <input
                              type="date"
                              value={editFormData.create_date || bill.create_date.split('T')[0]}
                              onChange={(e) => handleEditFieldChange(e, 'create_date')}
                              className="imports-form-input"
                              aria-label="Creation Date"
                              required
                            />
                          ) : (
                            new Date(bill.create_date).toLocaleDateString()
                          )}
                        </td>
                        <td>
                          {editingBillId === bill._id ? (
                            <input
                              type="number"
                              value={editFormData.total_amount || bill.total_amount}
                              onChange={(e) => handleEditFieldChange(e, 'total_amount')}
                              className="imports-form-input"
                              aria-label="Total Amount"
                              min="0"
                              required
                            />
                          ) : (
                            formatPrice(bill.total_amount)
                          )}
                        </td>
                        <td>
                          {editingBillId === bill._id ? (
                            <input
                              type="text"
                              value={editFormData.image_bill || bill.image_bill || ''}
                              onChange={(e) => handleEditFieldChange(e, 'image_bill')}
                              className="imports-form-input"
                              aria-label="Image Bill URL"
                            />
                          ) : bill.image_bill ? (
                            <img
                              src={bill.image_bill}
                              alt={`Invoice for bill ${bill._id}`}
                              className="imports-image"
                              onError={(e) => {
                                e.target.alt = 'Invoice not available';
                                e.target.style.opacity = '0.5';
                              }}
                            />
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td>
                          {editingBillId === bill._id ? (
                            <div className="imports-action-buttons">
                              <button
                                onClick={() => handleUpdateSubmit('bills', bill._id)}
                                className="imports-update-button"
                                aria-label={`Update bill ${bill._id}`}
                                disabled={loading || !editFormData.create_date || !editFormData.total_amount}
                              >
                                Update
                              </button>
                              <button
                                onClick={() => { setEditingBillId(null); setEditFormData({}); }}
                                className="imports-cancel-button"
                                aria-label={`Cancel editing bill ${bill._id}`}
                                disabled={loading}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="imports-action-buttons">
                              <button
                                onClick={() => {
                                  setEditingBillId(bill._id);
                                  setEditFormData({
                                    create_date: bill.create_date.split('T')[0],
                                    total_amount: bill.total_amount,
                                    image_bill: bill.image_bill || ''
                                  });
                                }}
                                className="imports-edit-button"
                                aria-label={`Edit bill ${bill._id}`}
                              >
                                Update
                              </button>
                              <button
                                onClick={() => deleteBill(bill._id)}
                                className="imports-delete-button"
                                aria-label={`Delete bill ${bill._id}`}
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => handleBillSelect(bill._id)}
                                className="imports-create-button"
                                aria-label={selectedBillId === bill._id ? `Hide details for bill ${bill._id}` : `View details for bill ${bill._id}`}
                              >
                                {selectedBillId === bill._id ? 'Hide Details' : 'View Details'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {selectedBillId === bill._id && (
                        <tr className="imports-details-row">
                          <td colSpan="5">
                            <div className="imports-details-container">
                              <h3 className="imports-form-title">Bill Details</h3>
                              {billDetails.length === 0 ? (
                                <div className="imports-empty" role="status">
                                  <p>No import bill details found for this bill.</p>
                                </div>
                              ) : (
                                <table className="imports-table details">
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th>Bill</th>
                                      <th>Product</th>
                                      <th>Quantity</th>
                                      <th>Import Price</th>
                                      <th>Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {billDetails.map((detail, index) => (
                                      <tr key={detail._id} className="imports-table-row">
                                        <td>{index + 1}</td>
                                        <td>
                                          {bills.find(b => b._id === selectedBillId)
                                            ? `${new Date(bills.find(b => b._id === selectedBillId).create_date).toLocaleDateString()} - ${formatPrice(bills.find(b => b._id === selectedBillId).total_amount)}`
                                            : 'N/A'}
                                        </td>
                                        <td>
                                          {editingDetailId === detail._id ? (
                                            <select
                                              value={editFormData.variant_id || detail.variant_id?._id || detail.variant_id}
                                              onChange={(e) => handleEditFieldChange(e, 'variant_id')}
                                              className="imports-form-select"
                                              aria-label="Variant"
                                              required
                                            >
                                              <option value="">Select Variant</option>
                                              {variants.map(variant => (
                                                <option key={variant._id} value={variant._id}>
                                                  {getProductNameByVariant(variant._id)}
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            getProductNameByVariant(detail.variant_id?._id || detail.variant_id) || 'N/A'
                                          )}
                                        </td>
                                        <td>
                                          {editingDetailId === detail._id ? (
                                            <input
                                              type="number"
                                              value={editFormData.quantity || detail.quantity}
                                              onChange={(e) => handleEditFieldChange(e, 'quantity')}
                                              className="imports-form-input"
                                              aria-label="Quantity"
                                              min="1"
                                              required
                                            />
                                          ) : (
                                            detail.quantity
                                          )}
                                        </td>
                                        <td>
                                          {editingDetailId === detail._id ? (
                                            <input
                                              type="number"
                                              value={editFormData.import_price || detail.import_price}
                                              onChange={(e) => handleEditFieldChange(e, 'import_price')}
                                              className="imports-form-input"
                                              aria-label="Import Price"
                                              min="0"
                                              required
                                            />
                                          ) : (
                                            formatPrice(detail.import_price)
                                          )}
                                        </td>
                                        <td>
                                          {editingDetailId === detail._id ? (
                                            <div className="imports-action-buttons">
                                              <button
                                                onClick={() => handleUpdateSubmit('details', null, detail._id)}
                                                className="imports-update-button"
                                                aria-label={`Update detail ${detail._id}`}
                                                disabled={loading || !editFormData.variant_id || !editFormData.quantity || !editFormData.import_price}
                                              >
                                                Update
                                              </button>
                                              <button
                                                onClick={() => { setEditingDetailId(null); setEditFormData({}); }}
                                                className="imports-cancel-button"
                                                aria-label={`Cancel editing detail ${detail._id}`}
                                                disabled={loading}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="imports-action-buttons">
                                              <button
                                                onClick={() => {
                                                  setEditingDetailId(detail._id);
                                                  setEditFormData({
                                                    bill_id: selectedBillId,
                                                    variant_id: detail.variant_id?._id || detail.variant_id,
                                                    quantity: detail.quantity,
                                                    import_price: detail.import_price
                                                  });
                                                }}
                                                className="imports-edit-button"
                                                aria-label={`Edit detail ${detail._id}`}
                                              >
                                                Update
                                              </button>
                                              <button
                                                onClick={() => deleteDetail(detail._id)}
                                                className="imports-delete-button"
                                                aria-label={`Delete detail ${detail._id}`}
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
      )}
    </div>
  );
};

export default ImportBills;