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
  const [searchParams, setSearchParams] = useState({
    pro_id: "",
    color_id: "",
    size_id: "",
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

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

  // Search variants
  const searchVariants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { pro_id, color_id, size_id } = searchParams;

      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const query = new URLSearchParams();
      if (pro_id) query.append("pro_id", pro_id);
      if (color_id) query.append("color_id", color_id);
      if (size_id) query.append("size_id", size_id);

      const url = `/variants${query.toString() ? `?${query.toString()}` : ""}`;
      console.log("Sending request to:", `${apiClient.defaults.baseURL}${url}`);
      const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVariants(Array.isArray(response) ? response : []);
      if (response.length === 0) {
        setToast({ type: "info", message: "No variants found for the given criteria" });
      }
    } catch (err) {
      setError(err.message || "Failed to search variants");
      console.error("Search variants error:", err);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

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
      setVariants((prev) => [...prev, response.data.variant]);
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

      const response = await apiClient.put(
        `/variants/${variantId}`,
        updatedData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setVariants((prev) =>
        prev.map((variant) =>
          variant._id === variantId ? response.data.variant : variant
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
  const handleEditFieldChange = useCallback((e, field) => {
    setEditFormData((prev) => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Handle field change for new variant form
  const handleNewVariantFieldChange = useCallback((e, field) => {
    setNewVariantForm((prev) => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Handle search field change
  const handleSearchFieldChange = useCallback((e, field) => {
    setSearchParams((prev) => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Submit updated fields
  const handleUpdateSubmit = useCallback(
    (variantId) => {
      updateVariant(variantId, editFormData);
    },
    [editFormData, updateVariant]
  );

  // Submit new variant
  const handleCreateSubmit = useCallback(() => {
    createVariant();
  }, [createVariant]);

  // Toggle add variant form
  const toggleAddForm = useCallback(() => {
    setShowAddForm((prev) => !prev);
    setNewVariantForm({
      pro_id: "",
      color_id: "",
      size_id: "",
      image_id: "",
    });
    setError("");
  }, []);

  // Clear search parameters
  const clearSearch = useCallback(() => {
    setSearchParams({ pro_id: "", color_id: "", size_id: "" });
    fetchVariants();
  }, [fetchVariants]);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchVariants();
    fetchProducts();
    fetchColors();
    fetchSizes();
    fetchImages();
  }, [fetchVariants, fetchProducts, fetchColors, fetchSizes, fetchImages]);

  // Get product name by ID
  const getProductName = useCallback(
    (proId) => {
      const product = products.find((p) => p._id === proId);
      return product?.pro_name || "N/A";
    },
    [products]
  );

  // Get color name by ID
  const getColorName = useCallback(
    (colorId) => {
      const color = colors.find((c) => c._id === colorId);
      return color?.color_name || "N/A";
    },
    [colors]
  );

  // Get size name by ID
  const getSizeName = useCallback(
    (sizeId) => {
      const size = sizes.find((s) => s._id === sizeId);
      return size?.size_name || "N/A";
    },
    [sizes]
  );

  // Get image URL by ID
  const getImageUrl = useCallback(
    (imageId) => {
      const image = images.find((i) => i._id === imageId);
      return image?.imageURL || "";
    },
    [images]
  );

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="variants-container">
        <div className="variants-loading" role="status" aria-live="polite">
          <div className="variants-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="variants-container">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`variants-toast ${
            toast.type === "success"
              ? "variants-toast-success"
              : toast.type === "info"
              ? "variants-toast-info"
              : "variants-toast-error"
          }`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <h1 className="variants-title">Product Variants</h1>

      {/* Search Form */}
      <div className="variants-search-form">
        <h2 className="variants-form-title">Search Product Variants</h2>
        <div className="variants-form-group">
          <label htmlFor="search-pro-id">Product</label>
          <select
            id="search-pro-id"
            value={searchParams.pro_id}
            onChange={(e) => handleSearchFieldChange(e, "pro_id")}
            className="variants-form-select"
            aria-label="Product"
          >
            <option value="">Select Product</option>
            {products.map((product) => (
              <option key={product._id} value={product._id}>
                {product.pro_name}
              </option>
            ))}
          </select>
        </div>
        <div className="variants-form-group">
          <label htmlFor="search-color-id">Color</label>
          <select
            id="search-color-id"
            value={searchParams.color_id}
            onChange={(e) => handleSearchFieldChange(e, "color_id")}
            className="variants-form-select"
            aria-label="Color"
          >
            <option value="">Select Color</option>
            {colors.map((color) => (
              <option key={color._id} value={color._id}>
                {color.color_name}
              </option>
            ))}
          </select>
        </div>
        <div className="variants-form-group">
          <label htmlFor="search-size-id">Size</label>
          <select
            id="search-size-id"
            value={searchParams.size_id}
            onChange={(e) => handleSearchFieldChange(e, "size_id")}
            className="variants-form-select"
            aria-label="Size"
          >
            <option value="">Select Size</option>
            {sizes.map((size) => (
              <option key={size._id} value={size._id}>
                {size.size_name}
              </option>
            ))}
          </select>
        </div>
        <div className="variants-form-actions">
          <button
            onClick={searchVariants}
            className="variants-create-button"
            aria-label="Search variants"
            disabled={loading}
          >
            Search
          </button>
          <button
            onClick={clearSearch}
            className="variants-cancel-button"
            aria-label="Clear search"
            disabled={loading}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Add Variant Button */}
      <div className="variants-add-button-container">
        <button
          onClick={toggleAddForm}
          className="variants-add-button"
          aria-label={showAddForm ? "Cancel adding variant" : "Add new variant"}
        >
          {showAddForm ? "Cancel" : "Add Variant"}
        </button>
      </div>

      {/* Add Variant Form */}
      {showAddForm && (
        <div className="variants-add-form">
          <h2 className="variants-form-title">Add New Variant</h2>
          <div className="variants-form-group">
            <label htmlFor="new-pro-id">Product</label>
            <select
              id="new-pro-id"
              value={newVariantForm.pro_id}
              onChange={(e) => handleNewVariantFieldChange(e, "pro_id")}
              className="variants-form-select"
              aria-label="Product"
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
          <div className="variants-form-group">
            <label htmlFor="new-color-id">Color</label>
            <select
              id="new-color-id"
              value={newVariantForm.color_id}
              onChange={(e) => handleNewVariantFieldChange(e, "color_id")}
              className="variants-form-select"
              aria-label="Color"
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
          <div className="variants-form-group">
            <label htmlFor="new-size-id">Size</label>
            <select
              id="new-size-id"
              value={newVariantForm.size_id}
              onChange={(e) => handleNewVariantFieldChange(e, "size_id")}
              className="variants-form-select"
              aria-label="Size"
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
          <div className="variants-form-group">
            <label htmlFor="new-image-id">Image</label>
            <select
              id="new-image-id"
              value={newVariantForm.image_id}
              onChange={(e) => handleNewVariantFieldChange(e, "image_id")}
              className="variants-form-select"
              aria-label="Image"
            >
              <option value="">Select Image (Optional)</option>
              {images.map((image) => (
                <option key={image._id} value={image._id}>
                  {image.imageURL || `Image ${image._id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="variants-form-actions">
            <button
              onClick={handleCreateSubmit}
              className="variants-create-button"
              aria-label="Create variant"
              disabled={loading}
            >
              Create
            </button>
            <button
              onClick={toggleAddForm}
              className="variants-cancel-button"
              aria-label="Cancel creating variant"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="variants-error" role="alert" aria-live="assertive">
          <span className="variants-error-icon">⚠</span>
          <span>{error}</span>
          <button
            className="variants-retry-button"
            onClick={handleRetry}
            aria-label="Retry loading variants"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="variants-loading" role="status" aria-live="polite">
          <div className="variants-progress-bar"></div>
          <p>Loading variants...</p>
        </div>
      )}

      {/* Variants Table */}
      {!loading && variants.length === 0 && !error ? (
        <div className="variants-empty" role="status">
          <p>No variants found.</p>
          <button
            className="variants-continue-shopping-button"
            onClick={() => navigate("/")}
            aria-label="Continue shopping"
          >
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="variants-table-container">
          <table className="variants-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Color</th>
                <th>Size</th>
                <th>Image</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant, index) => (
                <tr key={variant._id} className="variants-table-row">
                  <td>{index + 1}</td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <select
                        value={editFormData.pro_id}
                        onChange={(e) => handleEditFieldChange(e, "pro_id")}
                        className="variants-field-select"
                        aria-label="Product"
                        required
                      >
                        <option value="">Select Product</option>
                        {products.map((product) => (
                          <option key={product._id} value={product._id}>
                            {product.pro_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      variant.pro_id?.pro_name ||
                      getProductName(variant.pro_id) ||
                      "N/A"
                    )}
                  </td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <select
                        value={editFormData.color_id}
                        onChange={(e) => handleEditFieldChange(e, "color_id")}
                        className="variants-field-select"
                        aria-label="Color"
                        required
                      >
                        <option value="">Select Color</option>
                        {colors.map((color) => (
                          <option key={color._id} value={color._id}>
                            {color.color_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      variant.color_id?.color_name ||
                      getColorName(variant.color_id) ||
                      "N/A"
                    )}
                  </td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <select
                        value={editFormData.size_id}
                        onChange={(e) => handleEditFieldChange(e, "size_id")}
                        className="variants-field-select"
                        aria-label="Size"
                        required
                      >
                        <option value="">Select Size</option>
                        {sizes.map((size) => (
                          <option key={size._id} value={size._id}>
                            {size.size_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      variant.size_id?.size_name ||
                      getSizeName(variant.size_id) ||
                      "N/A"
                    )}
                  </td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <select
                        value={editFormData.image_id}
                        onChange={(e) => handleEditFieldChange(e, "image_id")}
                        className="variants-field-select"
                        aria-label="Image"
                      >
                        <option value="">Select Image (Optional)</option>
                        {images.map((image) => (
                          <option key={image._id} value={image._id}>
                            {image.imageURL || `Image ${image._id}`}
                          </option>
                        ))}
                      </select>
                    ) : variant.image_id?.imageURL ||
                      getImageUrl(variant.image_id) ? (
                      <img
                        src={
                          variant.image_id?.imageURL ||
                          getImageUrl(variant.image_id)
                        }
                        alt={variant.pro_id?.pro_name || "Product Variant"}
                        className="variants-image"
                        onError={(e) => {
                          e.target.alt = "Image not available";
                          e.target.style.opacity = "0.5";
                        }}
                      />
                    ) : (
                      "N/A"
                    )}
                  </td>
                  <td>
                    {editingVariantId === variant._id ? (
                      <div className="variants-action-buttons">
                        <button
                          onClick={() => handleUpdateSubmit(variant._id)}
                          className="variants-update-button"
                          aria-label={`Update variant ${variant._id}`}
                          disabled={
                            loading ||
                            !editFormData.pro_id ||
                            !editFormData.color_id ||
                            !editFormData.size_id
                          }
                        >
                          Update
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="variants-cancel-button"
                          aria-label={`Cancel editing variant ${variant._id}`}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="variants-action-buttons">
                        <button
                          onClick={() => handleEditVariant(variant)}
                          className="variants-edit-button"
                          aria-label={`Edit variant ${variant._id}`}
                        >
                          Update
                        </button>
                        <button
                          onClick={() => deleteVariant(variant._id)}
                          className="variants-delete-button"
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
    </div>
  );
};

export default ProductVariants;