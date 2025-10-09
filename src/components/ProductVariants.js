import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "../styles/ProductVariants.css";
import axios from "axios";

// API client with interceptors
const apiClient = axios.create({
  baseURL: (process.env.REACT_APP_API_URL || "http://localhost:5000").replace(/\/$/, ""),
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message =
      status === 401
        ? "Unauthorized access - please log in"
        : status === 404
        ? "Resource not found"
        : status >= 500
        ? "Server error - please try again later"
        : "Network error - please check your connection";
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
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, i))
      );
    }
  }
};

const ProductVariants = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [variants, setVariants] = useState([]);
  const [filteredVariants, setFilteredVariants] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [editingVariantId, setEditingVariantId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    productId: "",
    productColorId: "",
    productSizeId: "",
    variantImage: "",
    variantPrice: "",
    stockQuantity: "",
    variantStatus: "active",
  });
  const [newVariantForm, setNewVariantForm] = useState({
    productId: "",
    productColorId: "",
    productSizeId: "",
    variantImage: "",
    variantPrice: "",
    stockQuantity: "",
    variantStatus: "active",
  });
  const [newVariantImageFile, setNewVariantImageFile] = useState(null);
  const [newVariantImagePreview, setNewVariantImagePreview] = useState('');
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState('');
  
  // Filter states
  const [filters, setFilters] = useState({
    searchQuery: '',
    productFilter: '',
    colorFilter: '',
    sizeFilter: '',
    statusFilter: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(20);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  // Status options
  const statusOptions = ['active', 'inactive', 'discontinued'];

  // Apply filters to variants
  const applyFilters = useCallback((variantsList, filterSettings) => {
    return variantsList.filter(variant => {
      // Search query filter
      if (filterSettings.searchQuery) {
        const query = filterSettings.searchQuery.toLowerCase();
        const productName = variant.productId?.productName?.toLowerCase() || '';
        const colorName = variant.productColorId?.color_name?.toLowerCase() || '';
        const sizeName = variant.productSizeId?.size_name?.toLowerCase() || '';
        const variantId = variant._id?.toLowerCase() || '';
        const price = variant.variantPrice?.toString() || '';
        const stock = variant.stockQuantity?.toString() || '';
        
        if (!productName.includes(query) && 
            !colorName.includes(query) && 
            !sizeName.includes(query) && 
            !variantId.includes(query) &&
            !price.includes(query) &&
            !stock.includes(query)) {
          return false;
        }
      }

      // Product filter
      if (filterSettings.productFilter && variant.productId?._id !== filterSettings.productFilter) {
        return false;
      }

      // Color filter
      if (filterSettings.colorFilter && variant.productColorId?._id !== filterSettings.colorFilter) {
        return false;
      }

      // Size filter
      if (filterSettings.sizeFilter && variant.productSizeId?._id !== filterSettings.sizeFilter) {
        return false;
      }

      // Status filter
      if (filterSettings.statusFilter && variant.variantStatus !== filterSettings.statusFilter) {
        return false;
      }

      return true;
    });
  }, []);

  // Update filtered variants when variants or filters change
  useEffect(() => {
    setFilteredVariants(applyFilters(variants, filters));
    setCurrentPage(1); // Reset to first page when filters change
  }, [variants, filters, applyFilters]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredVariants.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentVariants = filteredVariants.slice(startIndex, endIndex);

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
           filters.productFilter || 
           filters.colorFilter || 
           filters.sizeFilter ||
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

  // Fetch variants
  const fetchVariants = useCallback(async () => {
    if (!user?._id) {
      setError("User not authenticated");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await fetchWithRetry("/new-variants", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const variantsData = response.success ? response.data : response;
      setVariants(Array.isArray(variantsData) ? variantsData : []);
    } catch (err) {
      setError(err.message || "Failed to load variants");
      console.error("Fetch variants error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Toggle filter visibility
  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await fetchWithRetry("/new-products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const productsData = response.success ? response.data : response;
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      setError(err.message || "Failed to load products");
      console.error("Fetch products error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch colors
  const fetchColors = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");
      const response = await fetchWithRetry("/specifications/color", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setColors(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error("Fetch colors error:", err);
    }
  }, []);

  // Fetch sizes
  const fetchSizes = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");
      const response = await fetchWithRetry("/specifications/size", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSizes(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error("Fetch sizes error:", err);
    }
  }, []);

  // Handle filter changes
  const handleFilterChange = useCallback((field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      productFilter: '',
      colorFilter: '',
      sizeFilter: '',
      statusFilter: ''
    });
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
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'Please select a valid image file' });
        e.target.value = '';
        return;
      }
      setNewVariantImageFile(file);
      setNewVariantImagePreview(URL.createObjectURL(file));
    } else {
      setNewVariantImageFile(null);
      setNewVariantImagePreview('');
    }
  }, []);

  // Handle file selection (Edit form)
  const handleEditImageFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'Please select a valid image file' });
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

  // Create variant
  const createVariant = useCallback(async () => {
    setLoading(true);
    setError("");
    setToast(null);

    // Validate form
    if (!newVariantForm.productId || !newVariantForm.productColorId || !newVariantForm.productSizeId) {
      setError('Product, color, and size are required');
      setLoading(false);
      return;
    }
    if (!newVariantForm.variantPrice || isNaN(newVariantForm.variantPrice) || newVariantForm.variantPrice <= 0) {
      setError('Valid price is required');
      setLoading(false);
      return;
    }
    if (newVariantForm.stockQuantity === '' || isNaN(newVariantForm.stockQuantity) || newVariantForm.stockQuantity < 0) {
      setError('Valid stock quantity is required');
      setLoading(false);
      return;
    }
    if (!newVariantImageFile) {
      setError('Please upload a variant image');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      // Upload image first
      const imageURL = await uploadSingleImage(newVariantImageFile);
      if (!imageURL) {
        throw new Error('Image upload failed');
      }

      const response = await apiClient.post("/new-variants", {
        ...newVariantForm,
        variantImage: imageURL,
        variantPrice: parseFloat(newVariantForm.variantPrice),
        stockQuantity: parseInt(newVariantForm.stockQuantity),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const newVariant = response.data.success ? response.data.data : response.data;
      
      // Fetch the newly created variant with populated data
      const populatedVariantResponse = await fetchWithRetry(`/new-variants/${newVariant._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const populatedVariant = populatedVariantResponse.success ? populatedVariantResponse.data : populatedVariantResponse;
      
      setVariants((prev) => [...prev, populatedVariant]);
      setToast({ type: "success", message: "Variant created successfully" });
      setNewVariantForm({
        productId: "",
        productColorId: "",
        productSizeId: "",
        variantImage: "",
        variantPrice: "",
        stockQuantity: "",
        variantStatus: "active",
      });
      setNewVariantImageFile(null);
      setNewVariantImagePreview('');
      setShowAddForm(false);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to create variant");
      setToast({
        type: "error",
        message: err.response?.data?.message || err.message || "Failed to create variant",
      });
      console.error("Create variant error:", err);
    } finally {
      setLoading(false);
    }
  }, [newVariantForm, newVariantImageFile, uploadSingleImage]);

  // Update variant
  const updateVariant = useCallback(async (variantId) => {
    setLoading(true);
    setError("");
    setToast(null);

    // Validate form
    if (!editFormData.productId || !editFormData.productColorId || !editFormData.productSizeId) {
      setError('Product, color, and size are required');
      setLoading(false);
      return;
    }
    if (!editFormData.variantPrice || isNaN(editFormData.variantPrice) || editFormData.variantPrice <= 0) {
      setError('Valid price is required');
      setLoading(false);
      return;
    }
    if (editFormData.stockQuantity === '' || isNaN(editFormData.stockQuantity) || editFormData.stockQuantity < 0) {
      setError('Valid stock quantity is required');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      let imageURLToUse = editFormData.variantImage;
      if (editImageFile) {
        imageURLToUse = await uploadSingleImage(editImageFile);
        if (!imageURLToUse) {
          throw new Error('Image upload failed');
        }
      }

      await apiClient.put(
        `/new-variants/${variantId}`,
        {
          ...editFormData,
          variantImage: imageURLToUse,
          variantPrice: parseFloat(editFormData.variantPrice),
          stockQuantity: parseInt(editFormData.stockQuantity),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      // Fetch the updated variant with populated data
      const populatedVariantResponse = await fetchWithRetry(`/new-variants/${variantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const populatedVariant = populatedVariantResponse.success ? populatedVariantResponse.data : populatedVariantResponse;
      
      setVariants((prev) =>
        prev.map((variant) =>
          variant._id === variantId ? populatedVariant : variant
        )
      );
      setToast({ type: "success", message: "Variant updated successfully" });
      setEditingVariantId(null);
      setEditFormData({
        productId: "",
        productColorId: "",
        productSizeId: "",
        variantImage: "",
        variantPrice: "",
        stockQuantity: "",
        variantStatus: "active",
      });
      setEditImageFile(null);
      setEditImagePreview('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to update variant");
      setToast({
        type: "error",
        message: err.response?.data?.message || err.message || "Failed to update variant",
      });
      console.error("Update variant error:", err);
    } finally {
      setLoading(false);
    }
  }, [editFormData, editImageFile, uploadSingleImage]);

  // Delete variant
  const deleteVariant = useCallback(async (variantId) => {
    if (!window.confirm("Are you sure you want to delete this variant?"))
      return;

    setLoading(true);
    setError("");
    setToast(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      await apiClient.delete(`/new-variants/${variantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVariants((prev) =>
        prev.filter((variant) => variant._id !== variantId)
      );
      setToast({ type: "success", message: "Variant deleted successfully" });
      if (editingVariantId === variantId) setEditingVariantId(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to delete variant");
      setToast({
        type: "error",
        message: err.response?.data?.message || err.message || "Failed to delete variant",
      });
      console.error("Delete variant error:", err);
    } finally {
      setLoading(false);
    }
  }, [editingVariantId]);

  // Handle authentication state and fetch data
  useEffect(() => {
    if (isAuthLoading) {
      return;
    }
    if (!user && !localStorage.getItem("token")) {
      navigate("/login", { replace: true });
    } else if (user) {
      fetchVariants();
      fetchProducts();
      fetchColors();
      fetchSizes();
    }
  }, [
    user,
    isAuthLoading,
    navigate,
    fetchVariants,
    fetchProducts,
    fetchColors,
    fetchSizes,
  ]);

  // Start editing variant
  const handleEditVariant = useCallback((variant) => {
    if (variant.variantStatus === 'discontinued') {
      setToast({ type: 'error', message: 'Cannot edit discontinued variants' });
      return;
    }
    setEditingVariantId(variant._id);
    setEditFormData({
      productId: variant.productId?._id || variant.productId || "",
      productColorId: variant.productColorId?._id || variant.productColorId || "",
      productSizeId: variant.productSizeId?._id || variant.productSizeId || "",
      variantImage: variant.variantImage || "",
      variantPrice: variant.variantPrice ? variant.variantPrice.toString() : "",
      stockQuantity: variant.stockQuantity !== undefined ? variant.stockQuantity.toString() : "",
      variantStatus: variant.variantStatus || "active",
    });
    setEditImageFile(null);
    setEditImagePreview('');
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingVariantId(null);
    setEditFormData({
      productId: "",
      productColorId: "",
      productSizeId: "",
      variantImage: "",
      variantPrice: "",
      stockQuantity: "",
      variantStatus: "active",
    });
    setEditImageFile(null);
    setEditImagePreview('');
  }, []);

  // Handle field change for edit form
  const handleEditFieldChange = useCallback((e, field) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Handle field change for new variant form
  const handleNewVariantFieldChange = useCallback((e, field) => {
    setNewVariantForm(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Submit updated fields
  const handleUpdateSubmit = useCallback((variantId) => {
    updateVariant(variantId);
  }, [updateVariant]);

  // Submit new variant
  const handleCreateSubmit = useCallback(() => {
    createVariant();
  }, [createVariant]);

  // Toggle add variant form
  const toggleAddForm = useCallback(() => {
    setShowAddForm(prev => !prev);
    setNewVariantForm({
      productId: "",
      productColorId: "",
      productSizeId: "",
      variantImage: "",
      variantPrice: "",
      stockQuantity: "",
      variantStatus: "active",
    });
    setNewVariantImageFile(null);
    setNewVariantImagePreview('');
    setError('');
  }, []);

  // Retry fetching variants
  const handleRetry = useCallback(() => {
    fetchVariants();
  }, [fetchVariants]);

  // Format price
  const formatPrice = useCallback((price) => {
    if (typeof price !== 'number' || isNaN(price)) return 'N/A';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  }, []);

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="product-variants-container">
        <div className="product-variants-loading" role="status" aria-live="polite">
          <div className="product-variants-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="product-variants-container">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`product-variants-toast ${toast.type === 'success' ? 'product-variants-toast-success' : 'product-variants-toast-error'}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <div className="product-variants-header">
        <h1 className="product-variants-title">Product Variants Management</h1>
        <div className="product-variants-header-actions">
          <button
            className="product-variants-filter-toggle"
            onClick={toggleFilters}
            aria-label="Toggle filters"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button
            onClick={toggleAddForm}
            className="product-variants-add-button"
            aria-label={showAddForm ? 'Cancel adding variant' : 'Add new variant'}
          >
            {showAddForm ? 'Cancel Add' : 'Add Variant'}
          </button>
        </div>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="product-variants-filters">
          <h2 className="product-variants-search-title">Search Variants</h2>
          <div className="product-variants-filters-grid">
            <div className="product-variants-search-section">
              {/* Search Query */}
              <div className="product-variants-filter-group">
                <label htmlFor="searchQuery" className="product-variants-filter-label">Search</label>
                <input
                  type="text"
                  id="searchQuery"
                  value={filters.searchQuery}
                  onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
                  placeholder="Search by product, color, size, price..."
                  className="product-variants-filter-input"
                />
              </div>
            </div>

            <div className="product-variants-filter-options">
              {/* Product Filter */}
              <div className="product-variants-filter-group">
                <label htmlFor="productFilter" className="product-variants-filter-label">Product</label>
                <select
                  id="productFilter"
                  value={filters.productFilter}
                  onChange={(e) => handleFilterChange('productFilter', e.target.value)}
                  className="product-variants-filter-select"
                >
                  <option value="">All Products</option>
                  {products.map(product => (
                    <option key={product._id} value={product._id}>
                      {product.productName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Color Filter */}
              <div className="product-variants-filter-group">
                <label htmlFor="colorFilter" className="product-variants-filter-label">Color</label>
                <select
                  id="colorFilter"
                  value={filters.colorFilter}
                  onChange={(e) => handleFilterChange('colorFilter', e.target.value)}
                  className="product-variants-filter-select"
                >
                  <option value="">All Colors</option>
                  {colors.map(color => (
                    <option key={color._id} value={color._id}>
                      {color.color_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Size Filter */}
              <div className="product-variants-filter-group">
                <label htmlFor="sizeFilter" className="product-variants-filter-label">Size</label>
                <select
                  id="sizeFilter"
                  value={filters.sizeFilter}
                  onChange={(e) => handleFilterChange('sizeFilter', e.target.value)}
                  className="product-variants-filter-select"
                >
                  <option value="">All Sizes</option>
                  {sizes.map(size => (
                    <option key={size._id} value={size._id}>
                      {size.size_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="product-variants-filter-group">
                <label htmlFor="statusFilter" className="product-variants-filter-label">Status</label>
                <select
                  id="statusFilter"
                  value={filters.statusFilter}
                  onChange={(e) => handleFilterChange('statusFilter', e.target.value)}
                  className="product-variants-filter-select"
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

          <div className="product-variants-filter-actions">
            <button
              className="product-variants-clear-filters"
              onClick={clearFilters}
              disabled={!hasActiveFilters()}
              aria-label="Clear all filters"
            >
              Clear Filters
            </button>
            <div className="product-variants-filter-summary">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredVariants.length)} of {filteredVariants.length} variants
            </div>
          </div>
        </div>
      )}

      {/* Add Variant Form */}
      {showAddForm && (
        <div className="product-variants-add-form">
          <h2 className="product-variants-form-title">Add New Variant</h2>
          <div className="product-variants-form-grid">
            <div className="product-variants-form-group">
              <label htmlFor="new-product-id" className="product-variants-form-label">Product *</label>
              <select
                id="new-product-id"
                value={newVariantForm.productId}
                onChange={(e) => handleNewVariantFieldChange(e, 'productId')}
                className="product-variants-form-select"
                required
              >
                <option value="">Select Product</option>
                {products.map((product) => (
                  <option key={product._id} value={product._id}>
                    {product.productName}
                  </option>
                ))}
              </select>
            </div>

            <div className="product-variants-form-group">
              <label htmlFor="new-color-id" className="product-variants-form-label">Color *</label>
              <select
                id="new-color-id"
                value={newVariantForm.productColorId}
                onChange={(e) => handleNewVariantFieldChange(e, 'productColorId')}
                className="product-variants-form-select"
                required
              >
                <option value="">Select Color</option>
                {colors.map((color) => (
                  <option key={color._id} value={color._id}>
                    {color.color_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="product-variants-form-group">
              <label htmlFor="new-size-id" className="product-variants-form-label">Size *</label>
              <select
                id="new-size-id"
                value={newVariantForm.productSizeId}
                onChange={(e) => handleNewVariantFieldChange(e, 'productSizeId')}
                className="product-variants-form-select"
                required
              >
                <option value="">Select Size</option>
                {sizes.map((size) => (
                  <option key={size._id} value={size._id}>
                    {size.size_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="product-variants-form-group">
              <label htmlFor="new-price" className="product-variants-form-label">Price *</label>
              <input
                id="new-price"
                type="number"
                step="0.01"
                value={newVariantForm.variantPrice}
                onChange={(e) => handleNewVariantFieldChange(e, 'variantPrice')}
                className="product-variants-form-input"
                required
              />
            </div>

            <div className="product-variants-form-group">
              <label htmlFor="new-quantity" className="product-variants-form-label">Stock Quantity *</label>
              <input
                id="new-quantity"
                type="number"
                value={newVariantForm.stockQuantity}
                onChange={(e) => handleNewVariantFieldChange(e, 'stockQuantity')}
                className="product-variants-form-input"
                required
              />
            </div>

            <div className="product-variants-form-group">
              <label htmlFor="new-status" className="product-variants-form-label">Status</label>
              <select
                id="new-status"
                value={newVariantForm.variantStatus}
                onChange={(e) => handleNewVariantFieldChange(e, 'variantStatus')}
                className="product-variants-form-select"
              >
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="product-variants-form-group product-variants-file-group">
              <label htmlFor="new-image-file" className="product-variants-form-label">Upload Image *</label>
              <div className="product-variants-file-input-wrapper">
                <input
                  id="new-image-file"
                  type="file"
                  accept="image/*"
                  onChange={handleNewImageFileChange}
                  aria-label="Upload variant image file"
                  className="product-variants-file-input-hidden"
                />
                <label htmlFor="new-image-file" className="product-variants-file-label">
                  <span className="product-variants-file-button">Choose File</span>
                  <span className="product-variants-file-text">
                    {newVariantImageFile ? newVariantImageFile.name : 'No file chosen'}
                  </span>
                </label>
              </div>
              {newVariantImagePreview && (
                <div className="product-variants-image-preview">
                  <img
                    src={newVariantImagePreview}
                    alt="Preview"
                    className="product-variants-image"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="product-variants-form-actions">
            <button
              onClick={handleCreateSubmit}
              className="product-variants-create-button"
              aria-label="Create variant"
              disabled={loading}
            >
              Create Variant
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="product-variants-error" role="alert" aria-live="assertive">
          <span className="product-variants-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="product-variants-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading variants"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="product-variants-loading" role="status" aria-live="polite">
          <div className="product-variants-progress-bar"></div>
          <p>Loading variants...</p>
        </div>
      )}

      {/* Variants Table */}
      {!loading && filteredVariants.length === 0 && !error ? (
        <div className="product-variants-empty" role="status">
          <p>{variants.length === 0 ? 'No variants found.' : 'No variants match the current filters.'}</p>
        </div>
      ) : (
        <div className="product-variants-table-container">
          <table className="product-variants-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Color</th>
                <th>Size</th>
                <th>Image</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentVariants.map((variant, index) => (
                <React.Fragment key={variant._id}>
                  <tr className={`product-variants-table-row ${variant.variantStatus === 'discontinued' ? 'product-variants-discontinued' : ''}`}>
                    <td>{startIndex + index + 1}</td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <select
                          value={editFormData.productId}
                          onChange={(e) => handleEditFieldChange(e, 'productId')}
                          className="product-variants-edit-select"
                        >
                          <option value="">Select Product</option>
                          {products.map((product) => (
                            <option key={product._id} value={product._id}>
                              {product.productName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        variant.productId?.productName || "N/A"
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <select
                          value={editFormData.productColorId}
                          onChange={(e) => handleEditFieldChange(e, 'productColorId')}
                          className="product-variants-edit-select"
                        >
                          <option value="">Select Color</option>
                          {colors.map((color) => (
                            <option key={color._id} value={color._id}>
                              {color.color_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        variant.productColorId?.color_name || "N/A"
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <select
                          value={editFormData.productSizeId}
                          onChange={(e) => handleEditFieldChange(e, 'productSizeId')}
                          className="product-variants-edit-select"
                        >
                          <option value="">Select Size</option>
                          {sizes.map((size) => (
                            <option key={size._id} value={size._id}>
                              {size.size_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        variant.productSizeId?.size_name || "N/A"
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <div className="product-variants-edit-image">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleEditImageFileChange}
                            aria-label="Upload new variant image"
                          />
                          {editImagePreview ? (
                            <div className="product-variants-image-preview">
                              <img
                                src={editImagePreview}
                                alt="New image preview"
                                className="product-variants-image"
                              />
                            </div>
                          ) : variant.variantImage ? (
                            <div className="product-variants-image-preview">
                              <img
                                src={variant.variantImage}
                                alt="Current image"
                                className="product-variants-image"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : variant.variantImage ? (
                        <img
                          src={variant.variantImage}
                          alt="Variant"
                          className="product-variants-image"
                          onError={(e) => {
                            e.target.alt = 'Image not available';
                            e.target.style.opacity = '0.5';
                          }}
                        />
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editFormData.variantPrice}
                          onChange={(e) => handleEditFieldChange(e, 'variantPrice')}
                          className="product-variants-form-input"
                        />
                      ) : (
                        formatPrice(variant.variantPrice)
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <input
                          type="number"
                          value={editFormData.stockQuantity}
                          onChange={(e) => handleEditFieldChange(e, 'stockQuantity')}
                          className="product-variants-form-input"
                        />
                      ) : (
                        variant.stockQuantity !== undefined ? variant.stockQuantity : 'N/A'
                      )}
                    </td>
                    <td className={`product-variants-status-${variant.variantStatus?.toLowerCase() || 'unknown'}`}>
                      {editingVariantId === variant._id ? (
                        <select
                          value={editFormData.variantStatus}
                          onChange={(e) => handleEditFieldChange(e, 'variantStatus')}
                          className="product-variants-edit-select"
                        >
                          {statusOptions.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        <>
                          {variant.variantStatus || 'N/A'}
                          {variant.variantStatus === 'discontinued' && (
                            <span className="product-variants-deleted-badge"> (Deleted)</span>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <div className="product-variants-action-buttons">
                          <button
                            onClick={() => handleUpdateSubmit(variant._id)}
                            className="product-variants-update-button"
                            disabled={loading}
                          >
                            Update
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="product-variants-cancel-button"
                            disabled={loading}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="product-variants-action-buttons">
                          <button
                            onClick={() => handleEditVariant(variant)}
                            className="product-variants-edit-button"
                            disabled={variant.variantStatus === 'discontinued'}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteVariant(variant._id)}
                            className="product-variants-delete-button"
                            disabled={variant.variantStatus === 'discontinued'}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filteredVariants.length > 0 && (
        <div className="product-variants-pagination">
          <div className="product-variants-pagination-info">
            Showing {startIndex + 1} to {Math.min(endIndex, filteredVariants.length)} of {filteredVariants.length} variants
          </div>
          <div className="product-variants-pagination-controls">
            <button
              className="product-variants-pagination-button"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              Previous
            </button>
            
            <div className="product-variants-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`product-variants-pagination-page ${currentPage === page ? 'active' : ''}`}
                  onClick={() => handlePageChange(page)}
                  aria-label={`Page ${page}`}
                >
                  {page}
                </button>
              ))}
            </div>
            
            <button
              className="product-variants-pagination-button"
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

export default ProductVariants;
