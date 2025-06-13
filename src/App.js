import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, AuthContext } from "./context/AuthContext";
// import Products from "./components/Products";
// import ProductVariants from "./components/ProductVariants";
import Login from "./components/Login";
// import Profile from "./components/Profile";
// import Carts from "./components/Carts";
import Orders from "./components/Orders";
// import ProductSpecifications from "./components/ProductSpecifications";
// import Accounts from "./components/Accounts";
// import Categories from "./components/Categories";
// import Feedbacks from "./components/Feedbacks";


import Layout from "./components/Layout";

// ProtectedRoute component to restrict access to admin/manager roles
const ProtectedRoute = ({ children }) => {
  const { user } = React.useContext(AuthContext);
  const location = useLocation();

  // Check if user is authenticated and has admin or manager role
  if (!user || !['admin', 'manager'].includes(user.role)) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* <Route
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
            /> */}
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <Orders />
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