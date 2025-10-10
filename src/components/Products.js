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

// API functions with retry logic
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
  
  // Edit form data for product
  const [editFormData, setEditFormData] = useState({
    productName: '',
    categoryId: '',
    description: '',
    productStatus: '',
    productImageIds: []
  });
  
  // New product form
  const [newProductForm, setNewProductForm] = useState({
    productName: '',
    categoryId: '',
    description: '',
    productStatus: 'draft',
  });
  const [newProductImages, setNewProductImages] = useState([]);
  const [newProductImagePreviews, setNewProductImagePreviews] = useState([]);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  
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
  const [editImageFiles, setEditImageFiles] = useState([]);
  const [editImagePreviews, setEditImagePreviews] = useState([]);
  const [editMainImageIndex, setEditMainImageIndex] = useState(0);

  // Add Variant Modal States
  const [showAddVariantModal, setShowAddVariantModal] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState(null);
  const [newVariantForm, setNewVariantForm] = useState({
    productColorId: "",
    productSizeId: "",
    variantImage: "",
    variantPrice: "",
    stockQuantity: "",
    variantStatus: "active",
  });
  const [newVariantImageFile, setNewVariantImageFile] = useState(null);
  const [newVariantImagePreview, setNewVariantImagePreview] = useState("");

  // Status options based on model
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
    setCurrentPage(1);
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

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showAddVariantModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showAddVariantModal]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry('/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched categories:', response);
      setCategories(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch categories error:', err);
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
      setSizes(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Fetch sizes error:', err);
    }
  }, []);

  // Fetch products using NEW API
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
      console.log('Fetched new products:', response);
      // Response structure: { success: true, data: [...], message: "..." }
      const productsData = response.data || response;
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
      console.log(`Fetched variants for product ${productId}:`, response);
      const variantsData = response.data || response;
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

  // Handle multiple image file selection (Add form)
  const handleNewImageFilesChange = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate all files are images
    const allImagesValid = files.every(file => file.type.startsWith('image/'));
    if (!allImagesValid) {
      setToast({ type: 'error', message: 'All files must be images' });
      e.target.value = '';
      return;
    }

    setNewProductImages(prev => [...prev, ...files]);
    
    // Create previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProductImagePreviews(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // Remove an image from new product form
  const removeNewImage = useCallback((index) => {
    setNewProductImages(prev => prev.filter((_, i) => i !== index));
    setNewProductImagePreviews(prev => prev.filter((_, i) => i !== index));
    // Adjust main image index if needed
    if (mainImageIndex === index) {
      setMainImageIndex(0);
    } else if (mainImageIndex > index) {
      setMainImageIndex(prev => prev - 1);
    }
  }, [mainImageIndex]);

  // Handle multiple image file selection (Edit form)
  const handleEditImageFilesChange = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate all files are images
    const allImagesValid = files.every(file => file.type.startsWith('image/'));
    if (!allImagesValid) {
      setToast({ type: 'error', message: 'All files must be images' });
      e.target.value = '';
      return;
    }

    setEditImageFiles(prev => [...prev, ...files]);
    
    // Create previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditImagePreviews(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // Remove an image from edit form
  const removeEditImage = useCallback((index, isExisting) => {
    if (isExisting) {
      // Remove from existing images
      setEditFormData(prev => ({
        ...prev,
        productImageIds: prev.productImageIds.filter((_, i) => i !== index)
      }));
    } else {
      // Remove from new images
      const adjustedIndex = index - (editFormData.productImageIds?.length || 0);
      setEditImageFiles(prev => prev.filter((_, i) => i !== adjustedIndex));
      setEditImagePreviews(prev => prev.filter((_, i) => i !== adjustedIndex));
    }
    
    // Adjust main image index if needed
    if (editMainImageIndex === index) {
      setEditMainImageIndex(0);
    } else if (editMainImageIndex > index) {
      setEditMainImageIndex(prev => prev - 1);
    }
  }, [editFormData.productImageIds, editMainImageIndex]);

  // Create product using NEW API
  const createProduct = useCallback(async () => {
    setLoading(true);
    setError('');
    setToast(null);

    // Validate form
    if (!newProductForm.productName || !newProductForm.categoryId) {
      setError('Product name and category are required');
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
      
      // Upload all images
      const uploadedImageUrls = await Promise.all(
        newProductImages.map(file => uploadSingleImage(file))
      );

      // Prepare image data with isMain flag
      const imageData = uploadedImageUrls.map((url, index) => ({
        imageUrl: url,
        isMain: index === mainImageIndex
      }));

      // Create product with images
      const response = await apiClient.post('/new-products', {
        ...newProductForm,
        productImageIds: imageData,
        productStatus: 'draft' // Set to draft by default (no variants yet)
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Product created:', response.data);
      const newProduct = response.data.data || response.data;
      setProducts(prev => [...prev, newProduct]);
      setToast({ type: 'success', message: 'Product created successfully. Add variants to activate it.' });
      
      // Reset form
      setNewProductForm({
        productName: '',
        categoryId: '',
        description: '',
        productStatus: 'draft',
      });
      setNewProductImages([]);
      setNewProductImagePreviews([]);
      setMainImageIndex(0);
      setShowAddForm(false);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to create product';
      setError(errorMessage);
      setToast({ type: 'error', message: errorMessage });
      console.error('Create product error:', err);
    } finally {
      setLoading(false);
    }
  }, [newProductForm, newProductImages, mainImageIndex, uploadSingleImage]);

  // Update product using NEW API
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
      
      // Upload new images if any
      let updatedImageData = [...(editFormData.productImageIds || [])];
      
      if (editImageFiles.length > 0) {
        const uploadedImageUrls = await Promise.all(
          editImageFiles.map(file => uploadSingleImage(file))
        );
        
        // Add new images to the array
        const newImages = uploadedImageUrls.map(url => ({
          imageUrl: url,
          isMain: false
        }));
        updatedImageData = [...updatedImageData, ...newImages];
      }

      // Set the main image
      updatedImageData = updatedImageData.map((img, index) => ({
        ...img,
        isMain: index === editMainImageIndex
      }));

      const response = await apiClient.put(`/new-products/${productId}`, {
        ...editFormData,
        productImageIds: updatedImageData,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Product updated:', response.data);
      const updatedProduct = response.data.data || response.data;
      setProducts(prev =>
        prev.map(product =>
          product._id === productId ? updatedProduct : product
        )
      );
      setToast({ type: 'success', message: 'Product updated successfully' });
      setEditingProductId(null);
      setEditFormData({
        productName: '',
        categoryId: '',
        description: '',
        productStatus: '',
        productImageIds: []
      });
      setEditImageFiles([]);
      setEditImagePreviews([]);
      setEditMainImageIndex(0);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update product';
      setError(errorMessage);
      setToast({ type: 'error', message: errorMessage });
      console.error('Update product error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData, editImageFiles, editMainImageIndex, uploadSingleImage]);

  // Delete product (soft delete) using NEW API
  const deleteProduct = useCallback(async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product? This action will mark it as discontinued.')) return;

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
      
      // Update the product status to discontinued instead of removing it
      setProducts(prev => 
        prev.map(product => 
          product._id === productId 
            ? { ...product, productStatus: 'discontinued' }
            : product
        )
      );
      
      setToast({ type: 'success', message: 'Product marked as discontinued successfully' });
      if (selectedProductId === productId) setSelectedProductId(null);
      if (editingProductId === productId) setEditingProductId(null);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to delete product';
      setError(errorMessage);
      setToast({ type: 'error', message: errorMessage });
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

  // Toggle product details visibility and fetch variants
  const handleToggleDetails = useCallback((productId) => {
    if (selectedProductId === productId) {
      setSelectedProductId(null);
    } else {
      setSelectedProductId(productId);
      // Fetch variants if not already loaded
      if (!productVariants[productId]) {
        fetchProductVariants(productId);
      }
    }
  }, [selectedProductId, productVariants, fetchProductVariants]);

  // Start editing product
  const handleEditProduct = useCallback((product) => {
    setEditingProductId(product._id);
    setEditFormData({
      productName: product.productName || '',
      categoryId: product.categoryId?._id || product.categoryId || '',
      description: product.description || '',
      productStatus: product.productStatus || 'pending',
      productImageIds: product.productImageIds || []
    });
    setEditImageFiles([]);
    setEditImagePreviews([]);
    // Find the main image index
    const mainIndex = product.productImageIds?.findIndex(img => img.isMain) || 0;
    setEditMainImageIndex(mainIndex >= 0 ? mainIndex : 0);
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingProductId(null);
    setEditFormData({
      productName: '',
      categoryId: '',
      description: '',
      productStatus: '',
      productImageIds: []
    });
    setEditImageFiles([]);
    setEditImagePreviews([]);
    setEditMainImageIndex(0);
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
      productStatus: 'draft',
    });
    setNewProductImages([]);
    setNewProductImagePreviews([]);
    setMainImageIndex(0);
    setError('');
  }, []);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Handle opening Add Variant modal
  const handleOpenAddVariantModal = useCallback((product) => {
    setSelectedProductForVariant(product);
    setShowAddVariantModal(true);
    setNewVariantForm({
      productColorId: "",
      productSizeId: "",
      variantImage: "",
      variantPrice: "",
      stockQuantity: "",
      variantStatus: "active",
    });
    setNewVariantImageFile(null);
    setNewVariantImagePreview("");
  }, []);

  // Handle closing Add Variant modal
  const handleCloseAddVariantModal = useCallback(() => {
    setShowAddVariantModal(false);
    setSelectedProductForVariant(null);
    setNewVariantForm({
      productColorId: "",
      productSizeId: "",
      variantImage: "",
      variantPrice: "",
      stockQuantity: "",
      variantStatus: "active",
    });
    setNewVariantImageFile(null);
    setNewVariantImagePreview("");
  }, []);

  // Handle variant image file change
  const handleNewVariantImageChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'File must be an image' });
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

  // Handle field change for new variant form
  const handleNewVariantFieldChange = useCallback((field, value) => {
    setNewVariantForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Create variant
  const createVariant = useCallback(async () => {
    setLoading(true);
    setError("");
    setToast(null);

    // Validate form
    if (!newVariantForm.productColorId || !newVariantForm.productSizeId) {
      setError("Color and size are required");
      setLoading(false);
      return;
    }
    if (!newVariantForm.variantPrice || parseFloat(newVariantForm.variantPrice) < 0) {
      setError("Valid price is required");
      setLoading(false);
      return;
    }
    if (!newVariantForm.stockQuantity || parseInt(newVariantForm.stockQuantity) < 0) {
      setError("Valid stock quantity is required");
      setLoading(false);
      return;
    }
    if (!newVariantImageFile) {
      setError("Please upload a variant image");
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      // Upload variant image
      const variantImageUrl = await uploadSingleImage(newVariantImageFile);
      if (!variantImageUrl) {
        throw new Error('Image upload failed');
      }

      const response = await apiClient.post("/new-variants", {
        productId: selectedProductForVariant._id,
        productColorId: newVariantForm.productColorId,
        productSizeId: newVariantForm.productSizeId,
        variantImage: variantImageUrl,
        variantPrice: parseFloat(newVariantForm.variantPrice),
        stockQuantity: parseInt(newVariantForm.stockQuantity),
        variantStatus: newVariantForm.variantStatus,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Variant created:', response.data);
      
      setToast({ type: "success", message: "Variant created successfully" });
      
      // Refresh variants for the product
      fetchProductVariants(selectedProductForVariant._id);
      
      // Close modal and reset form
      handleCloseAddVariantModal();
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to create variant';
      setError(errorMessage);
      setToast({ type: "error", message: errorMessage });
      console.error("Create variant error:", err);
    } finally {
      setLoading(false);
    }
  }, [newVariantForm, newVariantImageFile, selectedProductForVariant, uploadSingleImage, fetchProductVariants, handleCloseAddVariantModal]);

  // Get category name by ID
  const getCategoryName = useCallback((catId) => {
    if (!catId) return 'N/A';
    const catIdString = typeof catId === 'object' ? catId._id : catId;
    const category = categories.find(cat => cat._id === catIdString);
    return category?.cat_name || 'N/A';
  }, [categories]);

  // Get status badge class
  const getStatusBadgeClass = useCallback((status) => {
    switch(status) {
      case 'active': return 'products-status-active';
      case 'inactive': return 'products-status-inactive';
      case 'pending': return 'products-status-pending';
      case 'discontinued': return 'products-status-discontinued';
      default: return 'products-status-unknown';
    }
  }, []);

  // Check if product is discontinued
  const isProductDiscontinued = useCallback((product) => {
    return product.productStatus === 'discontinued';
  }, []);

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
          <p className="products-form-subtitle">Create a product first, then add variants to activate it.</p>
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

          {/* Multiple Image Upload */}
          <div className="products-form-group products-images-group">
            <label htmlFor="new-image-files">Product Images *</label>
            <div className="products-file-input-wrapper">
              <input
                id="new-image-files"
                type="file"
                accept="image/*"
                multiple
                onChange={handleNewImageFilesChange}
                className="products-file-input"
                aria-label="Upload product images"
              />
              <button 
                type="button" 
                className="products-add-image-button"
                onClick={() => document.getElementById('new-image-files').click()}
              >
                Add Images
              </button>
            </div>
            
            {/* Image Previews */}
            {newProductImagePreviews.length > 0 && (
              <div className="products-images-preview-grid">
                {newProductImagePreviews.map((preview, index) => (
                  <div 
                    key={index} 
                    className={`products-image-preview-item ${mainImageIndex === index ? 'main-image' : ''}`}
                  >
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="products-preview-image"
                    />
                    <div className="products-image-actions">
                      <button
                        type="button"
                        className="products-remove-image-button"
                        onClick={() => removeNewImage(index)}
                        aria-label={`Remove image ${index + 1}`}
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        className={`products-set-main-button ${mainImageIndex === index ? 'active' : ''}`}
                        onClick={() => setMainImageIndex(index)}
                        aria-label={`Set as main image`}
                      >
                        {mainImageIndex === index ? '★ Main' : '☆ Set Main'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                <th>Main Image</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentProducts.map((product, index) => {
                const discontinued = isProductDiscontinued(product);
                return (
                  <React.Fragment key={product._id}>
                    <tr className={`products-table-row ${discontinued ? 'discontinued-row' : ''}`}>
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
                      <td>
                        {editingProductId === product._id ? (
                          <div className="products-edit-images">
                            {/* Existing Images */}
                            {editFormData.productImageIds?.map((img, idx) => (
                              <div key={idx} className={`products-image-preview-item ${editMainImageIndex === idx ? 'main-image' : ''}`}>
                                <img
                                  src={img.imageUrl}
                                  alt="Product"
                                  className="products-preview-image"
                                />
                                <div className="products-image-actions">
                                  <button
                                    type="button"
                                    className="products-remove-image-button"
                                    onClick={() => removeEditImage(idx, true)}
                                  >
                                    ×
                                  </button>
                                  <button
                                    type="button"
                                    className={`products-set-main-button ${editMainImageIndex === idx ? 'active' : ''}`}
                                    onClick={() => setEditMainImageIndex(idx)}
                                  >
                                    {editMainImageIndex === idx ? '★' : '☆'}
                                  </button>
                                </div>
                              </div>
                            ))}
                            
                            {/* New Images */}
                            {editImagePreviews.map((preview, idx) => {
                              const actualIndex = (editFormData.productImageIds?.length || 0) + idx;
                              return (
                                <div key={`new-${idx}`} className={`products-image-preview-item ${editMainImageIndex === actualIndex ? 'main-image' : ''}`}>
                                  <img
                                    src={preview}
                                    alt="New"
                                    className="products-preview-image"
                                  />
                                  <div className="products-image-actions">
                                    <button
                                      type="button"
                                      className="products-remove-image-button"
                                      onClick={() => removeEditImage(actualIndex, false)}
                                    >
                                      ×
                                    </button>
                                    <button
                                      type="button"
                                      className={`products-set-main-button ${editMainImageIndex === actualIndex ? 'active' : ''}`}
                                      onClick={() => setEditMainImageIndex(actualIndex)}
                                    >
                                      {editMainImageIndex === actualIndex ? '★' : '☆'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            
                            {/* Add More Images Button */}
                            <div className="products-add-more-images">
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleEditImageFilesChange}
                                style={{ display: 'none' }}
                                id={`edit-images-${product._id}`}
                              />
                              <button
                                type="button"
                                className="products-add-image-button"
                                onClick={() => document.getElementById(`edit-images-${product._id}`).click()}
                              >
                                Add Images
                              </button>
                            </div>
                          </div>
                        ) : product.productImageIds && product.productImageIds.length > 0 ? (
                          <img
                            src={product.productImageIds.find(img => img.isMain)?.imageUrl || product.productImageIds[0]?.imageUrl}
                            alt={product.productName || 'Product'}
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
                      <td>
                        {editingProductId === product._id ? (
                          <select
                            value={editFormData.productStatus}
                            onChange={(e) => handleEditFieldChange(e, 'productStatus')}
                            className="products-field-select"
                            aria-label="Product status"
                          >
                            {statusOptions.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={getStatusBadgeClass(product.productStatus)}>
                            {discontinued ? 'Deleted' : product.productStatus || 'N/A'}
                          </span>
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
                              disabled={discontinued}
                            >
                              {selectedProductId === product._id ? 'Hide Details' : 'View Details'}
                            </button>
                            <button
                              onClick={() => handleEditProduct(product)}
                              className="products-edit-button"
                              aria-label={`Edit product ${product._id}`}
                              disabled={discontinued}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteProduct(product._id)}
                              className="products-delete-button"
                              aria-label={`Delete product ${product._id}`}
                              disabled={discontinued}
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => handleOpenAddVariantModal(product)}
                              className="products-add-variant-button"
                              aria-label={`Add variant for product ${product._id}`}
                              disabled={discontinued}
                            >
                              Add Variant
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    
                    {/* Product Details with Variants */}
                    {selectedProductId === product._id && (
                      <tr className="products-details-row">
                        <td colSpan="7">
                          <div className="products-details-section">
                            <h2 className="products-details-title">Product Details</h2>
                            
                            {/* Product Description */}
                            <div className="products-detail-info">
                              <p><strong>Description:</strong> {product.description || 'No description available'}</p>
                              <p><strong>Status:</strong> {product.productStatus}</p>
                            </div>

                            {/* Product Images */}
                            <div className="products-detail-images">
                              <h3>Product Images</h3>
                              <div className="products-images-gallery">
                                {product.productImageIds && product.productImageIds.length > 0 ? (
                                  product.productImageIds.map((img, idx) => (
                                    <div key={idx} className="products-gallery-item">
                                      <img src={img.imageUrl} alt={`Product ${idx + 1}`} />
                                      {img.isMain && <span className="main-badge">Main</span>}
                                    </div>
                                  ))
                                ) : (
                                  <p>No images available</p>
                                )}
                              </div>
                            </div>

                            {/* Product Variants */}
                            <div className="products-detail-variants">
                              <h3>Product Variants</h3>
                              {productVariants[product._id] ? (
                                productVariants[product._id].length > 0 ? (
                                  <div className="variants-table-wrapper">
                                    <table className="variants-table">
                                      <thead>
                                        <tr>
                                          <th>#</th>
                                          <th>Color</th>
                                          <th>Size</th>
                                          <th>Price</th>
                                          <th>Stock</th>
                                          <th>Image</th>
                                          <th>Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {productVariants[product._id].map((variant, vIdx) => (
                                          <tr key={variant._id}>
                                            <td>{vIdx + 1}</td>
                                            <td>{variant.productColorId?.color_name || 'N/A'}</td>
                                            <td>{variant.productSizeId?.size_name || 'N/A'}</td>
                                            <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(variant.variantPrice || 0)}</td>
                                            <td>{variant.stockQuantity || 0}</td>
                                            <td>
                                              {variant.variantImage ? (
                                                <img src={variant.variantImage} alt="Variant" className="variant-image" />
                                              ) : 'N/A'}
                                            </td>
                                            <td>
                                              <span className={`variant-status-${variant.variantStatus}`}>
                                                {variant.variantStatus || 'N/A'}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="no-variants-message">No variants available. Add variants to activate this product.</p>
                                )
                              ) : (
                                <div className="variants-loading">Loading variants...</div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
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

      {/* Add Variant Modal */}
      {showAddVariantModal && (
        <div className="products-modal-overlay" onClick={handleCloseAddVariantModal}>
          <div className="products-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="products-modal-header">
              <h2>Add New Variant</h2>
              <button 
                className="products-modal-close"
                onClick={handleCloseAddVariantModal}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
            
            <div className="products-modal-body">
              {selectedProductForVariant && (
                <p className="products-modal-subtitle">
                  Adding variant for: <strong>{selectedProductForVariant.productName}</strong>
                </p>
              )}

              <div className="products-modal-form">
                <div className="products-modal-form-row">
                  <div className="products-modal-form-group">
                    <label htmlFor="variant-color">Color *</label>
                    <select
                      id="variant-color"
                      value={newVariantForm.productColorId}
                      onChange={(e) => handleNewVariantFieldChange("productColorId", e.target.value)}
                      className="products-modal-select"
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

                  <div className="products-modal-form-group">
                    <label htmlFor="variant-size">Size *</label>
                    <select
                      id="variant-size"
                      value={newVariantForm.productSizeId}
                      onChange={(e) => handleNewVariantFieldChange("productSizeId", e.target.value)}
                      className="products-modal-select"
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
                </div>

                <div className="products-modal-form-row">
                  <div className="products-modal-form-group">
                    <label htmlFor="variant-price">Price *</label>
                    <input
                      id="variant-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newVariantForm.variantPrice}
                      onChange={(e) => handleNewVariantFieldChange("variantPrice", e.target.value)}
                      className="products-modal-input"
                      required
                    />
                  </div>

                  <div className="products-modal-form-group">
                    <label htmlFor="variant-stock">Stock Quantity *</label>
                    <input
                      id="variant-stock"
                      type="number"
                      min="0"
                      value={newVariantForm.stockQuantity}
                      onChange={(e) => handleNewVariantFieldChange("stockQuantity", e.target.value)}
                      className="products-modal-input"
                      required
                    />
                  </div>
                </div>

                <div className="products-modal-form-group products-modal-image-group">
                  <label htmlFor="variant-image">Variant Image *</label>
                  <input
                    id="variant-image"
                    type="file"
                    accept="image/*"
                    onChange={handleNewVariantImageChange}
                    className="products-modal-file-input"
                    style={{ display: 'none' }}
                  />
                  <button 
                    type="button" 
                    className="products-modal-image-button"
                    onClick={() => document.getElementById('variant-image').click()}
                  >
                    Add Variant Image
                  </button>
                  {newVariantImagePreview && (
                    <div className="products-modal-image-preview">
                      <img
                        src={newVariantImagePreview}
                        alt="Variant preview"
                        className="products-modal-preview-img"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="products-modal-footer">
              <button
                onClick={createVariant}
                className="products-modal-submit"
                disabled={loading}
              >
                Create Variant
              </button>
              <button
                onClick={handleCloseAddVariantModal}
                className="products-modal-cancel"
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
