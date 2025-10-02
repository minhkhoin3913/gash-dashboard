import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/ProductSpecifications.css';
import axios from 'axios';

//API client with interceptors
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
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
      const response = await apiClient.get(url, options);
      return response.data;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

const ProductSpecifications = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('images');
  const [images, setImages] = useState([]);
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [products, setProducts] = useState([]);
  const [editingSpecId, setEditingSpecId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newSpecForm, setNewSpecForm] = useState({
    images: { pro_id: '', imageURL: '' },
    colors: { color_name: '' },
    sizes: { size_name: '' },
  });
  const [showAddForm, setShowAddForm] = useState({
    images: false,
    colors: false,
    sizes: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const [newImageFile, setNewImageFile] = useState(null);
  const [newImagePreview, setNewImagePreview] = useState('');
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState('');

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  const handleNewImageFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'Please select a valid image file' });
        setNewImageFile(null);
        setNewImagePreview('');
        return;
      }
      setNewImageFile(file);
      setNewImagePreview(URL.createObjectURL(file));
    } else {
      setNewImageFile(null);
      setNewImagePreview('');
    }
  }, []);

  const handleEditImageFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'Please select a valid image file' });
        setEditImageFile(null);
        setEditImagePreview('');
        return;
      }
      setEditImageFile(file);
      setEditImagePreview(URL.createObjectURL(file));
    } else {
      setEditImageFile(null);
      setEditImagePreview('');
    }
  }, []);

  // Fetch images
  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/specifications/image', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setImages(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load images');
      console.error('Fetch images error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch colors
  const fetchColors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/specifications/color', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setColors(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load colors');
      console.error('Fetch colors error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch sizes
  const fetchSizes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/specifications/size', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSizes(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load sizes');
      console.error('Fetch sizes error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetchWithRetry('/products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load products');
      console.error('Fetch products error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create specification
  const createSpecification = useCallback(async (type) => {
    setLoading(true);
    setError('');
    setToast(null);

    const data = newSpecForm[type];
    const endpoint = `/specifications/${type.slice(0, -1)}`; // e.g., /image, /color, /size

    if (type === 'images' && (!data.pro_id || (!newImageFile))) {
      setError('Please select a product and upload an image file');
      setLoading(false);
      return;
    }
    if (type !== 'images' && !data.content) {
      setError(`${type.capitalize()} name is required`);
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      let imageURLToUse = data.imageURL;
      if (type === 'images') {
        imageURLToUse = await uploadSingleImage(newImageFile);
        if (!imageURLToUse) throw new Error('Image upload failed');
      }
      const payload = type === 'images' ? { ...data, imageURL: imageURLToUse } : { [`${type.slice(0, -1)}_name`]: data.content };
      const response = await apiClient.post(endpoint, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (type === 'images') {
        const newImage = {
          ...response.data.image,
          // Cache-bust so the newest image is shown immediately
          imageURL: `${response.data.image.imageURL}?v=${Date.now()}`,
        };
        setImages(prev => [...prev, newImage]);
      }
      if (type === 'colors') setColors(prev => [...prev, response.data.color]);
      if (type === 'sizes') setSizes(prev => [...prev, response.data.size]);
      setToast({ type: 'success', message: `${type.capitalize()} created successfully` });
      setNewSpecForm(prev => ({
        ...prev,
        [type]: type === 'images' ? { pro_id: '', imageURL: '' } : { content: '' },
      }));
      if (type === 'images') {
        setNewImageFile(null);
        setNewImagePreview('');
      }
      setShowAddForm(prev => ({ ...prev, [type]: false }));
    } catch (err) {
      setError(err.response?.data?.message || `Failed to create ${type.slice(0, -1)}`);
      setToast({ type: 'error', message: err.response?.data?.message || `Failed to create ${type.slice(0, -1)}` });
      console.error(`Create ${type} error:`, err);
    } finally {
      setLoading(false);
    }
  }, [newSpecForm]);

  // Update specification
  const updateSpecification = useCallback(async (type, id, data) => {
    setLoading(true);
    setError('');
    setToast(null);

    const endpoint = `/specifications/${type.slice(0, -1)}/${id}`;

    if (type === 'images' && !data.pro_id) {
      setError('Please select a product');
      setLoading(false);
      return;
    }
    if (type !== 'images' && !data.content) {
      setError(`${type.capitalize()} name is required`);
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      let imageURLToUse = data.imageURL;
      
      if (type === 'images') {
        // Upload new image first if user selected a new file
        if (editImageFile) {
          imageURLToUse = await uploadSingleImage(editImageFile);
          if (!imageURLToUse) {
            throw new Error('Image upload failed');
          }
        }
        // If no new image file and no existing imageURL, that's an error
        if (!imageURLToUse) {
          throw new Error('Please upload an image');
        }
      }
      
      const payload = type === 'images' ? { ...data, imageURL: imageURLToUse } : { [`${type.slice(0, -1)}_name`]: data.content };
      const response = await apiClient.put(endpoint, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (type === 'images') {
        const updatedImage = {
          ...response.data.image,
          // Cache-bust so the newest image is shown immediately
          imageURL: `${response.data.image.imageURL}?v=${Date.now()}`,
        };
        setImages(prev => prev.map(item => item._id === id ? updatedImage : item));
      }
      if (type === 'colors') {
        setColors(prev => prev.map(item => item._id === id ? response.data.color : item));
      }
      if (type === 'sizes') {
        setSizes(prev => prev.map(item => item._id === id ? response.data.size : item));
      }
      setToast({ type: 'success', message: `${type.capitalize()} updated successfully` });
      setEditingSpecId(null);
      setEditFormData({});
      if (type === 'images') {
        setEditImageFile(null);
        setEditImagePreview('');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || `Failed to update ${type.slice(0, -1)}`);
      setToast({ type: 'error', message: err.response?.data?.message || err.message || `Failed to update ${type.slice(0, -1)}` });
      console.error(`Update ${type} error:`, err);
    } finally {
      setLoading(false);
    }
  }, [editImageFile, uploadSingleImage]);

  // Delete specification
  const deleteSpecification = useCallback(async (type, id) => {
    if (!window.confirm(`Are you sure you want to delete this ${type.slice(0, -1)}?`)) return;

    setLoading(true);
    setError('');
    setToast(null);

    const endpoint = `/specifications/${type.slice(0, -1)}/${id}`;

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (type === 'images') setImages(prev => prev.filter(item => item._id !== id));
      if (type === 'colors') setColors(prev => prev.filter(item => item._id !== id));
      if (type === 'sizes') setSizes(prev => prev.filter(item => item._id !== id));
      setToast({ type: 'success', message: `${type.capitalize()} deleted successfully` });
      if (editingSpecId === id) setEditingSpecId(null);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to delete ${type.slice(0, -1)}`);
      setToast({ type: 'error', message: err.response?.data?.message || `Failed to delete ${type.slice(0, -1)}` });
      console.error(`Delete ${type} error:`, err);
    } finally {
      setLoading(false);
    }
  }, [editingSpecId]);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem('token')) {
      navigate('/login', { replace: true });
    } else if (user) {
      fetchImages();
      fetchColors();
      fetchSizes();
      fetchProducts();
    }
  }, [user, isAuthLoading, navigate, fetchImages, fetchColors, fetchSizes, fetchProducts]);

  // Start editing
  const handleEdit = useCallback((type, item) => {
    setEditingSpecId(item._id);
    if (type === 'images') {
      setEditFormData({
        pro_id: item.pro_id?._id || item.pro_id || '',
        imageURL: item.imageURL || '',
      });
      setEditImageFile(null);
      setEditImagePreview('');
    } else {
      setEditFormData({
        content: item[`${type.slice(0, -1)}_name`] || '',
      });
    }
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingSpecId(null);
    setEditFormData({});
    setEditImageFile(null);
    setEditImagePreview('');
  }, []);

  // Handle field change for edit form
  const handleEditFieldChange = useCallback((e, field) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Handle field change for new form
  const handleNewFieldChange = useCallback((e, type, field) => {
    setNewSpecForm(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: e.target.value },
    }));
  }, []);

  // Submit updated fields
  const handleUpdateSubmit = useCallback((type, id) => {
    updateSpecification(type, id, editFormData);
  }, [editFormData, updateSpecification]);

  // Submit new specification
  const handleCreateSubmit = useCallback((type) => {
    createSpecification(type);
  }, [createSpecification]);

  // Toggle add form
  const toggleAddForm = useCallback((type) => {
    setShowAddForm(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
    setNewSpecForm(prev => ({
      ...prev,
      [type]: type === 'images' ? { pro_id: '', imageURL: '' } : { content: '' },
    }));
    setError('');
  }, []);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchImages();
    fetchColors();
    fetchSizes();
    fetchProducts();
  }, [fetchImages, fetchColors, fetchSizes, fetchProducts]);

  // Get product name by ID
  const getProductName = useCallback((proId) => {
    const product = products.find(p => p._id === proId);
    return product?.pro_name || 'N/A';
  }, [products]);

  // Capitalize helper
  String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
  };

  // Show loading state while auth is being verified
  if (isAuthLoading) {
    return (
      <div className="specifications-container">
        <div className="specifications-loading" role="status" aria-live="polite">
          <div className="specifications-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="specifications-container">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`specifications-toast ${toast.type === 'success' ? 'specifications-toast-success' : 'specifications-toast-error'}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <h1 className="specifications-title">Product Specifications</h1>

      {/* Tabs */}
      <div className="specifications-tabs">
        <button
          className={`specifications-tab ${activeTab === 'images' ? 'active' : ''}`}
          onClick={() => setActiveTab('images')}
          aria-selected={activeTab === 'images'}
          role="tab"
        >
          Images
        </button>
        <button
          className={`specifications-tab ${activeTab === 'colors' ? 'active' : ''}`}
          onClick={() => setActiveTab('colors')}
          aria-selected={activeTab === 'colors'}
          role="tab"
        >
          Colors
        </button>
        <button
          className={`specifications-tab ${activeTab === 'sizes' ? 'active' : ''}`}
          onClick={() => setActiveTab('sizes')}
          aria-selected={activeTab === 'sizes'}
          role="tab"
        >
          Sizes
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="specifications-error" role="alert" aria-live="assertive">
          <span className="specifications-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="specifications-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading specifications"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="specifications-loading" role="status" aria-live="polite">
          <div className="specifications-progress-bar"></div>
          <p>Loading {activeTab}...</p>
        </div>
      )}

      {/* Images Section */}
      {activeTab === 'images' && !loading && (
        <div className="specifications-section">
          <div className="specifications-add-button-container">
            <button
              onClick={() => toggleAddForm('images')}
              className="specifications-add-button"
              aria-label={showAddForm.images ? 'Cancel adding image' : 'Add new image'}
            >
              {showAddForm.images ? 'Cancel' : 'Add Image'}
            </button>
          </div>

          {showAddForm.images && (
            <div className="specifications-add-form">
              <h2 className="specifications-form-title">Add New Image</h2>
              <div className="specifications-form-group">
                <label htmlFor="new-image-pro-id">Product</label>
                <select
                  id="new-image-pro-id"
                  value={newSpecForm.images.pro_id}
                  onChange={(e) => handleNewFieldChange(e, 'images', 'pro_id')}
                  className="specifications-form-select"
                  aria-label="Product"
                  required
                >
                  <option value="">Select Product</option>
                  {products.map(product => (
                    <option key={product._id} value={product._id}>
                      {product.pro_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="specifications-form-group">
                <label htmlFor="new-image-file">Upload Image</label>
                <input
                  id="new-image-file"
                  type="file"
                  accept="image/*"
                  onChange={handleNewImageFileChange}
                  aria-label="Upload image file"
                />
                {newImagePreview && (
                  <div className="specifications-image-preview">
                    <img
                      src={newImagePreview}
                      alt="Preview"
                      className="specifications-image"
                    />
                  </div>
                )}
              </div>
              <div className="specifications-form-actions">
                <button
                  onClick={() => handleCreateSubmit('images')}
                  className="specifications-create-button"
                  aria-label="Create image"
                  disabled={loading}
                >
                  Create
                </button>
                <button
                  onClick={() => toggleAddForm('images')}
                  className="specifications-cancel-button"
                  aria-label="Cancel creating image"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {images.length === 0 && !showAddForm.images ? (
            <div className="specifications-empty" role="status">
              <p>No images found.</p>
              <button 
                className="specifications-continue-shopping-button"
                onClick={() => navigate('/')}
                aria-label="Continue shopping"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="specifications-table-container">
              <table className="specifications-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product Name</th>
                    <th>Image</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((image, index) => (
                    <tr key={image._id} className="specifications-table-row">
                      <td>{index + 1}</td>
                      <td>
                        {editingSpecId === image._id ? (
                          <select
                            value={editFormData.pro_id}
                            onChange={(e) => handleEditFieldChange(e, 'pro_id')}
                            className="specifications-field-select"
                            aria-label="Product"
                            required
                          >
                            <option value="">Select Product</option>
                            {products.map(product => (
                              <option key={product._id} value={product._id}>
                                {product.pro_name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          image.pro_id?.pro_name || getProductName(image.pro_id) || 'N/A'
                        )}
                      </td>
                      <td>
                        {editingSpecId === image._id ? (
                          <div className="specifications-edit-image">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleEditImageFileChange}
                              aria-label="Upload new image"
                            />
                            {(editImagePreview || image.imageURL) && (
                              <div className="specifications-image-preview">
                                <img
                                  src={editImagePreview || image.imageURL}
                                  alt={editImagePreview ? "New image preview" : "Current image"}
                                  className="specifications-image"
                                />
                                {editImagePreview && (
                                  <div className="specifications-image-label">
                                    <small>New Image Preview</small>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : image.imageURL ? (
                          <img
                            src={image.imageURL}
                            alt={image.pro_id?.pro_name || 'Product Image'}
                            className="specifications-image"
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
                        {editingSpecId === image._id ? (
                          <div className="specifications-action-buttons">
                            <button
                              onClick={() => handleUpdateSubmit('images', image._id)}
                              className="specifications-update-button"
                              aria-label={`Update image ${image._id}`}
                              disabled={loading || !editFormData.pro_id || (!editFormData.imageURL && !editImageFile)}
                            >
                              Update
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="specifications-cancel-button"
                              aria-label={`Cancel editing image ${image._id}`}
                              disabled={loading}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="specifications-action-buttons">
                            <button
                              onClick={() => handleEdit('images', image)}
                              className="specifications-edit-button"
                              aria-label={`Edit image ${image._id}`}
                            >
                              Update
                            </button>
                            <button
                              onClick={() => deleteSpecification('images', image._id)}
                              className="specifications-delete-button"
                              aria-label={`Delete image ${image._id}`}
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
      )}

      {/* Colors Section */}
      {activeTab === 'colors' && !loading && (
        <div className="specifications-section">
          <div className="specifications-add-button-container">
            <button
              onClick={() => toggleAddForm('colors')}
              className="specifications-add-button"
              aria-label={showAddForm.colors ? 'Cancel adding color' : 'Add new color'}
            >
              {showAddForm.colors ? 'Cancel' : 'Add Color'}
            </button>
          </div>

          {showAddForm.colors && (
            <div className="specifications-add-form">
              <h2 className="specifications-form-title">Add New Color</h2>
              <div className="specifications-form-group">
                <label htmlFor="new-color-name">Color Name</label>
                <input
                  id="new-color-name"
                  type="text"
                  value={newSpecForm.colors.content}
                  onChange={(e) => handleNewFieldChange(e, 'colors', 'content')}
                  className="specifications-form-input"
                  aria-label="Color Name"
                  required
                />
              </div>
              <div className="specifications-form-actions">
                <button
                  onClick={() => handleCreateSubmit('colors')}
                  className="specifications-create-button"
                  aria-label="Create color"
                  disabled={loading}
                >
                  Create
                </button>
                <button
                  onClick={() => toggleAddForm('colors')}
                  className="specifications-cancel-button"
                  aria-label="Cancel creating color"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {colors.length === 0 && !showAddForm.colors ? (
            <div className="specifications-empty" role="status">
              <p>No colors found.</p>
              <button 
                className="specifications-continue-shopping-button"
                onClick={() => navigate('/')}
                aria-label="Continue shopping"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="specifications-table-container">
              <table className="specifications-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Color Name</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {colors.map((color, index) => (
                    <tr key={color._id} className="specifications-table-row">
                      <td>{index + 1}</td>
                      <td>
                        {editingSpecId === color._id ? (
                          <input
                            type="text"
                            value={editFormData.content}
                            onChange={(e) => handleEditFieldChange(e, 'content')}
                            className="specifications-form-input"
                            aria-label="Color Name"
                            required
                          />
                        ) : (
                          color.color_name || 'N/A'
                        )}
                      </td>
                      <td>
                        {editingSpecId === color._id ? (
                          <div className="specifications-action-buttons">
                            <button
                              onClick={() => handleUpdateSubmit('colors', color._id)}
                              className="specifications-update-button"
                              aria-label={`Update color ${color._id}`}
                              disabled={loading || !editFormData.content}
                            >
                              Update
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="specifications-cancel-button"
                              aria-label={`Cancel editing color ${color._id}`}
                              disabled={loading}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="specifications-action-buttons">
                            <button
                              onClick={() => handleEdit('colors', color)}
                              className="specifications-edit-button"
                              aria-label={`Edit color ${color._id}`}
                            >
                              Update
                            </button>
                            <button
                              onClick={() => deleteSpecification('colors', color._id)}
                              className="specifications-delete-button"
                              aria-label={`Delete color ${color._id}`}
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
      )}

      {/* Sizes Section */}
      {activeTab === 'sizes' && !loading && (
        <div className="specifications-section">
          <div className="specifications-add-button-container">
            <button
              onClick={() => toggleAddForm('sizes')}
              className="specifications-add-button"
              aria-label={showAddForm.sizes ? 'Cancel adding size' : 'Add new size'}
            >
              {showAddForm.sizes ? 'Cancel' : 'Add Size'}
            </button>
          </div>

          {showAddForm.sizes && (
            <div className="specifications-add-form">
              <h2 className="specifications-form-title">Add New Size</h2>
              <div className="specifications-form-group">
                <label htmlFor="new-size-name">Size Name</label>
                <input
                  id="new-size-name"
                  type="text"
                  value={newSpecForm.sizes.content}
                  onChange={(e) => handleNewFieldChange(e, 'sizes', 'content')}
                  className="specifications-form-input"
                  aria-label="Size Name"
                  required
                />
              </div>
              <div className="specifications-form-actions">
                <button
                  onClick={() => handleCreateSubmit('sizes')}
                  className="specifications-create-button"
                  aria-label="Create size"
                  disabled={loading}
                >
                  Create
                </button>
                <button
                  onClick={() => toggleAddForm('sizes')}
                  className="specifications-cancel-button"
                  aria-label="Cancel creating size"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {sizes.length === 0 && !showAddForm.sizes ? (
            <div className="specifications-empty" role="status">
              <p>No sizes found.</p>
              <button 
                className="specifications-continue-shopping-button"
                onClick={() => navigate('/')}
                aria-label="Continue shopping"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="specifications-table-container">
              <table className="specifications-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Size Name</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sizes.map((size, index) => (
                    <tr key={size._id} className="specifications-table-row">
                      <td>{index + 1}</td>
                      <td>
                        {editingSpecId === size._id ? (
                          <input
                            type="text"
                            value={editFormData.content}
                            onChange={(e) => handleEditFieldChange(e, 'content')}
                            className="specifications-form-input"
                            aria-label="Size Name"
                            required
                          />
                        ) : (
                          size.size_name || 'N/A'
                        )}
                      </td>
                      <td>
                        {editingSpecId === size._id ? (
                          <div className="specifications-action-buttons">
                            <button
                              onClick={() => handleUpdateSubmit('sizes', size._id)}
                              className="specifications-update-button"
                              aria-label={`Update size ${size._id}`}
                              disabled={loading || !editFormData.content}
                            >
                              Update
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="specifications-cancel-button"
                              aria-label={`Cancel editing size ${size._id}`}
                              disabled={loading}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="specifications-action-buttons">
                            <button
                              onClick={() => handleEdit('sizes', size)}
                              className="specifications-edit-button"
                              aria-label={`Edit size ${size._id}`}
                            >
                              Update
                            </button>
                            <button
                              onClick={() => deleteSpecification('sizes', size._id)}
                              className="specifications-delete-button"
                              aria-label={`Delete size ${size._id}`}
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
      )}
    </div>
  );
};

export default ProductSpecifications;