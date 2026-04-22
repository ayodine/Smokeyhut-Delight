import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';

// Prefetch products as early as possible
import { prefetchProducts } from './lib/productsCache';
prefetchProducts();

// Context
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { SettingsProvider } from './context/SettingsContext';

// Components (eager — needed for storefront shell)
import Navbar from './components/Navbar';
import CartSidebar from './components/CartSidebar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';

// Storefront Pages (eager — user-facing, prefetch already running)
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

// Dashboard Pages (lazy — only loaded when admin navigates to /admin)
const Login         = lazy(() => import('./pages/dashboard/Login'));
const ResetPassword = lazy(() => import('./pages/dashboard/ResetPassword'));
const DashboardLayout = lazy(() => import('./pages/dashboard/Layout'));
const Overview      = lazy(() => import('./pages/dashboard/Overview'));
const Orders        = lazy(() => import('./pages/dashboard/Orders'));
const Shipping      = lazy(() => import('./pages/dashboard/Shipping'));
const Payments      = lazy(() => import('./pages/dashboard/Payments'));
const Stores        = lazy(() => import('./pages/dashboard/Stores'));
const Products      = lazy(() => import('./pages/dashboard/Products'));
const Customers     = lazy(() => import('./pages/dashboard/Customers'));
const Staff         = lazy(() => import('./pages/dashboard/Staff'));
const Settings      = lazy(() => import('./pages/dashboard/Settings'));
const DeliveryZones = lazy(() => import('./pages/dashboard/DeliveryZones'));
const Coupons       = lazy(() => import('./pages/dashboard/Coupons'));
const SalesReport   = lazy(() => import('./pages/dashboard/finance/SalesReport'));
const Expenses      = lazy(() => import('./pages/dashboard/finance/Expenses'));
const Inventory     = lazy(() => import('./pages/dashboard/finance/Inventory'));
const ProductStats  = lazy(() => import('./pages/dashboard/ProductStats'));

function AdminLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border-subtle)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );
}

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
                {/* Admin (lazy-loaded) */}
                <Route path="/admin/login" element={<Suspense fallback={<AdminLoader />}><Login /></Suspense>} />
                <Route path="/admin/reset-password" element={<Suspense fallback={<AdminLoader />}><ResetPassword /></Suspense>} />
                <Route path="/admin" element={
                  <Suspense fallback={<AdminLoader />}>
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  </Suspense>
                }>
                  <Route index element={<Suspense fallback={null}><Overview /></Suspense>} />
                  <Route path="orders" element={<Suspense fallback={null}><Orders /></Suspense>} />
                  <Route path="shipping" element={<Suspense fallback={null}><Shipping /></Suspense>} />
                  <Route path="payments" element={<Suspense fallback={null}><Payments /></Suspense>} />
                  <Route path="stores" element={<Suspense fallback={null}><Stores /></Suspense>} />
                  <Route path="products" element={<Suspense fallback={null}><Products /></Suspense>} />
                  <Route path="products/stats" element={<Suspense fallback={null}><ProductStats /></Suspense>} />
                  <Route path="customers" element={<Suspense fallback={null}><Customers /></Suspense>} />
                  <Route path="staff" element={<Suspense fallback={null}><Staff /></Suspense>} />
                  <Route path="zones" element={<Suspense fallback={null}><DeliveryZones /></Suspense>} />
                  <Route path="coupons" element={<Suspense fallback={null}><Coupons /></Suspense>} />
                  <Route path="finance/sales" element={<Suspense fallback={null}><SalesReport /></Suspense>} />
                  <Route path="finance/expenses" element={<Suspense fallback={null}><Expenses /></Suspense>} />
                  <Route path="finance/inventory" element={<Suspense fallback={null}><Inventory /></Suspense>} />
                  <Route path="settings" element={<Suspense fallback={null}><Settings /></Suspense>} />
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
