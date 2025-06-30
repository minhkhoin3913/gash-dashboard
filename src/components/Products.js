import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Products.css';
import axios from 'axios';

// API client with interceptors
const apiClient = axios.create({
  baseURL: (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/$/, ''), // Remove trailing slash
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
      console.log(`Fetching ${url}, attempt ${i + 1}`);
      const response = await apiClient.get(url, options);
      return response.data;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

const Products = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    pro_name: '',
    cat_id: '',
    pro_price: '',
    imageURL: '',
    description: '',
    status_product: '',
  });
  const [newProductForm, setNewProductForm] = useState({
    pro_name: '',
    cat_id: '',
    pro_price: '',
    imageURL: '',
    description: '',
    status_product: 'active',
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  // Status options
  const statusOptions = ['active', 'discontinued', 'out_of_stock'];

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000); // Toast disappears after 3 seconds
      return () => clearTimeout(timer); // Cleanup on unmount or new toast
    }
  }, [toast]);

  // Fetch categories and products sequentially
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry('/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched categories:', response);
      setCategories(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load categories');
      console.error('Fetch categories error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    if (!user?._id) {
      setError('User not authenticated');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry('/products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched products:', response);
      setProducts(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load products');
      console.error('Fetch products error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    await fetchCategories();
    await fetchProducts();
  }, [fetchCategories, fetchProducts]);

  // Create product
  const createProduct = useCallback(async () => {
    setLoading(true);
    setError('');
    setToast(null);

    // Validate form
    if (!newProductForm.pro_name || !newProductForm.cat_id || !newProductForm.pro_price) {
      setError('Product name, category, and price are required');
      setLoading(false);
      return;
    }
    if (isNaN(newProductForm.pro_price) || newProductForm.pro_price <= 0) {
      setError('Price must be a positive number');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await apiClient.post('/products', {
        ...newProductForm,
        pro_price: parseFloat(newProductForm.pro_price),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Product created:', response.data);
      // Normalize the response to match the populated format
      const newProduct = {
        ...response.data.product,
        cat_id: categories.find(cat => cat._id === newProductForm.cat_id) || { _id: newProductForm.cat_id, cat_name: 'N/A' },
      };
      setProducts(prev => [...prev, newProduct]);
      setToast({ type: 'success', message: 'Product created successfully' });
      setNewProductForm({
        pro_name: '',
        cat_id: '',
        pro_price: '',
        imageURL: '',
        description: '',
        status_product: 'active',
      });
      setShowAddForm(false);
    } catch (err) {
      setError(err.message || 'Failed to create product');
      setToast({ type: 'error', message: err.message || 'Failed to create product' });
      console.error('Create product error:', err);
    } finally {
      setLoading(false);
    }
  }, [newProductForm, categories]);

  // Update product
  const updateProduct = useCallback(async (productId) => {
    setLoading(true);
    setError('');
    setToast(null);

    // Validate form
    if (!editFormData.pro_name || !editFormData.cat_id) {
      setError('Product name and category are required');
      setLoading(false);
      return;
    }
    if (isNaN(editFormData.pro_price) || editFormData.pro_price <= 0) {
      setError('Price must be a positive number');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await apiClient.put(`/products/${productId}`, {
        ...editFormData,
        pro_price: parseFloat(editFormData.pro_price),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Product updated:', response.data);
      // Normalize the response to match the populated format
      const updatedProduct = {
        ...response.data.product,
        cat_id: categories.find(cat => cat._id === editFormData.cat_id) || { _id: editFormData.cat_id, cat_name: 'N/A' },
      };
      setProducts(prev =>
        prev.map(product =>
          product._id === productId ? updatedProduct : product
        )
      );
      setToast({ type: 'success', message: 'Product updated successfully' });
      setEditingProductId(null);
      setEditFormData({
        pro_name: '',
        cat_id: '',
        pro_price: '',
        imageURL: '',
        description: '',
        status_product: '',
      });
    } catch (err) {
      setError(err.message || 'Failed to update product');
      setToast({ type: 'error', message: err.message || 'Failed to update product' });
      console.error('Update product error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData, categories]);

  // Delete product
  const deleteProduct = useCallback(async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      await apiClient.delete(`/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Product deleted:', productId);
      setProducts(prev => prev.filter(product => product._id !== productId));
      setToast({ type: 'success', message: 'Product deleted successfully' });
      if (selectedProductId === productId) setSelectedProductId(null);
      if (editingProductId === productId) setEditingProductId(null);
    } catch (err) {
      setError(err.message || 'Failed to delete product');
      setToast({ type: 'error', message: err.message || 'Failed to delete product' });
      console.error('Delete product error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, editingProductId]);

  // Handle authentication state and fetch data
  useEffect(() => {
    console.log('Products useEffect: user=', user, 'isAuthLoading=', isAuthLoading);
    if (isAuthLoading) {
      return;
    }
    if (!user && !localStorage.getItem('token')) {
      console.log('No user and no token, redirecting to login');
      navigate('/login', { replace: true });
    } else if (user) {
      fetchData();
    }
  }, [user, isAuthLoading, navigate, fetchData]);

  // Toggle product details visibility
  const handleToggleDetails = useCallback((productId) => {
    setSelectedProductId(prev => prev === productId ? null : productId);
  }, []);

  // Start editing product
  const handleEditProduct = useCallback((product) => {
    setEditingProductId(product._id);
    setEditFormData({
      pro_name: product.pro_name || '',
      cat_id: product.cat_id?._id || product.cat_id || '',
      pro_price: product.pro_price ? product.pro_price.toFixed(2) : '',
      imageURL: product.imageURL || '',
      description: product.description || '',
      status_product: product.status_product || 'active',
    });
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingProductId(null);
    setEditFormData({
      pro_name: '',
      cat_id: '',
      pro_price: '',
      imageURL: '',
      description: '',
      status_product: '',
    });
  }, []);

  // Handle field change for edit form
  const handleEditFieldChange = useCallback((e, field) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Handle field change for new product form
  const handleNewProductFieldChange = useCallback((e, field) => {
    setNewProductForm(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Submit updated fields
  const handleUpdateSubmit = useCallback((productId) => {
    updateProduct(productId);
  }, [updateProduct]);

  // Submit new product
  const handleCreateSubmit = useCallback(() => {
    createProduct();
  }, [createProduct]);

  // Toggle add product form
  const toggleAddForm = useCallback(() => {
    setShowAddForm(prev => !prev);
    setNewProductForm({
      pro_name: '',
      cat_id: '',
      pro_price: '',
      imageURL: '',
      description: '',
      status_product: 'active',
    });
    setError('');
  }, []);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Format price
  const formatPrice = useCallback((price) => {
    if (typeof price !== 'number' || isNaN(price)) return 'N/A';
    return `$${price.toFixed(2)}`;
  }, []);

  // Get category name by ID
  const getCategoryName = useCallback((catId) => {
    if (!catId) return 'N/A';
    // Handle both populated object and string ID
    const catIdString = typeof catId === 'object' ? catId._id : catId;
    const category = categories.find(cat => cat._id === catIdString);
    return category?.cat_name || 'N/A';
  }, [categories]);

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="products-container">
        <div className="products-loading" role="status" aria-live="polite">
          <div className="products-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="products-container">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`products-toast ${toast.type === 'success' ? 'products-toast-success' : 'products-toast-error'}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <h1 className="products-title">Product Management</h1>

      {/* Add Product Button */}
      <div className="products-add-button-container">
        <button
          onClick={toggleAddForm}
          className="products-add-button"
          aria-label={showAddForm ? 'Cancel adding product' : 'Add new product'}
        >
          {showAddForm ? 'Cancel' : 'Add Product'}
        </button>
      </div>

      {/* Add Product Form */}
      {showAddForm && (
        <div className="products-add-form">
          <h2 className="products-form-title">Add New Product</h2>
          <div className="products-form-group">
            <label htmlFor="new-pro-name">Product Name</label>
            <input
              id="new-pro-name"
              type="text"
              value={newProductForm.pro_name}
              onChange={(e) => handleNewProductFieldChange(e, 'pro_name')}
              className="products-form-input"
              aria-label="Product name"
              required
            />
          </div>
          <div className="products-form-group">
            <label htmlFor="new-cat-id">Category</label>
            <select
              id="new-cat-id"
              value={newProductForm.cat_id}
              onChange={(e) => handleNewProductFieldChange(e, 'cat_id')}
              className="products-form-select"
              aria-label="Product category"
              required
            >
              <option value="">Select Category</option>
              {categories.map(category => (
                <option key={category._id} value={category._id}>
                  {category.cat_name}
                </option>
              ))}
            </select>
          </div>
          <div className="products-form-group">
            <label htmlFor="new-pro-price">Price</label>
            <input
              id="new-pro-price"
              type="number"
              step="0.01"
              value={newProductForm.pro_price}
              onChange={(e) => handleNewProductFieldChange(e, 'pro_price')}
              className="products-form-input"
              aria-label="Product price"
              required
            />
          </div>
          <div className="products-form-group">
            <label htmlFor="new-image-url">Image URL</label>
            <input
              id="new-image-url"
              type="text"
              value={newProductForm.imageURL}
              onChange={(e) => handleNewProductFieldChange(e, 'imageURL')}
              className="products-form-input"
              aria-label="Product image URL"
            />
          </div>
          <div className="products-form-group">
            <label htmlFor="new-description">Description</label>
            <textarea
              id="new-description"
              value={newProductForm.description}
              onChange={(e) => handleNewProductFieldChange(e, 'description')}
              className="products-form-textarea"
              aria-label="Product description"
            />
          </div>
          <div className="products-form-group">
            <label htmlFor="new-status-product">Status</label>
            <select
              id="new-status-product"
              value={newProductForm.status_product}
              onChange={(e) => handleNewProductFieldChange(e, 'status_product')}
              className="products-form-select"
              aria-label="Product status"
            >
              {statusOptions.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="products-form-actions">
            <button
              onClick={handleCreateSubmit}
              className="products-create-button"
              aria-label="Create product"
              disabled={loading}
            >
              Create
            </button>
            <button
              onClick={toggleAddForm}
              className="products-cancel-button"
              aria-label="Cancel creating product"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="products-error" role="alert" aria-live="assertive">
          <span className="products-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="products-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading products"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="products-loading" role="status" aria-live="polite">
          <div className="products-progress-bar"></div>
          <p>Loading products...</p>
        </div>
      )}

      {/* Products Table */}
      {!loading && products.length === 0 && !error ? (
        <div className="products-empty" role="status">
          <p>No products found.</p>
          <button 
            className="products-continue-shopping-button"
            onClick={() => navigate('/')}
            aria-label="Continue shopping"
          >
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="products-table-container">
          <table className="products-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Image</th>
                <th>Description</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => (
                <React.Fragment key={product._id}>
                  <tr className="products-table-row">
                    <td>{index + 1}</td>
                    <td>
                      {editingProductId === product._id ? (
                        <input
                          type="text"
                          value={editFormData.pro_name}
                          onChange={(e) => handleEditFieldChange(e, 'pro_name')}
                          className="products-form-input"
                          aria-label="Product name"
                          required
                        />
                      ) : (
                        product.pro_name || 'N/A'
                      )}
                    </td>
                    <td>
                      {editingProductId === product._id ? (
                        <select
                          value={editFormData.cat_id}
                          onChange={(e) => handleEditFieldChange(e, 'cat_id')}
                          className="products-field-select"
                          aria-label="Product category"
                          required
                        >
                          <option value="">Select Category</option>
                          {categories.map(category => (
                            <option key={category._id} value={category._id}>
                              {category.cat_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        getCategoryName(product.cat_id)
                      )}
                    </td>
                    <td>
                      {editingProductId === product._id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editFormData.pro_price}
                          onChange={(e) => handleEditFieldChange(e, 'pro_price')}
                          className="products-form-input"
                          aria-label="Product price"
                          required
                        />
                      ) : (
                        formatPrice(product.pro_price)
                      )}
                    </td>
                    <td>
                      {editingProductId === product._id ? (
                        <input
                          type="text"
                          value={editFormData.imageURL}
                          onChange={(e) => handleEditFieldChange(e, 'imageURL')}
                          className="products-form-input"
                          aria-label="Product image URL"
                        />
                      ) : product.imageURL ? (
                        <img
                          src={product.imageURL}
                          alt={product.pro_name || 'Product'}
                          className="products-image"
                          onError={(e) => {
                            e.target.alt = 'Image not available';
                            e.target.style.opacity = '0.5';
                          }}
                        />
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="products-description">
                      {editingProductId === product._id ? (
                        <textarea
                          value={editFormData.description}
                          onChange={(e) => handleEditFieldChange(e, 'description')}
                          className="products-form-textarea"
                          aria-label="Product description"
                        />
                      ) : (
                        product.description ? `${product.description.substring(0, 50)}${product.description.length > 50 ? '...' : ''}` : 'N/A'
                      )}
                    </td>
                    <td className={`products-status-${product.status_product?.toLowerCase() || 'unknown'}`}>
                      {editingProductId === product._id ? (
                        <select
                          value={editFormData.status_product}
                          onChange={(e) => handleEditFieldChange(e, 'status_product')}
                          className="products-field-select"
                          aria-label="Product status"
                        >
                          {statusOptions.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        product.status_product || 'N/A'
                      )}
                    </td>
                    <td>
                      {editingProductId === product._id ? (
                        <div className="products-action-buttons">
                          <button
                            onClick={() => handleUpdateSubmit(product._id)}
                            className="products-update-button"
                            aria-label={`Update product ${product._id}`}
                            disabled={loading || !editFormData.pro_name || !editFormData.cat_id}
                          >
                            Update
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="products-cancel-button"
                            aria-label={`Cancel editing product ${product._id}`}
                            disabled={loading}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="products-action-buttons">
                          <button
                            onClick={() => handleToggleDetails(product._id)}
                            className="products-toggle-details"
                            aria-label={selectedProductId === product._id ? `Hide details for product ${product._id}` : `View details for product ${product._id}`}
                          >
                            {selectedProductId === product._id ? 'Hide Details' : 'View Details'}
                          </button>
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="products-edit-button"
                            aria-label={`Edit product ${product._id}`}
                          >
                            Update
                          </button>
                          <button
                            onClick={() => deleteProduct(product._id)}
                            className="products-delete-button"
                            aria-label={`Delete product ${product._id}`}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {selectedProductId === product._id && (
                    <tr className="products-details-row">
                      <td colSpan="8">
                        <div className="products-details-section">
                          <h2 className="products-details-title">Product Details</h2>
                          <p className="products-detail-description">
                            <strong>Description:</strong> {product.description || 'No description available'}
                          </p>
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

export default Products;