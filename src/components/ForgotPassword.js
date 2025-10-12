import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import emailjs from '@emailjs/browser';
import '../styles/Login.css';

// Initialize EmailJS with environment variables (assumes REACT_APP_EMAILJS_PUBLIC_KEY is set)
const publicKey = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;

if (!publicKey) {
  console.error('EmailJS Public Key is missing. Please check .env file.');
} else {
  emailjs.init(publicKey);
  console.log('EmailJS initialized with Public Key:', publicKey);
}

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { requestSignupOTP } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  const handleChange = useCallback((e) => {
    setEmail(e.target.value);
    setError('');
  }, []);

  const validateEmail = useCallback(() => {
    if (!email.trim()) return 'Email is required';
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Please enter a valid email address';
    return '';
  }, [email]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const validationError = validateEmail();
      if (validationError) {
        setError(validationError);
        emailRef.current?.focus();
        return;
      }

      setIsLoading(true);
      try {
        const response = await requestSignupOTP(email, 'forgot-password');
        const { otp } = response.data;

        const templateParams = {
          to_email: email.trim(),
          otp: otp,
        };

        if (!templateParams.to_email) {
          throw new Error('Recipient email is empty');
        }
        if (!templateParams.otp) {
          throw new Error('OTP is missing');
        }

        const emailjsResponse = await emailjs.send(
          process.env.REACT_APP_EMAILJS_SERVICE_ID,
          process.env.REACT_APP_EMAILJS_TEMPLATE_ID,
          templateParams
        );
        console.log('EmailJS Success:', emailjsResponse);

        navigate('/otp-verification', {
          state: { email, type: 'forgot-password' },
        });
      } catch (err) {
        console.error('Error:', err.status, err.text || err.message);
        if (err.status === 422) {
          setError('Failed to send OTP: Invalid email configuration. Please check your email and try again.');
        } else if (err.response?.data?.message) {
          setError(err.response.data.message);
        } else {
          setError(err.message || 'Failed to send OTP. Please try again.');
        }
        emailRef.current?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [email, requestSignupOTP, navigate, validateEmail]
  );

  return (
    <div className="login-container">
      {error && (
        <div
          className="login-error"
          role="alert"
          id="error-message"
          tabIndex={0}
        >
          <span className="login-error-icon" aria-hidden="true">⚠</span>
          {error}
        </div>
      )}
      <div className="login-box">
        <h1 className="login-title">Reset Your Password</h1>
        <p style={{ fontSize: '0.875rem', color: '#565959', marginBottom: '16px', textAlign: 'center' }}>
          Enter your email address to receive a password reset OTP.
        </p>
        <form
          className="login-form"
          onSubmit={handleSubmit}
          aria-describedby={error ? 'error-message' : undefined}
          aria-label="Forgot Password form"
        >
          <div className="login-form-group">
            <label htmlFor="email" className="login-form-label">
              Email <span className="login-required-indicator">*</span>
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={email}
              onChange={handleChange}
              ref={emailRef}
              required
              className="login-form-input"
              aria-required="true"
              aria-invalid={!!error}
              placeholder="Enter your email"
            />
          </div>
          <button
            type="submit"
            className="sign-in-button"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            <span aria-live="polite">
              {isLoading ? 'Sending OTP...' : 'Continue'}
            </span>
          </button>
        </form>
        <p className="login-signup-prompt">
          Remember your password?{' '}
          <Link to="/login" className="login-signup-link">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;