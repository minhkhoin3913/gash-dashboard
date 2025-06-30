import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Categories.css';
import axios from 'axios';

// API client with interceptors
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 10000,
});

apiClient.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const message = status === 401 ? 'Unauthorized access - please log in' :
                    status === 403 ? 'Access denied' :
                    status === 404 ? 'Category not found' :
                    status >= 500 ? 'Server error - please try again later' :
                    'Network error - please check your connection';
    return Promise.reject({ ...error, message });
  }
);

// Fetch with retry
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

const Categories = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [categories, setCategories] = useState([]);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editFormData, setEditFormData] = useState({ cat_name: '' });
  const [newCategoryForm, setNewCategoryForm] = useState({ cat_name: '' });
  const [showAddForm, setShowAddForm] = useState(false);
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

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    if (!user?._id) {
      setError('User not authenticated');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      const response = await fetchWithRetry('/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load categories');
      console.error('Fetch categories error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create category
  const createCategory = useCallback(async () => {
    setLoading(true);
    setError('');
    setToast(null);

    const { cat_name } = newCategoryForm;
    if (!cat_name) {
      setError('Category name is required');
      setLoading(false);
      return;
    }
    if (cat_name.length > 50) {
      setError('Category name cannot exceed 50 characters');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.post('/categories', { cat_name }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(prev => [...prev, response.data.category]);
      setToast({ type: 'success', message: 'Category created successfully' });
      setNewCategoryForm({ cat_name: '' });
      setShowAddForm(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create category');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to create category' });
      console.error('Create category error:', err);
    } finally {
      setLoading(false);
    }
  }, [newCategoryForm]);

  // Update category
  const updateCategory = useCallback(async (categoryId) => {
    setLoading(true);
    setError('');
    setToast(null);

    const { cat_name } = editFormData;
    if (!cat_name) {
      setError('Category name is required');
      setLoading(false);
      return;
    }
    if (cat_name.length > 50) {
      setError('Category name cannot exceed 50 characters');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.put(`/categories/${categoryId}`, { cat_name }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(prev =>
        prev.map(category =>
          category._id === categoryId ? response.data.category : category
        )
      );
      setToast({ type: 'success', message: 'Category updated successfully' });
      setEditingCategoryId(null);
      setEditFormData({ cat_name: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update category');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to update category' });
      console.error('Update category error:', err);
    } finally {
      setLoading(false);
    }
  }, [editFormData]);

  // Delete category
  const deleteCategory = useCallback(async (categoryId) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;

    setLoading(true);
    setError('');
    setToast(null);

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/categories/${categoryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(prev => prev.filter(category => category._id !== categoryId));
      setToast({ type: 'success', message: 'Category deleted successfully' });
      if (editingCategoryId === categoryId) setEditingCategoryId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete category');
      setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete category' });
      console.error('Delete category error:', err);
    } finally {
      setLoading(false);
    }
  }, [editingCategoryId]);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && !localStorage.getItem('token')) {
      navigate('/login', { replace: true });
    } else if (user) {
      fetchCategories();
    }
  }, [user, isAuthLoading, navigate, fetchCategories]);

  // Start editing category
  const handleEditCategory = useCallback((category) => {
    setEditingCategoryId(category._id);
    setEditFormData({ cat_name: category.cat_name });
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingCategoryId(null);
    setEditFormData({ cat_name: '' });
  }, []);

  // Handle field change
  const handleFieldChange = useCallback((e, formType) => {
    const value = e.target.value;
    if (formType === 'edit') {
      setEditFormData(prev => ({ ...prev, cat_name: value }));
    } else {
      setNewCategoryForm(prev => ({ ...prev, cat_name: value }));
    }
  }, []);

  // Submit handlers
  const handleUpdateSubmit = useCallback((categoryId) => {
    updateCategory(categoryId);
  }, [updateCategory]);

  const handleCreateSubmit = useCallback(() => {
    createCategory();
  }, [createCategory]);

  // Toggle add form
  const toggleAddForm = useCallback(() => {
    setShowAddForm(prev => !prev);
    setNewCategoryForm({ cat_name: '' });
    setError('');
  }, []);

  // Retry fetching data
  const handleRetry = useCallback(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Loading state during auth verification
  if (isAuthLoading) {
    return (
      <div className="categories-container">
        <div className="categories-loading" role="status" aria-live="polite">
          <div className="categories-progress-bar"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="categories-container">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`categories-toast ${toast.type === 'success' ? 'categories-toast-success' : 'categories-toast-error'}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </div>
      )}

      <h1 className="categories-title">Category Management</h1>

      {/* Add Category Button (Admin/Manager) */}
      {(user?.role === 'admin' || user?.role === 'manager') && (
        <div className="categories-add-button-container">
          <button
            onClick={toggleAddForm}
            className="categories-add-button"
            aria-label={showAddForm ? 'Cancel adding category' : 'Add new category'}
          >
            {showAddForm ? 'Cancel' : 'Add Category'}
          </button>
        </div>
      )}

      {/* Add Category Form (Admin/Manager only) */}
      {(user?.role === 'admin' || user?.role === 'manager') && showAddForm && (
        <div className="categories-add-form">
          <h2 className="categories-form-title">Add New Category</h2>
          <div className="categories-form-group">
            <label htmlFor="new-cat-name">Category Name</label>
            <input
              id="new-cat-name"
              type="text"
              value={newCategoryForm.cat_name}
              onChange={(e) => handleFieldChange(e, 'new')}
              className="categories-form-input"
              aria-label="Category name"
              required
            />
          </div>
          <div className="categories-form-actions">
            <button
              onClick={handleCreateSubmit}
              className="categories-create-button"
              aria-label="Create category"
              disabled={loading}
            >
              Create
            </button>
            <button
              onClick={toggleAddForm}
              className="categories-cancel-button"
              aria-label="Cancel creating category"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="categories-error" role="alert" aria-live="assertive">
          <span className="categories-error-icon">⚠</span>
          <span>{error}</span>
          <button 
            className="categories-retry-button" 
            onClick={handleRetry}
            aria-label="Retry loading categories"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="categories-loading" role="status" aria-live="polite">
          <div className="categories-progress-bar"></div>
          <p>Loading categories...</p>
        </div>
      )}

      {/* Categories Table */}
      {!loading && categories.length === 0 && !error ? (
        <div className="categories-empty" role="status">
          <p>No categories found.</p>
          <button 
            className="categories-continue-shopping-button"
            onClick={() => navigate('/')}
            aria-label="Continue shopping"
          >
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="categories-table-container">
          <table className="categories-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Category Name</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category, index) => (
                <tr key={category._id} className="categories-table-row">
                  <td>{index + 1}</td>
                  <td>
                    {editingCategoryId === category._id ? (
                      <input
                        type="text"
                        value={editFormData.cat_name}
                        onChange={(e) => handleFieldChange(e, 'edit')}
                        className="categories-form-input"
                        aria-label="Category name"
                        required
                      />
                    ) : (
                      category.cat_name || 'N/A'
                    )}
                  </td>
                  <td>
                    {editingCategoryId === category._id ? (
                      <div className="categories-action-buttons">
                        <button
                          onClick={() => handleUpdateSubmit(category._id)}
                          className="categories-update-button"
                          aria-label={`Update category ${category._id}`}
                          disabled={loading || !editFormData.cat_name}
                        >
                          Update
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="categories-cancel-button"
                          aria-label={`Cancel editing category ${category._id}`}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="categories-action-buttons">
                        {(user?.role === 'admin' || user?.role === 'manager') && (
                          <button
                            onClick={() => handleEditCategory(category)}
                            className="categories-edit-button"
                            aria-label={`Edit category ${category._id}`}
                          >
                            Update
                          </button>
                        )}
                        {(user?.role === 'admin' || user?.role === 'manager') && (
                          <button
                            onClick={() => deleteCategory(category._id)}
                            className="categories-delete-button"
                            aria-label={`Delete category ${category._id}`}
                          >
                            Delete
                          </button>
                        )}
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

export default Categories;