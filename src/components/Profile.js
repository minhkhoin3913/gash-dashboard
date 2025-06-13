import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import '../styles/Profile.css';

const Profile = () => {
  const { user, logout } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    image: '',
    password: '',
    repeatPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const firstInputRef = useRef(null);

  const fetchProfile = useCallback(async (retries = 3, delay = 1000) => {
    if (!user) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:5000/accounts/${user._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(response.data);
      setFormData({
        username: response.data.username,
        name: response.data.name || '',
        email: response.data.email,
        phone: response.data.phone || '',
        address: response.data.address || '',
        image: response.data.image || '',
        password: '',
        repeatPassword: '',
      });
      setApiError('');
    } catch (err) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchProfile(retries - 1, delay * 2);
      }
      setApiError(err.response?.status === 404 ? 'Profile not found' : 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (editMode) firstInputRef.current?.focus();
  }, [editMode]);

  const validateForm = useCallback(() => {
    const newErrors = {};
    const { username, name, email, phone, address, image, password, repeatPassword } = formData;
    if (!username || username.length < 3 || username.length > 30) {
      newErrors.username = 'Username must be 3-30 characters';
    }
    if (!name || name.length > 50) {
      newErrors.name = 'Name cannot exceed 50 characters';
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      newErrors.email = 'Valid email is required';
    }
    if (!phone || !/^\d{10}$/.test(phone)) {
      newErrors.phone = 'Phone must be exactly 10 digits';
    }
    if (!address || address.length > 100) {
      newErrors.address = 'Address cannot exceed 100 characters';
    }
    if (image && !/^(http|https):\/\/[^ "]+$/.test(image)) {
      newErrors.image = 'Image must be a valid URL';
    }
    if (password && password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (password && password !== repeatPassword) {
      newErrors.repeatPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const updateProfile = useCallback(async () => {
    setLoading(true);
    try {
      const updateData = {
        username: formData.username,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        image: formData.image,
        ...(formData.password && { password: formData.password }),
      };
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `http://localhost:5000/accounts/${user._id}`,
        updateData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfile(response.data.account);
      setEditMode(false);
      setApiError('');
    } catch (err) {
      const errorMessage = err.response?.status === 409
        ? 'Username or email already exists'
        : err.response?.data?.errors?.[0]?.msg || 'Failed to update profile';
      setApiError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [formData, user]);

  const deleteAccount = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(`http://localhost:5000/accounts/${user._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      logout();
      navigate('/login');
    } catch (err) {
      setApiError(err.response?.status === 401 ? 'Unauthorized' : 'Failed to delete account');
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  }, [user, logout, navigate]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  }, []);

  const handleEdit = useCallback(() => {
    setEditMode(true);
    setApiError('');
  }, []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (validateForm()) {
      updateProfile();
    }
  }, [validateForm, updateProfile]);

  const handleCancel = useCallback(() => {
    setEditMode(false);
    setFormData({
      username: profile?.username || '',
      name: profile?.name || '',
      email: profile?.email || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      image: profile?.image || '',
      password: '',
      repeatPassword: '',
    });
    setErrors({});
    setApiError('');
  }, [profile]);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    deleteAccount();
  }, [deleteAccount]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
    setApiError('');
  }, []);

  if (!user) {
    return (
      <div className="profile-container">
        <div className="profile-error" role="alert">
          <span className="profile-error-icon" aria-hidden="true">⚠</span>
          Please sign in to view your profile.
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      {loading ? (
        <div className="profile-loading" role="status">
          <span className="profile-loading-spinner" aria-hidden="true"></span>
          Loading...
        </div>
      ) : apiError ? (
        <div className="profile-error" id="error-message" role="alert">
          <span className="profile-error-icon" aria-hidden="true">⚠</span>
          {apiError}
        </div>
      ) : profile ? (
        <div className="profile-box">
          <h1 className="profile-title">Your Profile</h1>
          {!editMode && (
            <div className="profile-main">
              {profile.image && (
                <div className="profile-image-section">
                  <img
                    src={profile.image}
                    alt={`${profile.username}'s profile picture`}
                    className="profile-image"
                    // onError={(e) => (e.target.style.display = 'none')}
                  />
                </div>
              )}
              <div className="profile-details">
                <p><strong>Username:</strong> {profile.username}</p>
                <p><strong>Name:</strong> {profile.name || 'N/A'}</p>
                <p><strong>Email:</strong> {profile.email}</p>
                <p><strong>Phone:</strong> {profile.phone || 'N/A'}</p>
                <p><strong>Address:</strong> {profile.address || 'N/A'}</p>
                <div className="profile-actions">
                  <button
                    className="edit-button"
                    onClick={handleEdit}
                    aria-label="Edit profile"
                  >
                    Edit Profile
                  </button>
                  <button
                    className="delete-button"
                    onClick={handleDeleteClick}
                    aria-label="Delete account"
                  >
                    Close Account
                  </button>
                </div>
              </div>
            </div>
          )}
          {editMode ? (
            <form className="profile-form" onSubmit={handleSubmit} aria-describedby={apiError ? 'error-message' : undefined}>
              {[
                { id: 'username', label: 'Username', type: 'text', required: true, maxLength: 30 },
                { id: 'name', label: 'Full Name', type: 'text', required: true, maxLength: 50 },
                { id: 'email', label: 'Email', type: 'email', required: true },
                { id: 'phone', label: 'Phone', type: 'text', required: true, maxLength: 10 },
                { id: 'address', label: 'Address', type: 'text', required: true, maxLength: 100 },
                { id: 'image', label: 'Profile Image URL (Optional)', type: 'text', required: false },
                { id: 'password', label: 'Password (leave blank to keep current)', type: 'password', required: false },
                { id: 'repeatPassword', label: 'Repeat Password', type: 'password', required: false },
              ].map((item) => (
                <div className="profile-form-group" key={item.id}>
                  <label htmlFor={item.id} className="profile-form-label">{item.label}</label>
                  <input
                    id={item.id}
                    type={item.type}
                    name={item.id}
                    value={formData[item.id]}
                    onChange={handleChange}
                    ref={item.id === 'username' ? firstInputRef : undefined}
                    required={item.required}
                    maxLength={item.maxLength}
                    className="profile-form-input"
                    aria-required={item.required}
                    aria-invalid={!!errors[item.id]}
                  />
                  {errors[item.id] && (
                    <div className="profile-field-error" aria-live="polite">{errors[item.id]}</div>
                  )}
                </div>
              ))}
              <div className="profile-form-actions">
                <button
                  type="submit"
                  className="update-button"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <span className="profile-loading-spinner" aria-hidden="true"></span>
                      Updating...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </button>
                <button
                  type="button"
                  className="cancel-button"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          {showDeleteConfirm && (
            <div className="confirmation-dialog" role="dialog" aria-labelledby="dialog-title">
              <div className="dialog-content">
                <h2 id="dialog-title" className="dialog-title">Confirm Account Deletion</h2>
                <p className="dialog-message">
                  Are you sure you want to permanently delete your Gash account? This action cannot be undone.
                </p>
                <div className="profile-dialog-actions">
                  <button
                    className="confirm-button"
                    onClick={handleDeleteConfirm}
                    disabled={loading}
                    aria-busy={loading}
                  >
                    {loading ? (
                      <>
                        <span className="profile-loading-spinner" aria-hidden="true"></span>
                        Deleting...
                      </>
                    ) : (
                      'Confirm'
                    )}
                  </button>
                  <button
                    className="cancel-button"
                    onClick={handleDeleteCancel}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="profile-no-profile" role="alert">
          <span className="profile-error-icon" aria-hidden="true">⚠</span>
          Profile not found
        </div>
      )}
    </div>
  );
};

export default Profile;