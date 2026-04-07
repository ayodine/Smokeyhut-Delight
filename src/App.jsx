import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';

// Prefetch products as early as possible
import { prefetchProducts } from './lib/productsCache';
prefetchProducts();

// Context
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { SettingsProvider } from './context/SettingsContext';

// Components
import Navbar from './components/Navbar';
import CartSidebar from './components/CartSidebar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';

// Storefront Pages
import Home from './pages/storefront/Home';
import Shop from './pages/storefront/Shop';
import CartPage from './pages/storefront/Cart';
import Checkout from './pages/storefront/Checkout';
import About from './pages/storefront/About';
import FAQ from './pages/storefront/FAQ';
import Contact from './pages/storefront/Contact';
import StoreRules from './pages/storefront/StoreRules';
import Privacy from './pages/storefront/Privacy';
import Refund from './pages/storefront/Refund';
import PaymentSuccess from './pages/storefront/PaymentSuccess';

// Dashboard Pages
import Login from './pages/dashboard/Login';
import ResetPassword from './pages/dashboard/ResetPassword';
import DashboardLayout from './pages/dashboard/Layout';
import Overview from './pages/dashboard/Overview';
import Orders from './pages/dashboard/Orders';
import Shipping from './pages/dashboard/Shipping';
import Payments from './pages/dashboard/Payments';
import Stores from './pages/dashboard/Stores';
import Products from './pages/dashboard/Products';
import Customers from './pages/dashboard/Customers';
import Staff from './pages/dashboard/Staff';
import Settings from './pages/dashboard/Settings';
import DeliveryZones from './pages/dashboard/DeliveryZones';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function StorefrontLayout() {
  const [cartOpen, setCartOpen] = useState(false);
  return (
    <>
      <Navbar onCartOpen={() => setCartOpen(true)} />
      <CartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      <Routes>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="about" element={<About />} />
        <Route path="faq" element={<FAQ />} />
        <Route path="contact" element={<Contact />} />
        <Route path="store-rules" element={<StoreRules />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="refund" element={<Refund />} />
        <Route path="payment/success" element={<PaymentSuccess />} />
      </Routes>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <ScrollToTop />
              <Routes>
                {/* Admin */}
                <Route path="/admin/login" element={<Login />} />
                <Route path="/admin/reset-password" element={<ResetPassword />} />
                <Route path="/admin" element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Overview />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="shipping" element={<Shipping />} />
                  <Route path="payments" element={<Payments />} />
                  <Route path="stores" element={<Stores />} />
                  <Route path="products" element={<Products />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="staff" element={<Staff />} />
                  <Route path="zones" element={<DeliveryZones />} />
                  <Route path="settings" element={<Settings />} />
                </Route>

                {/* Storefront */}
                <Route path="/*" element={<StorefrontLayout />} />
              </Routes>
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
