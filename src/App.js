import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, AuthContext } from "./context/AuthContext";

// Import all existing components
import Products from "./components/Products";
import ProductVariants from "./components/ProductVariants";
import Login from "./components/Login";
import Profile from "./components/Profile";
import Carts from "./components/Carts";
import Orders from "./components/Orders";
import ProductSpecifications from "./components/ProductSpecifications";
import Accounts from "./components/Accounts";
import Categories from "./components/Categories";
import Feedbacks from "./components/Feedbacks";
import ImportBills from "./components/ImportBills";
import Statistics from "./components/Statistics";
import Layout from "./components/Layout";
import Vouchers from "./components/Vouchers";

// Import new Forgot Password components
import ForgotPassword from "./components/ForgotPassword";
import OTPVerification from "./components/OTPVerification";
import ResetPassword from "./components/ResetPassword";

// ✅ Import thêm chat component
import AdminChat from "./components/AdminChat";

// ===============================
// 🔒 ProtectedRoute (chặn người không có quyền)
// ===============================
const ProtectedRoute = ({ children }) => {
  const { user, isAuthLoading } = React.useContext(AuthContext);
  const location = useLocation();

  if (isAuthLoading) {
    return null; // hoặc spinner
  }

  if (!user || !["admin", "manager"].includes(user.role)) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
};

// ===============================
// 🧠 App Component
// ===============================
const App = () => {
  return (
    <Router>
      <AuthProvider>
        <Layout>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/otp-verification" element={<OTPVerification />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* === Protected Routes === */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Statistics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute>
                  <Products />
                </ProtectedRoute>
              }
            />
            <Route
              path="/feedbacks"
              element={
                <ProtectedRoute>
                  <Feedbacks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/statistics"
              element={
                <ProtectedRoute>
                  <Statistics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/imports"
              element={
                <ProtectedRoute>
                  <ImportBills />
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounts"
              element={
                <ProtectedRoute>
                  <Accounts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/specifications"
              element={
                <ProtectedRoute>
                  <ProductSpecifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/variants"
              element={
                <ProtectedRoute>
                  <ProductVariants />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/carts"
              element={
                <ProtectedRoute>
                  <Carts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/categories"
              element={
                <ProtectedRoute>
                  <Categories />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <Orders />
                </ProtectedRoute>
              }
            />

            {/* ✅ Vouchers */}
            <Route
              path="/vouchers"
              element={
                <ProtectedRoute>
                  <Vouchers />
                </ProtectedRoute>
              }
            />

            {/* ✅ Admin Chat */}
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <AdminChat />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Layout>
      </AuthProvider>
    </Router>
  );
};

export default App;