import React, { useState, useRef, useEffect, useContext, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Layout.css';
import gashLogo from '../assets/image/gash-logo.svg';

// Constants
const DROPDOWN_CLOSE_DELAY = 150;
const SEARCH_DEBOUNCE_DELAY = 300;
const ERROR_TIMEOUT = 5000;

// Custom hooks
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const useClickOutside = (ref, callback) => {
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, callback]);
};

const Layout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  // State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Refs
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const dropdownTimeoutRef = useRef(null);
  const sidebarRef = useRef(null);

  // Debounced search
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_DELAY);

  // Close dropdown and sidebar on click outside
  useClickOutside(dropdownRef, useCallback(() => {
    clearTimeout(dropdownTimeoutRef.current);
    dropdownTimeoutRef.current = setTimeout(() => setIsDropdownOpen(false), DROPDOWN_CLOSE_DELAY);
  }, []));

  useClickOutside(sidebarRef, useCallback(() => {
    setIsSidebarOpen(false);
  }, []));

  // Clear timeout on unmount
  useEffect(() => {
    return () => clearTimeout(dropdownTimeoutRef.current);
  }, []);

  // Close dropdown, sidebar, and reset error on route change
  useEffect(() => {
    setIsDropdownOpen(false);
    setIsSidebarOpen(false);
    setError(null);
  }, [location.pathname]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
        setIsSidebarOpen(false);
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // User display name
  const userDisplayName = useMemo(() => {
    if (!user) return null;
    return user.username || user.email?.split('@')[0] || 'Account';
  }, [user]);

  // Event handlers
  const handleAccountClick = useCallback(() => {
    if (user) {
      setIsDropdownOpen((prev) => !prev);
    } else {
      navigate('/login', { state: { from: location.pathname } });
    }
  }, [user, navigate, location.pathname]);

  const handleLogout = useCallback(async () => {
    try {
      setIsDropdownOpen(false);
      await logout();
      navigate('/orders');
    } catch (err) {
      console.error('Logout error:', err);
      setError('Failed to sign out. Please try again.');
      setTimeout(() => setError(null), ERROR_TIMEOUT);
    }
  }, [logout, navigate]);

  const handleSearchSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!searchQuery.trim()) {
        setError('Please enter a search term.');
        setTimeout(() => setError(null), ERROR_TIMEOUT);
        return;
      }

      setIsSearching(true);
      try {
        const searchParams = new URLSearchParams({ q: searchQuery.trim() });
        navigate(`/products?${searchParams.toString()}`);
        searchInputRef.current?.blur();
      } catch (err) {
        console.error('Search error:', err);
        setError('Search failed. Please try again.');
        setTimeout(() => setError(null), ERROR_TIMEOUT);
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery, navigate]
  );

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleLogoClick = useCallback(
    (e) => {
      e.preventDefault();
      navigate('/orders');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [navigate]
  );

  const handleSidebarToggle = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  // Clear search on non-products pages
  useEffect(() => {
    if (!location.pathname.includes('/products')) {
      setSearchQuery('');
    }
  }, [location.pathname]);

  // Focus search input on '/'
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Dropdown items
  const dropdownItems = useMemo(
    () => [
      { label: 'My Account', to: '/profile' },
      { label: 'Sign Out', action: handleLogout, className: 'logout-item' },
    ],
    [handleLogout]
  );

  // Sidebar items
  const sidebarItems = useMemo(
    () => [
      { label: 'Account', to: '/accounts' },
      { label: 'Cart', to: '/carts' },
      { label: 'Category', to: '/categories' },
      { label: 'Order', to: '/orders' },
      { label: 'Feedback', to: '/feedbacks' },
      { label: 'Product', to: '/products' },
      { label: 'Product Specification', to: '/specifications' },
      { label: 'Product Variant', to: '/variants' },
    ],
    []
  );

  return (
    <div className="layout">
      {/* Error notification */}
      {error && (
        <div className="layout-error-notification" role="alert">
          <span className="layout-error-icon" aria-hidden="true">⚠</span>
          <span>{error}</span>
          <button
            className="layout-error-close"
            onClick={() => setError(null)}
            type="button"
            aria-label="Close error notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Bar */}
      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <div className="navbar-container">
          {/* Logo */}
          <Link
            to="/"
            className="logo"
            onClick={handleLogoClick}
            aria-label="Gash homepage"
          >
            {logoLoaded ? null : <span style={{ fontSize: '0.875rem', color: 'var(--amazon-bg)' }}>Gash</span>}
            <img
              src={gashLogo}
              alt="Gash Logo"
              onLoad={() => setLogoLoaded(true)}
              onError={(e) => {
                e.target.style.display = 'none';
                setLogoLoaded(false);
                console.warn('Logo failed to load');
              }}
              style={{ display: logoLoaded ? 'block' : 'none' }}
            />
          </Link>

          {/* Search Bar */}
          <form className="search-bar" onSubmit={handleSearchSubmit} role="search">
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search products..."
              value={searchQuery}
              onChange={handleSearchChange}
              disabled={isSearching}
              aria-label="Search products"
              autoComplete="off"
            />
            <button
              type="submit"
              className="search-button"
              disabled={isSearching || !searchQuery.trim()}
              aria-label={isSearching ? 'Searching' : 'Search'}
            >
              {isSearching ? (
                <span className="search-loading-spinner" aria-hidden="true" />
              ) : (
                '🔍'
              )}
            </button>
          </form>

          {/* Navigation Actions */}
          <div className="nav-actions">
            {/* Sidebar Toggle Button (visible on mobile) */}
            {user && ['admin', 'manager'].includes(user.role) && (
              <button
                className="nav-button sidebar-toggle"
                onClick={handleSidebarToggle}
                aria-expanded={isSidebarOpen}
                aria-label="Toggle admin sidebar"
                type="button"
              >
                ☰
              </button>
            )}

            {/* Account Menu */}
            <div className="account-menu" ref={dropdownRef}>
              <button
                className="nav-button account"
                onClick={handleAccountClick}
                aria-expanded={isDropdownOpen}
                aria-haspopup="true"
                type="button"
              >
                {user ? (
                  <>
                    {`${userDisplayName}`}
                  </>
                ) : (
                  'Hello, Sign In'
                )}
              </button>
              {user && isDropdownOpen && (
                <div className="dropdown" role="menu">
                  {dropdownItems.map((item, index) => (
                    item.to ? (
                      <Link
                        key={index}
                        to={item.to}
                        className={`dropdown-item ${item.className || ''}`}
                        role="menuitem"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        key={index}
                        className={`dropdown-item ${item.className || ''}`}
                        onClick={() => {
                          item.action();
                          setIsDropdownOpen(false);
                        }}
                        type="button"
                        role="menuitem"
                      >
                        {item.label}
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Admin Sidebar */}
      {user && ['admin', 'manager'].includes(user.role) && (
        <aside
          className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}
          ref={sidebarRef}
          role="navigation"
          aria-label="Admin navigation"
        >
          <div className="sidebar-header">
            <h2>Admin Panel</h2>
            <button
              className="sidebar-close"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close sidebar"
              type="button"
            >
              ×
            </button>
          </div>
          <nav className="sidebar-nav">
            {sidebarItems.map((item, index) => (
              <Link
                key={index}
                to={item.to}
                className="sidebar-item"
                onClick={() => setIsSidebarOpen(false)}
                role="menuitem"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
      )}

      {/* Main Content */}
      <main className="main-content" role="main">
        {children}
      </main>
    </div>
  );
};

export default Layout;