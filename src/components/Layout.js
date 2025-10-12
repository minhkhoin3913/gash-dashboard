import React, { useState, useRef, useEffect, useContext, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import * as Unicons from '@iconscout/react-unicons';
import '../styles/Layout.css';
import gashLogo from '../assets/image/gash-logo.svg';

// Constants
const ERROR_TIMEOUT = 5000;

const Layout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  // State
  const [error, setError] = useState(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Event handlers
  const handleAccountClick = useCallback(() => {
    if (user) {
      setIsAccountOpen((prev) => !prev);
    } else {
      navigate('/login', { state: { from: location.pathname } });
    }
  }, [user, navigate, location.pathname]);

  const handleLogout = useCallback(async () => {
    try {
      setIsAccountOpen(false);
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
      navigate(user?.role === 'manager' ? '/orders' : '/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [navigate, user]
  );

  const handleSidebarToggle = useCallback(() => {
    setIsSidebarExpanded((prev) => !prev);
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
    () => [
      { label: 'My Account', to: '/profile' },
      { label: 'Sign Out', action: handleLogout, className: 'logout-item' },
    ],
    [handleLogout]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsAccountOpen(false);
        setIsSidebarExpanded(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset error and account sublist on route change
  useEffect(() => {
    setIsAccountOpen(false);
    setError(null);
  }, [location.pathname]);

  // User display name
  const userDisplayName = useMemo(() => {
    if (!user) return null;
    return user.username || user.email?.split('@')[0] || 'Account';
  }, [user]);

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
            to={user?.role === 'manager' ? '/orders' : '/'}
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
        </div>
      </nav>

      {/* Sidebar */}
      {user && ['admin', 'manager'].includes(user.role) && (
        <aside
          className={`sidebar ${isSidebarExpanded ? 'expanded' : 'collapsed'}`}
          role="navigation"
          aria-label="Admin navigation"
        >
          <nav className="sidebar-nav">
            {sidebarItems.map((item, index) => (
              <Link
                key={index}
                to={item.to}
                className="sidebar-item"
                onClick={() => setIsSidebarExpanded(false)}
                role="menuitem"
                title={item.label}
              >
                <item.icon size={24} />
                <span className="sidebar-item-label">{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-footer">
            {/* Account Button with Sublist */}
            <button
              className="sidebar-item"
              onClick={handleAccountClick}
              aria-expanded={isAccountOpen}
              aria-haspopup="true"
              type="button"
              title="Account"
            >
              <Unicons.UilUser size={24} />
              <span className="sidebar-item-label">{user ? userDisplayName : 'Sign In'}</span>
            </button>
            {user && isAccountOpen && (
              <div className="account-sublist">
                {accountItems.map((item, index) => (
                  item.to ? (
                    <Link
                      key={index}
                      to={item.to}
                      className={`sidebar-item sublist-item ${item.className || ''}`}
                      role="menuitem"
                      onClick={() => setIsAccountOpen(false)}
                    >
                      <span className="sublist-icon-placeholder" />
                      <span className="sidebar-item-label">{item.label}</span>
                    </Link>
                  ) : (
                    <button
                      key={index}
                      className={`sidebar-item sublist-item ${item.className || ''}`}
                      onClick={() => {
                        item.action();
                        setIsAccountOpen(false);
                      }}
                      type="button"
                      role="menuitem"
                    >
                      <span className="sublist-icon-placeholder" />
                      <span className="sidebar-item-label">{item.label}</span>
                    </button>
                  )
                ))}
              </div>
            )}
            {/* Extend/Collapse Button */}
            <button
              className="sidebar-item"
              onClick={handleSidebarToggle}
              aria-label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              type="button"
              title={isSidebarExpanded ? 'Collapse' : 'Expand'}
            >
              <Unicons.UilBars size={24} />
              <span className="sidebar-item-label">{isSidebarExpanded ? 'Collapse' : 'Expand'}</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main
        className={`main-content ${user && ['admin', 'manager'].includes(user.role) ? (isSidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed') : ''}`}
        role="main"
      >
        {children}
      </main>
    </div>
  );
};

export default Layout;