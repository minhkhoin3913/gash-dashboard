import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "../styles/ProductVariants.css";
import axios from "axios";

// API client with interceptors
const apiClient = axios.create({
  baseURL: (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/$/, ''),
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

// API functions with retry logic
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
  
  // Edit form data for variant
  const [editFormData, setEditFormData] = useState({
    productId: "",
    productColorId: "",
    productSizeId: "",
    variantImage: "",
    variantPrice: "",
    stockQuantity: "",
    variantStatus: "",
  });
  
  const [editVariantImageFile, setEditVariantImageFile] = useState(null);
  const [editVariantImagePreview, setEditVariantImagePreview] = useState("");
  
  // Filter states
  const [filters, setFilters] = useState({
    searchQuery: '',
    productFilter: '',
    colorFilter: '',
    sizeFilter: '',
    statusFilter: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(20);
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  // Status options based on model
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
        
        if (!productName.includes(query) && 
            !colorName.includes(query) && 
            !sizeName.includes(query) && 
            !variantId.includes(query)) {
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
    setCurrentPage(1);
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

  // Fetch variants using NEW API
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
      console.log('Fetched new variants:', response);
      const variantsData = response.data || response;
      setVariants(Array.isArray(variantsData) ? variantsData : []);
    } catch (err) {
      setError(err.message || "Failed to load variants");
      console.error("Fetch variants error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

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
      statusFilter: '',
    });
  }, []);

  // Toggle filter visibility
  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  // Fetch products using NEW API
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await fetchWithRetry("/new-products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched new products:', response);
      const productsData = response.data || response;
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
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await fetchWithRetry("/specifications/color", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setColors(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || "Failed to load colors");
      console.error("Fetch colors error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch sizes
  const fetchSizes = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await fetchWithRetry("/specifications/size", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSizes(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || "Failed to load sizes");
      console.error("Fetch sizes error:", err);
    } finally {
      setLoading(false);
    }
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


  // Handle variant image file change (edit variant)
  const handleEditVariantImageChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'File must be an image' });
        e.target.value = '';
        return;
      }
      setEditVariantImageFile(file);
      setEditVariantImagePreview(URL.createObjectURL(file));
    } else {
      setEditVariantImageFile(null);
      setEditVariantImagePreview('');
    }
  }, []);


  // Update variant using NEW API
  const updateVariant = useCallback(async (variantId) => {
    setLoading(true);
    setError("");
    setToast(null);

    // Validate form
    if (!editFormData.productId || !editFormData.productColorId || !editFormData.productSizeId) {
      setError("Product, color, and size are required");
      setLoading(false);
      return;
    }
    if (!editFormData.variantPrice || parseFloat(editFormData.variantPrice) < 0) {
      setError("Valid price is required");
      setLoading(false);
      return;
    }
    if (!editFormData.stockQuantity || parseInt(editFormData.stockQuantity) < 0) {
      setError("Valid stock quantity is required");
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");
      
      let variantImageUrl = editFormData.variantImage;
      
      // Upload new image if selected
      if (editVariantImageFile) {
        variantImageUrl = await uploadSingleImage(editVariantImageFile);
        if (!variantImageUrl) {
          throw new Error('Image upload failed');
        }
      }

      const response = await apiClient.put(`/new-variants/${variantId}`, {
        ...editFormData,
        variantImage: variantImageUrl,
        variantPrice: parseFloat(editFormData.variantPrice),
        stockQuantity: parseInt(editFormData.stockQuantity),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Variant updated:', response.data);
      
      // Fetch the updated variant with populated data
      const populatedResponse = await fetchWithRetry(`/new-variants/${variantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const populatedVariant = populatedResponse.data || populatedResponse;
      
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
        variantStatus: "",
      });
      setEditVariantImageFile(null);
      setEditVariantImagePreview("");
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update variant';
      setError(errorMessage);
      setToast({ type: "error", message: errorMessage });
      console.error("Update variant error:", err);
    } finally {
      setLoading(false);
    }
  }, [editFormData, editVariantImageFile, uploadSingleImage]);

  // Delete variant (soft delete) using NEW API
  const deleteVariant = useCallback(async (variantId) => {
      if (!window.confirm("Are you sure you want to delete this variant? This action will mark it as discontinued."))
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
        
        console.log('Variant deleted:', variantId);
        
        // Update the variant status to discontinued instead of removing it
        setVariants((prev) =>
          prev.map(variant => 
            variant._id === variantId 
              ? { ...variant, variantStatus: 'discontinued' }
              : variant
          )
        );
        
        setToast({ type: "success", message: "Variant marked as discontinued successfully" });
        if (editingVariantId === variantId) setEditingVariantId(null);
      } catch (err) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to delete variant';
        setError(errorMessage);
        setToast({ type: "error", message: errorMessage });
        console.error("Delete variant error:", err);
      } finally {
        setLoading(false);
      }
    },
    [editingVariantId]
  );

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
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
    setEditingVariantId(variant._id);
    setEditFormData({
      productId: variant.productId?._id || variant.productId || "",
      productColorId: variant.productColorId?._id || variant.productColorId || "",
      productSizeId: variant.productSizeId?._id || variant.productSizeId || "",
      variantImage: variant.variantImage || "",
      variantPrice: variant.variantPrice?.toString() || "",
      stockQuantity: variant.stockQuantity?.toString() || "",
      variantStatus: variant.variantStatus || "active",
    });
    setEditVariantImageFile(null);
    setEditVariantImagePreview("");
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
      variantStatus: "",
    });
    setEditVariantImageFile(null);
    setEditVariantImagePreview("");
  }, []);

  // Handle field change for edit form
  const handleEditFieldChange = useCallback((field, value) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }));
  }, []);


  // Submit edit form
  const handleEditSubmit = useCallback(() => {
    updateVariant(editingVariantId);
  }, [editingVariantId, updateVariant]);

  // Retry fetching variants
  const handleRetry = useCallback(() => {
    fetchVariants();
  }, [fetchVariants]);

  // Format price
  const formatPrice = useCallback((price) => {
    if (typeof price !== 'number' || isNaN(price)) return 'N/A';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  }, []);

  // Get status badge class
  const getStatusBadgeClass = useCallback((status) => {
    switch(status) {
      case 'active': return 'variant-status-active';
      case 'inactive': return 'variant-status-inactive';
      case 'discontinued': return 'variant-status-discontinued';
      default: return 'variant-status-unknown';
    }
  }, []);

  // Check if variant is discontinued
  const isVariantDiscontinued = useCallback((variant) => {
    return variant.variantStatus === 'discontinued';
  }, []);

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="product-variants-container">
        <div className="product-variants-loading" role="status" aria-live="true">
          <div className="product-variants-loading-spinner"></div>
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
          className={`product-variants-toast ${
            toast.type === "success"
              ? "product-variants-toast-success"
              : toast.type === "error"
              ? "product-variants-toast-error"
              : "product-variants-toast-info"
          }`}
          role="alert"
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
        </div>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="product-variants-filters">
          <h2 className="product-variants-search-title">Search Product Variants</h2>
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
                  placeholder="Search by product name, color, size..."
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
                    <option key={status} value={status}>{status}</option>
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

      {/* Error Display */}
      {error && (
        <div className="product-variants-error" role="alert" aria-live="true">
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
        <div className="product-variants-loading" role="status" aria-live="true">
          <div className="product-variants-loading-spinner"></div>
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
                <th>Price</th>
                <th>Stock</th>
                <th>Image</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentVariants.map((variant, index) => {
                const discontinued = isVariantDiscontinued(variant);
                return (
                  <tr key={variant._id} className={`product-variants-table-row ${discontinued ? 'discontinued-row' : ''}`}>
                    <td>{startIndex + index + 1}</td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <select
                          value={editFormData.productId}
                          onChange={(e) =>
                            handleEditFieldChange("productId", e.target.value)
                          }
                          className="product-variants-edit-select"
                          aria-label="Product"
                        >
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
                          onChange={(e) =>
                            handleEditFieldChange("productColorId", e.target.value)
                          }
                          className="product-variants-edit-select"
                          aria-label="Color"
                        >
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
                          onChange={(e) =>
                            handleEditFieldChange("productSizeId", e.target.value)
                          }
                          className="product-variants-edit-select"
                          aria-label="Size"
                        >
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
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editFormData.variantPrice}
                          onChange={(e) => handleEditFieldChange("variantPrice", e.target.value)}
                          className="product-variants-edit-input"
                        />
                      ) : (
                        formatPrice(variant.variantPrice)
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <input
                          type="number"
                          min="0"
                          value={editFormData.stockQuantity}
                          onChange={(e) => handleEditFieldChange("stockQuantity", e.target.value)}
                          className="product-variants-edit-input"
                        />
                      ) : (
                        variant.stockQuantity || 0
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <div className="product-variants-edit-image">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleEditVariantImageChange}
                            className="product-variants-file-input"
                            style={{ display: 'none' }}
                            id={`edit-variant-image-${variant._id}`}
                          />
                          <button
                            type="button"
                            className="product-variants-change-image-button"
                            onClick={() => document.getElementById(`edit-variant-image-${variant._id}`).click()}
                          >
                            Change Image
                          </button>
                          {editVariantImagePreview ? (
                            <img
                              src={editVariantImagePreview}
                              alt="New variant"
                              className="variant-image"
                            />
                          ) : editFormData.variantImage ? (
                            <img
                              src={editFormData.variantImage}
                              alt="Current variant"
                              className="variant-image"
                            />
                          ) : 'N/A'}
                        </div>
                      ) : variant.variantImage ? (
                        <img
                          src={variant.variantImage}
                          alt="Product variant"
                          className="variant-image"
                        />
                      ) : (
                        "N/A"
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <select
                          value={editFormData.variantStatus}
                          onChange={(e) => handleEditFieldChange("variantStatus", e.target.value)}
                          className="product-variants-edit-select"
                        >
                          <option value="active">active</option>
                          <option value="inactive">inactive</option>
                        </select>
                      ) : (
                        <span className={getStatusBadgeClass(variant.variantStatus)}>
                          {discontinued ? 'Deleted' : variant.variantStatus || 'N/A'}
                        </span>
                      )}
                    </td>
                    <td>
                      {editingVariantId === variant._id ? (
                        <div className="product-variants-action-buttons">
                          <button
                            onClick={handleEditSubmit}
                            className="product-variants-update-button"
                            aria-label={`Update variant ${variant._id}`}
                            disabled={loading}
                          >
                            Update
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="product-variants-cancel-button"
                            aria-label={`Cancel editing variant ${variant._id}`}
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
                            aria-label={`Edit variant ${variant._id}`}
                            disabled={discontinued}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteVariant(variant._id)}
                            className="product-variants-delete-button"
                            aria-label={`Delete variant ${variant._id}`}
                            disabled={discontinued}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
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
