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
import Coupons from './pages/dashboard/Coupons';
import SalesReport from './pages/dashboard/finance/SalesReport';
import Expenses from './pages/dashboard/finance/Expenses';

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
      <a
        href="https://wa.me/2348141748281"
        target="_blank"
        rel="noopener noreferrer"
        className="wa-bubble"
        aria-label="Chat with us on WhatsApp"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.523 5.847L.057 23.617a.5.5 0 0 0 .612.612l5.808-1.456A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.68-.498-5.22-1.37l-.374-.214-3.878.972.99-3.808-.234-.388A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
        </svg>
      </a>
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
                  <Route path="coupons" element={<Coupons />} />
                  <Route path="finance/sales" element={<SalesReport />} />
                  <Route path="finance/expenses" element={<Expenses />} />
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
