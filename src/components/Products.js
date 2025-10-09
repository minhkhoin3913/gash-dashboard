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
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [productVariants, setProductVariants] = useState({});
  const [editingProductId, setEditingProductId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    productName: '',
    categoryId: '',
    description: '',
    productStatus: '',
  });
  const [newProductForm, setNewProductForm] = useState({
    productName: '',
    categoryId: '',
    description: '',
    productStatus: 'pending',
  });
  const [newProductImages, setNewProductImages] = useState([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  
  // Filter states
  const [filters, setFilters] = useState({
    searchQuery: '',
    categoryFilter: '',
    statusFilter: '',
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

  // Status options
  const statusOptions = ['active', 'inactive', 'pending', 'discontinued'];

  // Apply filters to products
  const applyFilters = useCallback((productsList, filterSettings) => {
    return productsList.filter(product => {
      // Search query filter
      if (filterSettings.searchQuery) {
        const query = filterSettings.searchQuery.toLowerCase();
        const productName = product.productName?.toLowerCase() || '';
        const description = product.description?.toLowerCase() || '';
        const status = product.productStatus?.toLowerCase() || '';
        const productId = product._id?.toLowerCase() || '';
        
        if (!productName.includes(query) && 
            !description.includes(query) && 
            !status.includes(query) && 
            !productId.includes(query)) {
          return false;
        }
      }

      // Category filter
      if (filterSettings.categoryFilter && product.categoryId?._id !== filterSettings.categoryFilter) {
        return false;
      }

      // Status filter
      if (filterSettings.statusFilter && product.productStatus !== filterSettings.statusFilter) {
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
           filters.statusFilter;
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

  // Fetch categories
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

  // Fetch colors
  const fetchColors = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry('/specifications/color', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched colors:', response);
      setColors(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch colors error:', err);
    }
  }, []);

  // Fetch sizes
  const fetchSizes = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry('/specifications/size', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched sizes:', response);
      setSizes(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch sizes error:', err);
    }
  }, []);

  // Fetch products
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
      const response = await fetchWithRetry('/new-products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched products:', response);
      const productsData = response.success ? response.data : response;
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      setError(err.message || 'Failed to load products');
      console.error('Fetch products error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch variants for a specific product
  const fetchProductVariants = useCallback(async (productId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry(`/new-variants?productId=${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched variants:', response);
      const variantsData = response.success ? response.data : response;
      setProductVariants(prev => ({
        ...prev,
        [productId]: Array.isArray(variantsData) ? variantsData : []
      }));
    } catch (err) {
      console.error('Fetch variants error:', err);
      setProductVariants(prev => ({
        ...prev,
        [productId]: []
      }));
    }
  }, []);

  const fetchData = useCallback(async () => {
    await fetchCategories();
    await fetchColors();
    await fetchSizes();
    await fetchProducts();
  }, [fetchCategories, fetchColors, fetchSizes, fetchProducts]);

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

  // Handle adding image to new product
  const handleAddProductImage = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'Please select a valid image file' });
        e.target.value = '';
        return;
      }
      setNewProductImages(prev => [...prev, file]);
      e.target.value = '';
    }
  }, []);

  // Remove image from new product
  const handleRemoveProductImage = useCallback((index) => {
    setNewProductImages(prev => {
      const newImages = prev.filter((_, i) => i !== index);
      if (thumbnailIndex >= newImages.length) {
        setThumbnailIndex(Math.max(0, newImages.length - 1));
      }
      return newImages;
    });
  }, [thumbnailIndex]);

  // Set thumbnail
  const handleSetThumbnail = useCallback((index) => {
    setThumbnailIndex(index);
  }, []);

  // Create product
  const createProduct = useCallback(async () => {
    setLoading(true);
    setError('');
    setToast(null);

    // Validate form
    if (!newProductForm.productName || !newProductForm.categoryId || !newProductForm.description) {
      setError('Product name, category, and description are required');
      setLoading(false);
      return;
    }
    if (newProductImages.length === 0) {
      setError('Please upload at least one product image');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      
      // Create product first
      const response = await apiClient.post('/new-products', {
        ...newProductForm,
        productStatus: 'pending', // Set to pending as per requirement
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Product created:', response.data);
      const newProduct = response.data.success ? response.data.data : response.data;
      
      // Upload images and create variants
      // Note: Since we're uploading images for the product, we'll need to save them
      // For now, we'll just upload the thumbnail
      // In a complete implementation, you would create variants here with uploaded images
      
      // Normalize the response to match the populated format
      const productWithCategory = {
        ...newProduct,
        categoryId: categories.find(cat => cat._id === newProductForm.categoryId) || { _id: newProductForm.categoryId, cat_name: 'N/A' },
      };
      
      setProducts(prev => [...prev, productWithCategory]);
      setToast({ type: 'success', message: 'Product created successfully. Now you can add variants.' });
      setNewProductForm({
        productName: '',
        categoryId: '',
        description: '',
        productStatus: 'pending',
      });
      setNewProductImages([]);
      setThumbnailIndex(0);
      setShowAddForm(false);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create product');
      setToast({ type: 'error', message: err.response?.data?.message || err.message || 'Failed to create product' });
      console.error('Create product error:', err);
    } finally {
      setLoading(false);
    }
  }, [newProductForm, newProductImages, categories, thumbnailIndex]);

  // Update product
  const updateProduct = useCallback(async (productId) => {
    setLoading(true);
    setError('');
    setToast(null);

    // Validate form
    if (!editFormData.productName || !editFormData.categoryId) {
      setError('Product name and category are required');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      
      const response = await apiClient.put(`/new-products/${productId}`, editFormData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Product updated:', response.data);
      const updatedProduct = response.data.success ? response.data.data : response.data;
      
      // Normalize the response to match the populated format
      const productWithCategory = {
        ...updatedProduct,
        categoryId: categories.find(cat => cat._id === editFormData.categoryId) || { _id: editFormData.categoryId, cat_name: 'N/A' },
      };
      
      setProducts(prev =>
        prev.map(product =>
          product._id === productId ? productWithCategory : product
        )
      );
      setToast({ type: 'success', message: 'Product updated successfully' });
      setEditingProductId(null);
      setEditFormData({
        productName: '',
        categoryId: '',
        description: '',
        productStatus: '',
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update product');
      setToast({ type: 'error', message: err.response?.data?.message || err.message || 'Failed to update product' });
      console.error('Update product error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData, categories]);

  // Delete product (soft delete)
  const deleteProduct = useCallback(async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product? This will set it to discontinued status.')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      
      await apiClient.delete(`/new-products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Product deleted:', productId);
      
      // Update the product status to discontinued instead of removing from list
      setProducts(prev =>
        prev.map(product =>
          product._id === productId ? { ...product, productStatus: 'discontinued' } : product
        )
      );
      
      setToast({ type: 'success', message: 'Product discontinued successfully' });
      if (selectedProductId === productId) setSelectedProductId(null);
      if (editingProductId === productId) setEditingProductId(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to delete product');
      setToast({ type: 'error', message: err.response?.data?.message || err.message || 'Failed to delete product' });
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
    setSelectedProductId(prev => {
      const newSelectedId = prev === productId ? null : productId;
      if (newSelectedId && !productVariants[productId]) {
        fetchProductVariants(productId);
      }
      return newSelectedId;
    });
  }, [productVariants, fetchProductVariants]);

  // Start editing product
  const handleEditProduct = useCallback((product) => {
    if (product.productStatus === 'discontinued') {
      setToast({ type: 'error', message: 'Cannot edit discontinued products' });
      return;
    }
    setEditingProductId(product._id);
    setEditFormData({
      productName: product.productName || '',
      categoryId: product.categoryId?._id || product.categoryId || '',
      description: product.description || '',
      productStatus: product.productStatus || 'pending',
    });
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingProductId(null);
    setEditFormData({
      productName: '',
      categoryId: '',
      description: '',
      productStatus: '',
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
      productName: '',
      categoryId: '',
      description: '',
      productStatus: 'pending',
    });
    setNewProductImages([]);
    setThumbnailIndex(0);
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
              <label htmlFor="new-product-name">Product Name *</label>
              <input
                id="new-product-name"
                type="text"
                value={newProductForm.productName}
                onChange={(e) => handleNewProductFieldChange(e, 'productName')}
                className="products-form-input"
                aria-label="Product name"
                required
              />
            </div>
            <div className="products-form-group">
              <label htmlFor="new-cat-id">Category *</label>
              <select
                id="new-cat-id"
                value={newProductForm.categoryId}
                onChange={(e) => handleNewProductFieldChange(e, 'categoryId')}
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
          </div>
          <div className="products-form-group products-description-group">
            <label htmlFor="new-description">Description *</label>
            <textarea
              id="new-description"
              value={newProductForm.description}
              onChange={(e) => handleNewProductFieldChange(e, 'description')}
              className="products-form-textarea products-description-textarea"
              aria-label="Product description"
              placeholder="Enter product description..."
              required
            />
          </div>
          
          {/* Product Images */}
          <div className="products-form-group">
            <label>Product Images *</label>
            <div className="products-images-container">
              {newProductImages.map((image, index) => (
                <div key={index} className="products-image-item">
                  <img 
                    src={URL.createObjectURL(image)} 
                    alt={`Product ${index + 1}`} 
                    className="products-image-preview"
                  />
                  <div className="products-image-actions">
                    {thumbnailIndex === index && (
                      <span className="products-thumbnail-badge">Thumbnail</span>
                    )}
                    {thumbnailIndex !== index && (
                      <button
                        type="button"
                        onClick={() => handleSetThumbnail(index)}
                        className="products-set-thumbnail-button"
                      >
                        Set as Thumbnail
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveProductImage(index)}
                      className="products-remove-image-button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="products-add-image-button">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAddProductImage}
                  id="add-product-image"
                  style={{ display: 'none' }}
                />
                <label htmlFor="add-product-image" className="products-add-image-label">
                  <span className="products-add-icon">+</span>
                  <span>Add Image</span>
                </label>
              </div>
            </div>
            <p className="products-form-hint">
              {newProductImages.length === 0 
                ? 'Add at least one image. The first image will be set as thumbnail by default.' 
                : newProductImages.length === 1 
                ? 'This image will be used as the thumbnail.' 
                : `${newProductImages.length} images added. Click "Set as Thumbnail" to change the main image.`}
            </p>
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
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentProducts.map((product, index) => (
                <React.Fragment key={product._id}>
                  <tr className={`products-table-row ${product.productStatus === 'discontinued' ? 'products-discontinued' : ''}`}>
                    <td>{startIndex + index + 1}</td>
                    <td>
                      {editingProductId === product._id ? (
                        <input
                          type="text"
                          value={editFormData.productName}
                          onChange={(e) => handleEditFieldChange(e, 'productName')}
                          className="products-form-input"
                          aria-label="Product name"
                          required
                        />
                      ) : (
                        product.productName || 'N/A'
                      )}
                    </td>
                    <td>
                      {editingProductId === product._id ? (
                        <select
                          value={editFormData.categoryId}
                          onChange={(e) => handleEditFieldChange(e, 'categoryId')}
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
                        getCategoryName(product.categoryId)
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
                    <td className={`products-status-${product.productStatus?.toLowerCase() || 'unknown'}`}>
                      {editingProductId === product._id ? (
                        <select
                          value={editFormData.productStatus}
                          onChange={(e) => handleEditFieldChange(e, 'productStatus')}
                          className="products-field-select"
                          aria-label="Product status"
                        >
                          {statusOptions.filter(s => s !== 'discontinued').map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        <>
                          {product.productStatus || 'N/A'}
                          {product.productStatus === 'discontinued' && (
                            <span className="products-deleted-badge"> (Deleted)</span>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {editingProductId === product._id ? (
                        <div className="products-action-buttons">
                          <button
                            onClick={() => handleUpdateSubmit(product._id)}
                            className="products-update-button"
                            aria-label={`Update product ${product._id}`}
                            disabled={loading || !editFormData.productName || !editFormData.categoryId}
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
                            disabled={product.productStatus === 'discontinued'}
                          >
                            {selectedProductId === product._id ? 'Hide Details' : 'View Details'}
                          </button>
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="products-edit-button"
                            aria-label={`Edit product ${product._id}`}
                            disabled={product.productStatus === 'discontinued'}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteProduct(product._id)}
                            className="products-delete-button"
                            aria-label={`Delete product ${product._id}`}
                            disabled={product.productStatus === 'discontinued'}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {selectedProductId === product._id && (
                    <tr className="products-details-row">
                      <td colSpan="6">
                        <div className="products-details-section">
                          <h2 className="products-details-title">Product Details & Variants</h2>
                          <div className="products-detail-info">
                            <p><strong>Product Name:</strong> {product.productName}</p>
                            <p><strong>Category:</strong> {getCategoryName(product.categoryId)}</p>
                            <p><strong>Description:</strong> {product.description || 'No description available'}</p>
                            <p><strong>Status:</strong> {product.productStatus}</p>
                          </div>
                          
                          <h3 className="products-variants-title">Product Variants</h3>
                          {productVariants[product._id] ? (
                            productVariants[product._id].length > 0 ? (
                              <div className="products-variants-container">
                                <table className="products-variants-table">
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th>Image</th>
                                      <th>Color</th>
                                      <th>Size</th>
                                      <th>Price</th>
                                      <th>Stock</th>
                                      <th>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {productVariants[product._id].map((variant, vIndex) => (
                                      <tr key={variant._id}>
                                        <td>{vIndex + 1}</td>
                                        <td>
                                          {variant.variantImage ? (
                                            <img 
                                              src={variant.variantImage} 
                                              alt={`Variant ${vIndex + 1}`} 
                                              className="products-variant-image"
                                            />
                                          ) : 'N/A'}
                                        </td>
                                        <td>{variant.productColorId?.color_name || 'N/A'}</td>
                                        <td>{variant.productSizeId?.size_name || 'N/A'}</td>
                                        <td>{formatPrice(variant.variantPrice)}</td>
                                        <td>{variant.stockQuantity}</td>
                                        <td>{variant.variantStatus}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="products-no-variants">No variants available for this product. Add variants to activate this product.</p>
                            )
                          ) : (
                            <p className="products-loading-variants">Loading variants...</p>
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
