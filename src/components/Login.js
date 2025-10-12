import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const usernameRef = useRef(null);

  // Focus username input on mount
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // Handle redirect after login
  const from = location.state?.from || '/';

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      usernameRef.current?.focus();
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      const errorMessage = err.response?.status === 401
        ? 'Invalid username or password'
        : 'Failed to sign in. Please try again.';
      setError(errorMessage);
      usernameRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  }, [username, password, login, navigate, from]);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    if (name === 'username') setUsername(value);
    if (name === 'password') setPassword(value);
    setError('');
  }, []);

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-title">Sign In</h1>
        {error && (
          <div className="login-error" id="error-message" role="alert">
            <span className="login-error-icon" aria-hidden="true">⚠</span>
            {error}
          </div>
        )}
        <form className="login-form" onSubmit={handleSubmit} aria-describedby={error ? 'error-message' : undefined}>
          <div className="login-form-group">
            <label htmlFor="username" className="login-form-label">Username</label>
            <input
              id="username"
              type="text"
              name="username"
              value={username}
              onChange={handleInputChange}
              ref={usernameRef}
              required
              className="login-form-input"
              aria-required="true"
              aria-invalid={!!error}
            />
          </div>
          <div className="login-form-group">
            <label htmlFor="password" className="login-form-label">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              value={password}
              onChange={handleInputChange}
              required
              className="login-form-input"
              aria-required="true"
              aria-invalid={!!error}
            />
          </div>
          <div className="login-forgot-password">
            <Link to="/forgot-password" className="login-forgot-password-link">
              Forgot Password?
            </Link>
          </div>
          <button
            type="submit"
            className="sign-in-button"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <span className="login-loading-spinner" aria-hidden="true" />
                Signing In...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
        <p className="login-signup-prompt">
          New to GASH?{' '}
          <Link to="/signup" className="login-signup-link">
            Create your GASH account
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;