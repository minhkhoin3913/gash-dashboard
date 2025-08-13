import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "../styles/Statistics.css";
import axios from "axios";
import { Pie, Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { FaUsers, FaDollarSign, FaShoppingCart } from 'react-icons/fa';

// Register Chart.js components
ChartJS.register(
  ArcElement,
  BarElement,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// API client with interceptors
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000",
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message =
      status === 401
        ? "Unauthorized access - please log in"
        : status === 404
        ? "Resource not found"
        : status >= 500
        ? "Server error - please try again later"
        : "Network error - please check your connection";
    return Promise.reject({ ...error, message, skipRetry: status === 400 });
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
      if (i === retries - 1 || error.skipRetry) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, i))
      );
    }
  }
};

const formatStatusLabel = (status) => {
  const map = {
    shipped: 'Shipped',
    cancelled: 'Cancelled',
    confirmed: 'Confirmed',
    pending: 'Pending',
    delivered: 'Delivered',
    failed: 'Failed',
    unpaid: 'Unpaid',
    paid: 'Paid',
    not_shipped: 'Not Shipped',
    in_transit: 'In Transit',
    // fallback for unknown status
  };
  // Capitalize and replace underscores if not in map
  return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const Statistics = () => {
  const { user, isAuthLoading } = useContext(AuthContext);
  const [customerStats, setCustomerStats] = useState(null);
  const [revenueStats, setRevenueStats] = useState(null);
  const [orderStats, setOrderStats] = useState(null);
  const [revenueByWeek, setRevenueByWeek] = useState([]);
  const [revenueByMonth, setRevenueByMonth] = useState([]);
  const [revenueByYear, setRevenueByYear] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  // Filter states
  const [filters, setFilters] = useState({
    timePeriod: 'all', // Options: all, week, month, year
  });
  const [showFilters, setShowFilters] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch all statistics
  const fetchStatistics = useCallback(async () => {
    if (!user?._id) {
      setError("User not authenticated");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      // Fetch all statistics in parallel
      const [
        customerResponse,
        revenueResponse,
        orderResponse,
        weekResponse,
        monthResponse,
        yearResponse
      ] = await Promise.all([
        fetchWithRetry("/statistics/customers", { headers: { Authorization: `Bearer ${token}` } }),
        fetchWithRetry("/statistics/revenue", { headers: { Authorization: `Bearer ${token}` } }),
        fetchWithRetry("/statistics/orders", { headers: { Authorization: `Bearer ${token}` } }),
        fetchWithRetry("/statistics/revenue/week", { headers: { Authorization: `Bearer ${token}` } }),
        fetchWithRetry("/statistics/revenue/month", { headers: { Authorization: `Bearer ${token}` } }),
        fetchWithRetry("/statistics/revenue/year", { headers: { Authorization: `Bearer ${token}` } })
      ]);

      setCustomerStats(customerResponse);
      setRevenueStats(revenueResponse);
      setOrderStats(orderResponse);
      setRevenueByWeek(Array.isArray(weekResponse) ? weekResponse : []);
      setRevenueByMonth(Array.isArray(monthResponse) ? monthResponse : []);
      setRevenueByYear(Array.isArray(yearResponse) ? yearResponse : []);
    } catch (err) {
      setError(err.message || "Failed to load statistics");
      console.error("Fetch statistics error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Handle filter changes
  const handleFilterChange = useCallback((field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  // Clear filters
  const clearFilters = useCallback(() => {
    setFilters({ timePeriod: 'all' });
  }, []);

  // Toggle filter visibility
  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  // Handle authentication state
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user || !localStorage.getItem("token")) {
      navigate("/login", { replace: true });
    } else if (user && (user.role === 'admin' || user.role === 'manager')) {
      fetchStatistics();
    } else {
      setError("You do not have permission to view statistics");
    }
  }, [user, isAuthLoading, navigate, fetchStatistics]);

  // Retry fetching statistics
  const handleRetry = useCallback(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  // Only keep revenueStats, orderStats, revenueByWeek, revenueByMonth, revenueByYear
  // Helper: Get total completed (sold) orders
  const totalCompletedOrders = orderStats && Array.isArray(orderStats.statusCounts)
    ? (orderStats.statusCounts.find(s => s._id === 'delivered')?.count || 0)
    : 0;

  // Revenue Over Time Chart Data
  const weekChartData = {
    labels: revenueByWeek.map(item => item._id),
    datasets: [{
      label: 'Revenue (Week)',
      data: revenueByWeek.map(item => item.totalRevenue),
      borderColor: '#007600',
      backgroundColor: 'rgba(0, 118, 0, 0.2)',
      fill: true,
      tension: 0.4
    }]
  };
  const monthChartData = {
    labels: revenueByMonth.map(item => item._id),
    datasets: [{
      label: 'Revenue (Month)',
      data: revenueByMonth.map(item => item.totalRevenue),
      borderColor: '#007185',
      backgroundColor: 'rgba(0, 113, 133, 0.2)',
      fill: true,
      tension: 0.4
    }]
  };
  const yearChartData = {
    labels: revenueByYear.map(item => item._id),
    datasets: [{
      label: 'Revenue (Year)',
      data: revenueByYear.map(item => item.totalRevenue),
      borderColor: '#B12704',
      backgroundColor: 'rgba(177, 39, 4, 0.2)',
      fill: true,
      tension: 0.4
    }]
  };

  // Revenue Over Time Chart Options
  const revenueOverTimeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#0F1111' }
      },
      title: {
        display: true,
        text: `Revenue by ${filters.timePeriod.charAt(0).toUpperCase() + filters.timePeriod.slice(1)}`,
        color: '#0F1111',
        font: { size: 16 }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Revenue (₫)', color: '#0F1111' }
      },
      x: {
        title: {
          display: true,
          text: filters.timePeriod === 'week' ? 'Week Number' :
                filters.timePeriod === 'month' ? 'Month' :
                filters.timePeriod === 'year' ? 'Year' : 'Year',
          color: '#0F1111'
        }
      }
    }
  };

  // Render loading state
  if (isAuthLoading) {
    return (
      <div className="statistics-container">
        <div className="statistics-loading" role="status" aria-live="true">
          <div className="statistics-loading-spinner"></div>
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-container">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`statistics-toast ${
            toast.type === "success"
              ? "statistics-toast-success"
              : toast.type === "error"
              ? "statistics-toast-error"
              : "statistics-toast-info"
          }`}
          role="alert"
        >
          {toast.message}
        </div>
      )}

      {/* Summary Dashboard */}
      <div className="statistics-summary-dashboard">
        <div className="statistics-summary-card">
          <div className="statistics-summary-icon statistics-summary-orders"><FaShoppingCart /></div>
          <div className="statistics-summary-info">
            <div className="statistics-summary-label">Completed Orders</div>
            <div className="statistics-summary-value">{totalCompletedOrders}</div>
          </div>
        </div>
        <div className="statistics-summary-card">
          <div className="statistics-summary-icon statistics-summary-revenue"><FaDollarSign /></div>
          <div className="statistics-summary-info">
            <div className="statistics-summary-label">Total Revenue</div>
            <div className="statistics-summary-value">{revenueStats ? formatCurrency(revenueStats.totalRevenue) : '-'}</div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="statistics-error" role="alert" aria-live="true">
          <span className="statistics-error-icon">⚠</span>
          <span>{error}</span>
          <button
            className="statistics-retry-button"
            onClick={handleRetry}
            aria-label="Retry loading statistics"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="statistics-loading" role="status" aria-live="true">
          <div className="statistics-loading-spinner"></div>
          <p>Loading statistics...</p>
        </div>
      )}

      {/* Revenue Analytics */}
      {!loading && !error && (
        <div className="statistics-container-grid">
          <h2 className="statistics-section-title">Revenue Analytics</h2>
          <div className="statistics-section">
            {/* Revenue by Week */}
            <div className="statistics-card">
              <h3 className="statistics-card-title">Revenue by Week</h3>
              <div className="statistics-chart-container">
                {weekChartData.labels.length > 0 && (
                  <Line data={weekChartData} options={revenueOverTimeChartOptions} />
                )}
              </div>
              <div className="statistics-table-container">
                <table className="statistics-table">
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByWeek.map((item, idx) => (
                      <tr key={idx} className="statistics-table-row">
                        <td>{item._id}</td>
                        <td>{formatCurrency(item.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Revenue by Month */}
            <div className="statistics-card">
              <h3 className="statistics-card-title">Revenue by Month</h3>
              <div className="statistics-chart-container">
                {monthChartData.labels.length > 0 && (
                  <Line data={monthChartData} options={revenueOverTimeChartOptions} />
                )}
              </div>
              <div className="statistics-table-container">
                <table className="statistics-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByMonth.map((item, idx) => (
                      <tr key={idx} className="statistics-table-row">
                        <td>{item._id}</td>
                        <td>{formatCurrency(item.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Revenue by Year */}
            <div className="statistics-card">
              <h3 className="statistics-card-title">Revenue by Year</h3>
              <div className="statistics-chart-container">
                {yearChartData.labels.length > 0 && (
                  <Line data={yearChartData} options={revenueOverTimeChartOptions} />
                )}
              </div>
              <div className="statistics-table-container">
                <table className="statistics-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByYear.map((item, idx) => (
                      <tr key={idx} className="statistics-table-row">
                        <td>{item._id}</td>
                        <td>{formatCurrency(item.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Statistics;