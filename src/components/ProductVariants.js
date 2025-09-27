import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "../styles/ProductVariants.css";
import axios from "axios";

// API client with interceptors
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000",
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
  const [images, setImages] = useState([]);
  const [editingVariantId, setEditingVariantId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    pro_id: "",
    color_id: "",
    size_id: "",
    image_id: "",
  });
  const [newVariantForm, setNewVariantForm] = useState({
    pro_id: "",
    color_id: "",
    size_id: "",
    image_id: "",
  });
  
  // Filter states
  const [filters, setFilters] = useState({
    searchQuery: '',
    productFilter: '',
    colorFilter: '',
    sizeFilter: '',
    imageFilter: ''
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

  // Apply filters to variants
  const applyFilters = useCallback((variantsList, filterSettings) => {
    return variantsList.filter(variant => {
      // Search query filter
      if (filterSettings.searchQuery) {
        const query = filterSettings.searchQuery.toLowerCase();
        const productName = variant.pro_id?.pro_name?.toLowerCase() || '';
        const colorName = variant.color_id?.color_name?.toLowerCase() || '';
        const sizeName = variant.size_id?.size_name?.toLowerCase() || '';
        const variantId = variant._id?.toLowerCase() || '';
        
        if (!productName.includes(query) && 
            !colorName.includes(query) && 
            !sizeName.includes(query) && 
            !variantId.includes(query)) {
          return false;
        }
      }

      // Product filter
      if (filterSettings.productFilter && variant.pro_id?._id !== filterSettings.productFilter) {
        return false;
      }

      // Color filter
      if (filterSettings.colorFilter && variant.color_id?._id !== filterSettings.colorFilter) {
        return false;
      }

      // Size filter
      if (filterSettings.sizeFilter && variant.size_id?._id !== filterSettings.sizeFilter) {
        return false;
      }

      // Image filter
      if (filterSettings.imageFilter) {
        if (filterSettings.imageFilter === 'with_image' && !variant.image_id) {
          return false;
        }
        if (filterSettings.imageFilter === 'without_image' && variant.image_id) {
          return false;
        }
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
           filters.imageFilter;
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

      const response = await fetchWithRetry("/variants", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVariants(Array.isArray(response) ? response : []);
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
      imageFilter: ''
    });
  }, []);

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

      const response = await fetchWithRetry("/products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(Array.isArray(response) ? response : []);
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

  // Fetch images
  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await fetchWithRetry("/specifications/image", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setImages(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || "Failed to load images");
      console.error("Fetch images error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create variant
  const createVariant = useCallback(async () => {
    setLoading(true);
    setError("");
    setToast(null);

    if (
      !newVariantForm.pro_id ||
      !newVariantForm.color_id ||
      !newVariantForm.size_id
    ) {
      setError("Product, color, and size are required");
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await apiClient.post("/variants", newVariantForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Fetch the newly created variant with populated data
      const populatedVariant = await fetchWithRetry(`/variants/${response.data.variant._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setVariants((prev) => [...prev, populatedVariant]);
      setToast({ type: "success", message: "Variant created successfully" });
      setNewVariantForm({
        pro_id: "",
        color_id: "",
        size_id: "",
        image_id: "",
      });
      setShowAddForm(false);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create variant");
      setToast({
        type: "error",
        message: err.response?.data?.message || "Failed to create variant",
      });
      console.error("Create variant error:", err);
    } finally {
      setLoading(false);
    }
  }, [newVariantForm]);

  // Update variant
  const updateVariant = useCallback(async (variantId, updatedData) => {
    setLoading(true);
    setError("");
    setToast(null);

    if (!updatedData.pro_id || !updatedData.color_id || !updatedData.size_id) {
      setError("Product, color, and size are required");
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      await apiClient.put(
        `/variants/${variantId}`,
        updatedData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      // Fetch the updated variant with populated data
      const populatedVariant = await fetchWithRetry(`/variants/${variantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setVariants((prev) =>
        prev.map((variant) =>
          variant._id === variantId ? populatedVariant : variant
        )
      );
      setToast({ type: "success", message: "Variant updated successfully" });
      setEditingVariantId(null);
      setEditFormData({
        pro_id: "",
        color_id: "",
        size_id: "",
        image_id: "",
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update variant");
      setToast({
        type: "error",
        message: err.response?.data?.message || "Failed to update variant",
      });
      console.error("Update variant error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete variant
  const deleteVariant = useCallback(
    async (variantId) => {
      if (!window.confirm("Are you sure you want to delete this variant?"))
        return;

      setLoading(true);
      setError("");
      setToast(null);

      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No authentication token found");

        await apiClient.delete(`/variants/${variantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setVariants((prev) =>
          prev.filter((variant) => variant._id !== variantId)
        );
        setToast({ type: "success", message: "Variant deleted successfully" });
        if (editingVariantId === variantId) setEditingVariantId(null);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to delete variant");
        setToast({
          type: "error",
          message: err.response?.data?.message || "Failed to delete variant",
        });
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
      fetchImages();
    }
  }, [
    user,
    isAuthLoading,
    navigate,
    fetchVariants,
    fetchProducts,
    fetchColors,
    fetchSizes,
    fetchImages,
  ]);

  // Start editing variant
  const handleEditVariant = useCallback((variant) => {
    setEditingVariantId(variant._id);
    setEditFormData({
      pro_id: variant.pro_id?._id || variant.pro_id || "",
      color_id: variant.color_id?._id || variant.color_id || "",
      size_id: variant.size_id?._id || variant.size_id || "",
      image_id: variant.image_id?._id || variant.image_id || "",
    });
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingVariantId(null);
    setEditFormData({
      pro_id: "",
      color_id: "",
      size_id: "",
      image_id: "",
    });
  }, []);

  // Handle field change for edit form
  const handleEditFieldChange = useCallback((field, value) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Handle field change for new variant form
  const handleNewVariantFieldChange = useCallback((field, value) => {
    setNewVariantForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Submit edit form
  const handleEditSubmit = useCallback(() => {
    updateVariant(editingVariantId, editFormData);
  }, [editingVariantId, editFormData, updateVariant]);

  // Retry fetching variants
  const handleRetry = useCallback(() => {
    fetchVariants();
  }, [fetchVariants]);

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
          <button
            className="product-variants-add-button"
            onClick={() => setShowAddForm(!showAddForm)}
            aria-label="Add new variant"
          >
            {showAddForm ? "Cancel Add" : "Add Variant"}
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
                {product.pro_name}
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

              {/* Image Filter */}
              <div className="product-variants-filter-group">
                <label htmlFor="imageFilter" className="product-variants-filter-label">Image Status</label>
                <select
                  id="imageFilter"
                  value={filters.imageFilter}
                  onChange={(e) => handleFilterChange('imageFilter', e.target.value)}
                  className="product-variants-filter-select"
                >
                  <option value="">All Variants</option>
                  <option value="with_image">With Image</option>
                  <option value="without_image">Without Image</option>
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

      {/* Add New Variant Form */}
      {showAddForm && (
        <div className="product-variants-add-form">
          <h2 className="product-variants-add-title">Add New Variant</h2>
          <div className="product-variants-form-grid">
            <div className="product-variants-form-group">
              <label htmlFor="new-pro-id" className="product-variants-form-label">
                Product *
              </label>
            <select
              id="new-pro-id"
              value={newVariantForm.pro_id}
                onChange={(e) =>
                  handleNewVariantFieldChange("pro_id", e.target.value)
                }
                className="product-variants-form-select"
              required
            >
              <option value="">Select Product</option>
              {products.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.pro_name}
                </option>
              ))}
            </select>
          </div>

            <div className="product-variants-form-group">
              <label htmlFor="new-color-id" className="product-variants-form-label">
                Color *
              </label>
            <select
              id="new-color-id"
              value={newVariantForm.color_id}
                onChange={(e) =>
                  handleNewVariantFieldChange("color_id", e.target.value)
                }
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
              <label htmlFor="new-size-id" className="product-variants-form-label">
                Size *
              </label>
            <select
              id="new-size-id"
              value={newVariantForm.size_id}
                onChange={(e) =>
                  handleNewVariantFieldChange("size_id", e.target.value)
                }
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
              <label htmlFor="new-image-id" className="product-variants-form-label">
                Image
              </label>
            <select
              id="new-image-id"
              value={newVariantForm.image_id}
                onChange={(e) =>
                  handleNewVariantFieldChange("image_id", e.target.value)
                }
                className="product-variants-form-select"
            >
              <option value="">Select Image (Optional)</option>
              {images.map((image) => (
                <option key={image._id} value={image._id}>
                    {image.imageURL}
                </option>
              ))}
            </select>
          </div>
          </div>

          <div className="product-variants-form-actions">
            <button
              onClick={createVariant}
              className="product-variants-submit-button"
              disabled={loading}
              aria-label="Create variant"
            >
              Create Variant
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="product-variants-cancel-button"
              disabled={loading}
              aria-label="Cancel adding variant"
            >
              Cancel
            </button>
          </div>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentVariants.map((variant, index) => (
                <tr key={variant._id} className="product-variants-table-row">
                  <td>{startIndex + index + 1}</td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <select
                        value={editFormData.pro_id}
                        onChange={(e) =>
                          handleEditFieldChange("pro_id", e.target.value)
                        }
                        className="product-variants-edit-select"
                        aria-label="Product"
                      >
                        {products.map((product) => (
                          <option key={product._id} value={product._id}>
                            {product.pro_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      variant.pro_id?.pro_name || "N/A"
                    )}
                  </td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <select
                        value={editFormData.color_id}
                        onChange={(e) =>
                          handleEditFieldChange("color_id", e.target.value)
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
                      variant.color_id?.color_name || "N/A"
                    )}
                  </td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <select
                        value={editFormData.size_id}
                        onChange={(e) =>
                          handleEditFieldChange("size_id", e.target.value)
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
                      variant.size_id?.size_name || "N/A"
                    )}
                  </td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <select
                        value={editFormData.image_id}
                        onChange={(e) =>
                          handleEditFieldChange("image_id", e.target.value)
                        }
                        className="product-variants-edit-select"
                        aria-label="Image"
                      >
                        <option value="">No Image</option>
                        {images.map((image) => (
                          <option key={image._id} value={image._id}>
                            {image.imageURL}
                          </option>
                        ))}
                      </select>
                    ) : variant.image_id?.imageURL ? (
                      <img
                        src={variant.image_id.imageURL}
                        alt="Product variant"
                        className="product-variants-image"
                      />
                    ) : (
                      "No Image"
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
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteVariant(variant._id)}
                          className="product-variants-delete-button"
                          aria-label={`Delete variant ${variant._id}`}
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