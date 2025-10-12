import React, { useState, useRef, useEffect, useContext, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Layout.css';
import gashLogo from '../assets/image/gash-logo.svg';

// Constants
const DROPDOWN_CLOSE_DELAY = 150;
const ERROR_TIMEOUT = 5000;

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
  const [error, setError] = useState(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Sidebar open by default for authenticated users

  // Refs
  const dropdownRef = useRef(null);
  const dropdownTimeoutRef = useRef(null);
  const sidebarRef = useRef(null);

  // Close dropdown on click outside
  useClickOutside(dropdownRef, useCallback(() => {
    clearTimeout(dropdownTimeoutRef.current);
    dropdownTimeoutRef.current = setTimeout(() => setIsDropdownOpen(false), DROPDOWN_CLOSE_DELAY);
  }, []));

  // Clear timeout on unmount
  useEffect(() => {
    return () => clearTimeout(dropdownTimeoutRef.current);
  }, []);

  // Close dropdown and reset error on route change
  useEffect(() => {
    setIsDropdownOpen(false);
    setError(null);
  }, [location.pathname]);

  // Keyboard navigation for dropdown only
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
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

  const handleLogoClick = useCallback(
    (e) => {
      e.preventDefault();
      navigate('/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [navigate]
  );

  const handleSidebarToggle = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  // Sidebar items with LineIcons
  const sidebarItems = useMemo(
    () => {
      const items = [
        { label: 'Cart', to: '/carts', icon: Unicons.UilShoppingCart },
        { label: 'Category', to: '/categories', icon: Unicons.UilListUl },
        { label: 'Order', to: '/orders', icon: Unicons.UilShoppingBag },
        { label: 'Feedback', to: '/feedbacks', icon: Unicons.UilCommentDots },
        { label: 'Product', to: '/products', icon: Unicons.UilBox },
        { label: 'Product Specification', to: '/specifications', icon: Unicons.UilFileInfoAlt },
        { label: 'Product Variant', to: '/variants', icon: Unicons.UilLayerGroup },
        { label: 'Import Bills', to: '/imports', icon: Unicons.UilFileImport },
        { label: 'Voucher', to: '/vouchers', icon: Unicons.UilTagAlt },
        { label: 'Notifications', to: '/notifications', icon: Unicons.UilBell },
        { label: 'Chat', to: '/chat', icon: Unicons.UilChat },
      ];
      if (user?.role === 'admin') {
        items.unshift(
          { label: 'Account', to: '/accounts', icon: Unicons.UilUsersAlt },
          { label: 'Statistics', to: '/statistics', icon: Unicons.UilChart }
        );
      }
      return items;
    },
    [user]
  );

  // Account sublist items
  const accountItems = useMemo(
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
      { label: 'Import Bills', to: '/imports' },
      { label: 'Statistics', to: '/statistics' },
    ],
    []
  );

  // Render sidebar only for authenticated routes (exclude /login)
  const showSidebar = user && !location.pathname.startsWith('/login');

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
          {/* Sidebar Toggle Button */}
          {showSidebar && (
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

          {/* Navigation Actions */}
          <div className="nav-actions">
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
      {showSidebar && (
        <aside
          className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}
          ref={sidebarRef}
          role="navigation"
          aria-label="Admin navigation"
        >
          <div className="sidebar-header">
            <h2>Admin Panel</h2>
          </div>
          <nav className="sidebar-nav">
            {sidebarItems.map((item, index) => (
              <Link
                key={index}
                to={item.to}
                className="sidebar-item"
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