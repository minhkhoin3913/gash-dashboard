import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import emailjs from '@emailjs/browser';
import '../styles/Login.css';

// Initialize EmailJS with environment variables
if (!process.env.REACT_APP_EMAILJS_PUBLIC_KEY) {
  console.error("EmailJS Public Key is missing. Please check .env file.");
} else {
  emailjs.init(process.env.REACT_APP_EMAILJS_PUBLIC_KEY);
  console.log(
    "EmailJS initialized with Public Key:",
    process.env.REACT_APP_EMAILJS_PUBLIC_KEY
  );
}

const OTPVerification = () => {
  const [otp, setOTP] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { verifyOTP } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const otpRef = useRef(null);

  const { email, type, formData } = location.state || {};

  useEffect(() => {
    if (!email || !type) {
      navigate(type === 'forgot-password' ? '/forgot-password' : '/signup');
    }
    otpRef.current?.focus();
  }, [email, type, navigate]);

  useEffect(() => {
    if (error || success) {
      const timeout = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [error, success]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        setError('Please enter a valid 6-digit OTP');
        setSuccess('');
        otpRef.current?.focus();
        return;
      }

      setIsLoading(true);
      try {
        if (type === 'register') {
          await verifyOTP(email, otp, formData, 'register');
          navigate('/register', { state: { email, formData } });
        } else if (type === 'forgot-password') {
          await verifyOTP(email, otp, null, 'forgot-password');
          navigate('/reset-password', { state: { email, otp } });
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Invalid or expired OTP');
        setSuccess('');
        otpRef.current?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [otp, email, type, formData, verifyOTP, navigate]
  );

  const handleInputChange = useCallback((e) => {
    setOTP(e.target.value);
    setError('');
    setSuccess('');
  }, []);

  const handleResendOTP = useCallback(
    async () => {
      setIsLoading(true);
      setError('');
      setSuccess('');
      try {
        const response = await verifyOTP(email, null, formData, type, true);
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
        console.log('EmailJS Success (Resend):', emailjsResponse);

        setSuccess(
          type === 'forgot-password'
            ? 'A new OTP for password reset has been sent to your email.'
            : 'A new OTP has been sent to your email.'
        );
        setOTP('');
        otpRef.current?.focus();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to resend OTP');
        console.error('Error resending OTP:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [email, formData, type, verifyOTP]
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
      {success && (
        <div
          className="login-toast login-toast-success"
          role="alert"
          id="success-message"
          tabIndex={0}
        >
          <span className="login-error-icon" aria-hidden="true">✓</span>
          {success}
        </div>
      )}
      <div className="login-box">
        <h1 className="login-title">Verify OTP</h1>
        <p style={{ fontSize: '0.875rem', color: '#565959', marginBottom: '16px', textAlign: 'center' }}>
          Enter the 6-digit OTP sent to {email} to{' '}
          {type === 'forgot-password' ? 'reset your password' : 'verify your email'}.
        </p>
        <form
          className="login-form"
          onSubmit={handleSubmit}
          aria-describedby={error ? 'error-message' : success ? 'success-message' : undefined}
        >
          <div className="login-form-group">
            <label htmlFor="otp" className="login-form-label">
              OTP <span className="login-required-indicator">*</span>
            </label>
            <input
              id="otp"
              type="text"
              name="otp"
              value={otp}
              onChange={handleInputChange}
              ref={otpRef}
              required
              maxLength={6}
              className="login-form-input"
              aria-required="true"
              aria-invalid={!!error}
            />
          </div>
          <button
            type="submit"
            className="sign-in-button"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Verifying...' : 'Verify OTP'}
          </button>
        </form>
        <p className="login-signup-prompt">
          Didn't receive an OTP?{' '}
          <button
            type="button"
            className="login-signup-link"
            onClick={handleResendOTP}
            disabled={isLoading}
          >
            Resend OTP
          </button>
        </p>
      </div>
    </div>
  );
};

export default OTPVerification;