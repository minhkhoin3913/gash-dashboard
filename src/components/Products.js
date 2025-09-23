import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Products.css';
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
    const message = status === 401 ? 'Unauthorized access - please log in' :
                    status === 404 ? 'Resource not found' :
                    status >= 500 ? 'Server error - please try again later' :
                    'Network error - please check your connection';
    return Promise.reject({ ...error, message, skipRetry: status === 400 });
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
      if (i === retries - 1 || error.skipRetry) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

const Products = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
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
    description: '',
    status_product: 'active',
  });
  const [newProductImageFile, setNewProductImageFile] = useState(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState('');
  
  // Filter states
  const [filters, setFilters] = useState({
    searchQuery: '',
    categoryFilter: '',
    statusFilter: '',
    minPrice: '',
    maxPrice: '',
    hasImage: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(20);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState('');

  // Status options
  const statusOptions = ['active', 'discontinued', 'out_of_stock'];

  // Apply filters to products
  const applyFilters = useCallback((productsList, filterSettings) => {
    return productsList.filter(product => {
      // Search query filter
      if (filterSettings.searchQuery) {
        const query = filterSettings.searchQuery.toLowerCase();
        const productName = product.pro_name?.toLowerCase() || '';
        const description = product.description?.toLowerCase() || '';
        const status = product.status_product?.toLowerCase() || '';
        const productId = product._id?.toLowerCase() || '';
        
        if (!productName.includes(query) && 
            !description.includes(query) && 
            !status.includes(query) && 
            !productId.includes(query)) {
          return false;
        }
      }

      // Category filter
      if (filterSettings.categoryFilter && product.cat_id?._id !== filterSettings.categoryFilter) {
        return false;
      }

      // Status filter
      if (filterSettings.statusFilter && product.status_product !== filterSettings.statusFilter) {
        return false;
      }

      // Price range filter
      if (filterSettings.minPrice && product.pro_price < parseFloat(filterSettings.minPrice)) {
        return false;
      }
      if (filterSettings.maxPrice && product.pro_price > parseFloat(filterSettings.maxPrice)) {
        return false;
      }

      // Image filter
      if (filterSettings.hasImage === 'true' && (!product.imageURL || product.imageURL === '')) {
        return false;
      }
      if (filterSettings.hasImage === 'false' && product.imageURL && product.imageURL !== '') {
        return false;
      }

      return true;
    });
  }, []);

  // Update filtered products when products or filters change
  useEffect(() => {
    setFilteredProducts(applyFilters(products, filters));
    setCurrentPage(1); // Reset to first page when filters change
  }, [products, filters, applyFilters]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentProducts = filteredProducts.slice(startIndex, endIndex);

  // Handle page change
  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  // Handle previous page
  const handlePreviousPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);

  // Handle next page
  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  // Check if any filters are active
  const hasActiveFilters = useCallback(() => {
    return filters.searchQuery || 
           filters.categoryFilter || 
           filters.statusFilter || 
           filters.minPrice || 
           filters.maxPrice || 
           filters.hasImage;
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

  // Handle filter changes
  const handleFilterChange = useCallback((field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      categoryFilter: '',
      statusFilter: '',
      minPrice: '',
      maxPrice: '',
      hasImage: ''
    });
  }, []);

  // Toggle filter visibility
  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  // Upload helper (single image)
  const uploadSingleImage = useCallback(async (file) => {
    const token = localStorage.getItem('token');
    if (!file) return '';
    const formData = new FormData();
    formData.append('image', file);
    const response = await apiClient.post('/upload', formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.url || '';
  }, []);

  // Handle file selection (Add form)
  const handleNewImageFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      // Validate file type - must be an image
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'Product update failed, information remains unchanged' });
        setNewProductImageFile(null);
        setNewProductImagePreview('');
        // Reset the file input
        e.target.value = '';
        return;
      }
      setNewProductImageFile(file);
      setNewProductImagePreview(URL.createObjectURL(file));
    } else {
      setNewProductImageFile(null);
      setNewProductImagePreview('');
    }
  }, []);

  // Handle file selection (Edit form)
  const handleEditImageFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      // Validate file type - must be an image
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'Product update failed, information remains unchanged' });
        setEditImageFile(null);
        setEditImagePreview('');
        // Reset the file input
        e.target.value = '';
        return;
      }
      setEditImageFile(file);
      setEditImagePreview(URL.createObjectURL(file));
    } else {
      setEditImageFile(null);
      setEditImagePreview('');
    }
  }, []);

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
    if (!newProductImageFile) {
      setError('Please upload a product image');
      setLoading(false);
      return;
    }
    // Additional validation to ensure file is an image
    if (!newProductImageFile.type.startsWith('image/')) {
      setError('Product update failed, information remains unchanged');
      setToast({ type: 'error', message: 'Product update failed, information remains unchanged' });
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const imageURLToUse = await uploadSingleImage(newProductImageFile);
      if (!imageURLToUse) {
        throw new Error('Image upload failed');
      }
      const response = await apiClient.post('/products', {
        ...newProductForm,
        imageURL: imageURLToUse,
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
        description: '',
        status_product: 'active',
      });
      setNewProductImageFile(null);
      setNewProductImagePreview('');
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
    // Additional validation to ensure file is an image if editing image
    if (editImageFile && !editImageFile.type.startsWith('image/')) {
      setError('Product update failed, information remains unchanged');
      setToast({ type: 'error', message: 'Product update failed, information remains unchanged' });
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      let imageURLToUse = editFormData.imageURL;
      if (editImageFile) {
        imageURLToUse = await uploadSingleImage(editImageFile);
        if (!imageURLToUse) {
          throw new Error('Image upload failed');
        }
      }
      const response = await apiClient.put(`/products/${productId}`, {
        ...editFormData,
        imageURL: imageURLToUse,
        pro_price: parseFloat(editFormData.pro_price),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Product updated:', response.data);
      // Normalize the response to match the populated format
      const updatedProduct = {
        ...response.data.product,
        imageURL: imageURLToUse, // Ensure the new image URL is used
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
      setEditImageFile(null);
      setEditImagePreview('');
    } catch (err) {
      setError(err.message || 'Failed to update product');
      setToast({ type: 'error', message: err.message || 'Failed to update product' });
      console.error('Update product error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData, categories, editImageFile, uploadSingleImage]);

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
    setEditImageFile(null);
    setEditImagePreview('');
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
    setEditImageFile(null);
    setEditImagePreview('');
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
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
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

      <div className="products-header">
        <h1 className="products-title">Product Management</h1>
        <div className="products-header-actions">
          <button
            className="products-filter-toggle"
            onClick={toggleFilters}
            aria-label="Toggle filters"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button
            onClick={toggleAddForm}
            className="products-add-button"
            aria-label={showAddForm ? 'Cancel adding product' : 'Add new product'}
          >
            {showAddForm ? 'Cancel Add' : 'Add Product'}
          </button>
        </div>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="products-filters">
          <h2 className="products-search-title">Search Products</h2>
          <div className="products-filters-grid">
            <div className="products-search-section">
              {/* Search Query */}
              <div className="products-filter-group">
                <label htmlFor="searchQuery" className="products-filter-label">Search</label>
                <input
                  type="text"
                  id="searchQuery"
                  value={filters.searchQuery}
                  onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
                  placeholder="Search by product name, description, status..."
                  className="products-filter-input"
                />
              </div>
            </div>

            <div className="products-filter-options">
              {/* Category Filter */}
              <div className="products-filter-group">
                <label htmlFor="categoryFilter" className="products-filter-label">Category</label>
                <select
                  id="categoryFilter"
                  value={filters.categoryFilter}
                  onChange={(e) => handleFilterChange('categoryFilter', e.target.value)}
                  className="products-filter-select"
                >
                  <option value="">All Categories</option>
                  {categories.map(category => (
                    <option key={category._id} value={category._id}>
                      {category.cat_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="products-filter-group">
                <label htmlFor="statusFilter" className="products-filter-label">Status</label>
                <select
                  id="statusFilter"
                  value={filters.statusFilter}
                  onChange={(e) => handleFilterChange('statusFilter', e.target.value)}
                  className="products-filter-select"
                >
                  <option value="">All Statuses</option>
                  {statusOptions.map(status => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Range Filters */}
              <div className="products-filter-group">
                <label htmlFor="minPrice" className="products-filter-label">Min Price</label>
                <input
                  type="number"
                  id="minPrice"
                  value={filters.minPrice}
                  onChange={(e) => handleFilterChange('minPrice', e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="products-filter-input"
                />
              </div>

              <div className="products-filter-group">
                <label htmlFor="maxPrice" className="products-filter-label">Max Price</label>
                <input
                  type="number"
                  id="maxPrice"
                  value={filters.maxPrice}
                  onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
                  placeholder="999.99"
                  step="0.01"
                  min="0"
                  className="products-filter-input"
                />
              </div>

              {/* Image Filter */}
              <div className="products-filter-group">
                <label htmlFor="hasImage" className="products-filter-label">Image Status</label>
                <select
                  id="hasImage"
                  value={filters.hasImage}
                  onChange={(e) => handleFilterChange('hasImage', e.target.value)}
                  className="products-filter-select"
                >
                  <option value="">All Products</option>
                  <option value="true">With Image</option>
                  <option value="false">Without Image</option>
                </select>
              </div>
            </div>
          </div>

          <div className="products-filter-actions">
            <button
              className="products-clear-filters"
              onClick={clearFilters}
              disabled={!hasActiveFilters()}
              aria-label="Clear all filters"
            >
              Clear Filters
            </button>
            <div className="products-filter-summary">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length} products
            </div>
          </div>
        </div>
      )}

      {/* Add Product Form */}
      {showAddForm && (
        <div className="products-add-form">
          <h2 className="products-form-title">Add New Product</h2>
          <div className="products-form-grid">
            <div className="products-form-group">
              <label htmlFor="new-pro-name">Product Name *</label>
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
              <label htmlFor="new-cat-id">Category *</label>
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
              <label htmlFor="new-pro-price">Price *</label>
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
            <div className="products-form-group products-file-group">
              <label htmlFor="new-image-file">Upload Image</label>
              <div className="products-file-input">
                <input
                  id="new-image-file"
                  type="file"
                  accept="image/*"
                  onChange={handleNewImageFileChange}
                  aria-label="Upload product image file"
                />
              </div>
              {newProductImagePreview && (
                <div className="products-image-preview">
                  <img
                    src={newProductImagePreview}
                    alt="Preview"
                    className="products-image"
                  />
                </div>
              )}
            </div>
            <div className="products-form-group products-status-group">
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
          </div>
          <div className="products-form-group products-description-group">
            <label htmlFor="new-description">Description</label>
            <textarea
              id="new-description"
              value={newProductForm.description}
              onChange={(e) => handleNewProductFieldChange(e, 'description')}
              className="products-form-textarea products-description-textarea"
              aria-label="Product description"
              placeholder="Enter product description..."
            />
          </div>
          <div className="products-form-actions">
            <button
              onClick={handleCreateSubmit}
              className="products-create-button"
              aria-label="Create product"
              disabled={loading}
            >
              Create Product
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
      {!loading && filteredProducts.length === 0 && !error ? (
        <div className="products-empty" role="status">
          <p>{products.length === 0 ? 'No products found.' : 'No products match the current filters.'}</p>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentProducts.map((product, index) => (
                <React.Fragment key={product._id}>
                  <tr className="products-table-row">
                    <td>{startIndex + index + 1}</td>
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
                        <div className="products-edit-image">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleEditImageFileChange}
                            aria-label="Upload new product image"
                          />
                          {editImagePreview ? (
                            <div className="products-image-preview">
                              <img
                                src={editImagePreview}
                                alt="New image preview"
                                className="products-image"
                              />
                            </div>
                          ) : product.imageURL ? (
                            <div className="products-image-preview">
                              <img
                                src={product.imageURL}
                                alt="Current image"
                                className="products-image"
                              />
                            </div>
                          ) : null}
                        </div>
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
                            Edit
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

      {/* Pagination */}
      {filteredProducts.length > 0 && (
        <div className="products-pagination">
          <div className="products-pagination-info">
            Showing {startIndex + 1} to {Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length} products
          </div>
          <div className="products-pagination-controls">
            <button
              className="products-pagination-button"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              Previous
            </button>
            
            <div className="products-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`products-pagination-page ${currentPage === page ? 'active' : ''}`}
                  onClick={() => handlePageChange(page)}
                  aria-label={`Page ${page}`}
                >
                  {page}
                </button>
              ))}
            </div>
            
            <button
              className="products-pagination-button"
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

export default Products;