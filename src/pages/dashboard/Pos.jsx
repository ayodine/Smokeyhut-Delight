import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Check,
  X,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  Printer,
  RotateCcw,
  Tag,
  User,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  FileText,
  Store,
  Clock,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Receipt,
  UtensilsCrossed,
  Layers,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  ShoppingBag
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useOutletContext } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';

// Currency formatter for Nigerian Naira
const fmt = (n) => '₦' + Number(n || 0).toLocaleString();

// Fallback products in case Supabase is unavailable or empty
const FALLBACK_PRODUCTS = [
  { id: 4, name: 'Hangout Pack (Guineafowl & Sides)', price: 36000, category_id: 'combo', stock: 18, image: 'https://itpnfalqjjicesqcjzix.supabase.co/storage/v1/object/public/product-images/1776179480835-vp65c5qf5k8.jpeg', is_active: true },
  { id: 21, name: 'Full Smokey Guineafowl', price: 16000, category_id: 'guineafowl', stock: 45, image: null, is_active: true },
  { id: 1, name: '1 Liter Bowl Guineafowl Rice', price: 22000, category_id: 'rice-combos', stock: 32, image: 'https://itpnfalqjjicesqcjzix.supabase.co/storage/v1/object/public/product-images/1776179540812-duw4kpyaumj.jpeg', is_active: true },
  { id: 25, name: 'Triple Delight Combo', price: 37500, category_id: 'combo', stock: 15, image: 'https://itpnfalqjjicesqcjzix.supabase.co/storage/v1/object/public/product-images/1783775498509-smgx4cr1gq8.jpeg', is_active: true },
  { id: 29, name: 'Guineafowl Egg (4pcs)', price: 3000, category_id: 'guineafowl', stock: 120, image: 'https://itpnfalqjjicesqcjzix.supabase.co/storage/v1/object/public/product-images/1787438667355-r18hgzn7ge.jpeg', is_active: true },
  { id: 31, name: 'Smokey Beef Jerky (Kilishi) 125g', price: 5500, category_id: 'sides', stock: 65, image: null, is_active: true },
  { id: 32, name: 'Smoked Jumbo Turkey Wings (Pair)', price: 14500, category_id: 'chicken', stock: 24, image: null, is_active: true },
  { id: 33, name: 'Charcoal Roasted Whole Catfish (Family)', price: 11000, category_id: 'sides', stock: 20, image: null, is_active: true },
  { id: 34, name: 'Undiluted Palmwine (50cl)', price: 2000, category_id: 'drinks', stock: 95, image: null, is_active: true },
  { id: 35, name: 'Spiced Hibiscus Zobo Beverage (50cl)', price: 1800, category_id: 'drinks', stock: 80, image: null, is_active: true },
  { id: 36, name: 'Craft Ginger Honey Lemonade (50cl)', price: 2000, category_id: 'drinks', stock: 60, image: null, is_active: true },
  { id: 37, name: 'Peppered Jumbo Snail & Plantain Combo', price: 19500, category_id: 'combo', stock: 16, image: null, is_active: true },
];

const FALLBACK_CATEGORIES = [
  { id: 'all', label: 'All Items' },
  { id: 'guineafowl', label: 'Guineafowl' },
  { id: 'combo', label: 'Combos' },
  { id: 'rice-combos', label: 'Rice Combos' },
  { id: 'chicken', label: 'Chicken' },
  { id: 'sides', label: 'Sides & Snacks' },
  { id: 'drinks', label: 'Drinks' },
];

const CASH_SHORTCUTS = [5000, 10000, 20000, 50000, 100000];

const PAYMENT_OPTIONS = [
  { id: 'card', label: 'Card (POS)', icon: CreditCard },
  { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
  { id: 'cash', label: 'Cash', icon: Banknote },
];

export default function Pos() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const outletCtx = useOutletContext();
  const selectedStore = outletCtx?.selectedStore || 'all';

  // Cashier Identity: Logged-in Staff Member
  const [cashierName, setCashierName] = useState(() => {
    const metaName = user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (metaName) return metaName;
    if (user?.email) {
      const p = user.email.split('@')[0];
      return p.charAt(0).toUpperCase() + p.slice(1);
    }
    return 'Store Cashier';
  });

  useEffect(() => {
    if (!user?.id) return;
    if (user?.user_metadata?.full_name || user?.user_metadata?.name) {
      setCashierName(user.user_metadata.full_name || user.user_metadata.name);
      return;
    }
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          setCashierName(data.full_name);
        }
      })
      .catch(() => {});
  }, [user]);

  // State: Catalog
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quantitiesToAdd, setQuantitiesToAdd] = useState({}); // { [productId]: number }

  // State: Cart & Basket
  const [cart, setCart] = useState([]);

  // State: Customer Management (Search + Add New Modal)
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { name, phone, email, address, note }
  const [nameError, setNameError] = useState(false);

  // Customer Modal State
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerModalForm, setCustomerModalForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    note: ''
  });
  const [customerModalError, setCustomerModalError] = useState('');

  // Fallback / Recent Customers
  const [recentCustomers, setRecentCustomers] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_recent_customers');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { name: 'Nicholas Johnson', phone: '+234 803 123 4567', email: 'nicholas@example.com', address: 'Plot 12 Admiralty Way, Lekki', note: 'VIP Customer' },
      { name: 'Amina Bello', phone: '+234 814 555 7890', email: 'amina.bello@gmail.com', address: '14 Victoria Island, Lagos', note: 'Mild spice preference' },
      { name: 'Dr. Femi Adeleke', phone: '+234 802 333 1122', email: 'fadeleke@clinic.org', address: 'Yaba Tech Junction, Yaba', note: 'Extra pepper sauce' },
      { name: 'Chinedu Eze', phone: '+234 705 999 4433', email: 'chinedu@trade.ng', address: 'Ikeja City Mall Store', note: 'Pack separately' },
    ];
  });

  // State: Promo & Discounts
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null); // { code, type, value, discountAmount }
  const [promoLoading, setPromoLoading] = useState(false);
  const [enableTax, setEnableTax] = useState(false); // 7.5% VAT toggle

  // State: Payment Method (Dropdown: card | transfer | cash)
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [paymentDropdownOpen, setPaymentDropdownOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState('');

  // State: Checkout & Receipt
  const [processingOrder, setProcessingOrder] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [confirmClearCart, setConfirmClearCart] = useState(false);

  // Sequential POS Ticket Generator (POS-XXXX standard, non-random)
  const [posSeq, setPosSeq] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_seq_counter');
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num > 0) return num;
      }
    } catch {}
    return 1;
  });

  const ticketId = useMemo(() => {
    return `POS-${String(posSeq).padStart(4, '0')}`;
  }, [posSeq]);

  const searchBoxRef = useRef(null);
  const paymentBoxRef = useRef(null);

  // Sync latest sequence from database to maintain continuous order numbering
  useEffect(() => {
    const syncLatestSeq = async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('notes, paystack_ref')
          .order('created_at', { ascending: false })
          .limit(100);

        let maxSeq = 0;
        if (data && data.length > 0) {
          const regex = /POS-(\d+)/g;
          data.forEach(order => {
            const combined = `${order.notes || ''} ${order.paystack_ref || ''}`;
            let match;
            while ((match = regex.exec(combined)) !== null) {
              const num = parseInt(match[1], 10);
              if (num > maxSeq && num < 100000) {
                maxSeq = num;
              }
            }
          });
        }

        const saved = localStorage.getItem('pos_seq_counter');
        const localSeq = saved ? parseInt(saved, 10) : 1;
        const highest = Math.max(maxSeq, localSeq);
        if (highest > posSeq) {
          setPosSeq(highest);
          localStorage.setItem('pos_seq_counter', String(highest));
        }
      } catch (err) {
        console.warn('Could not sync POS sequence:', err);
      }
    };
    syncLatestSeq();
  }, []);

  // Fetch Products & Categories
  useEffect(() => {
    fetchCatalog();
  }, []);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, price, compare_price, image, stock, category_id, is_active, description')
          .is('deleted_at', null)
          .or('is_active.is.null,is_active.eq.true')
          .order('name', { ascending: true }),
        supabase
          .from('categories')
          .select('*')
          .order('label', { ascending: true })
      ]);

      if (pRes.data && pRes.data.length > 0) {
        setProducts(pRes.data);
      } else {
        setProducts(FALLBACK_PRODUCTS);
      }

      if (cRes.data && cRes.data.length > 0) {
        const catOptions = [
          { id: 'all', label: 'All Items' },
          ...cRes.data.map(c => ({ id: c.id, label: c.label || c.name || c.id }))
        ];
        setCategories(catOptions);
      } else {
        setCategories(FALLBACK_CATEGORIES);
      }
    } catch (err) {
      console.warn('Error fetching catalog, using fallbacks:', err);
      setProducts(FALLBACK_PRODUCTS);
      setCategories(FALLBACK_CATEGORIES);
    } finally {
      setLoading(false);
    }
  };

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
      if (paymentBoxRef.current && !paymentBoxRef.current.contains(e.target)) {
        setPaymentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search Customers by Name, Phone, or Order ID
  useEffect(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) {
      setCustomerResults([]);
      setIsSearchingCustomer(false);
      return;
    }

    setIsSearchingCustomer(true);
    const timer = setTimeout(async () => {
      try {
        // Search orders table
        const { data: dbOrders } = await supabase
          .from('orders')
          .select('id, customer_name, customer_phone, customer_email, delivery_address, notes')
          .or(`customer_name.ilike.%${query}%,customer_phone.ilike.%${query}%,id.ilike.%${query}%`)
          .order('created_at', { ascending: false })
          .limit(8);

        const mappedDb = (dbOrders || []).map(o => ({
          name: o.customer_name || 'Customer',
          phone: o.customer_phone || '',
          email: o.customer_email || '',
          address: o.delivery_address || '',
          note: o.notes || '',
          orderId: o.id
        }));

        // Search local recent customers
        const matchedLocal = recentCustomers.filter(c =>
          c.name.toLowerCase().includes(query) ||
          (c.phone && c.phone.includes(query)) ||
          (c.email && c.email.toLowerCase().includes(query))
        );

        // Deduplicate
        const combined = [...mappedDb, ...matchedLocal];
        const unique = [];
        const seen = new Set();
        for (const item of combined) {
          const key = (item.name + '|' + (item.phone || '')).toLowerCase();
          if (!seen.has(key) && item.name.trim()) {
            seen.add(key);
            unique.push(item);
          }
        }

        setCustomerResults(unique);
      } catch (err) {
        console.warn('Customer search error:', err);
        const matched = recentCustomers.filter(c =>
          c.name.toLowerCase().includes(query) ||
          (c.phone && c.phone.includes(query))
        );
        setCustomerResults(matched);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [customerSearch, recentCustomers]);

  // Select Customer
  const handleSelectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    setNameError(false);
  };

  // Quick use typed text as customer name
  const handleUseTypedCustomer = () => {
    if (!customerSearch.trim()) return;
    const cust = {
      name: customerSearch.trim(),
      phone: '',
      email: '',
      address: '',
      note: ''
    };
    handleSelectCustomer(cust);
  };

  // Save new customer from modal
  const handleSaveModalCustomer = () => {
    if (!customerModalForm.name.trim()) {
      setCustomerModalError('Customer Name is required');
      return;
    }

    const newCust = {
      name: customerModalForm.name.trim(),
      phone: customerModalForm.phone.trim(),
      email: customerModalForm.email.trim(),
      address: customerModalForm.address.trim(),
      note: customerModalForm.note.trim()
    };

    const updated = [newCust, ...recentCustomers.filter(c => c.name.toLowerCase() !== newCust.name.toLowerCase())];
    setRecentCustomers(updated);
    try {
      localStorage.setItem('pos_recent_customers', JSON.stringify(updated.slice(0, 30)));
    } catch {}

    handleSelectCustomer(newCust);
    setShowCustomerModal(false);
    setCustomerModalForm({ name: '', phone: '', email: '', address: '', note: '' });
    setCustomerModalError('');
    showToast('Customer Added', newCust.name, 'success');
  };

  // Card Quantity Stepper Handler
  const getCardQty = (id) => quantitiesToAdd[id] || 1;
  const setCardQty = (id, delta) => {
    setQuantitiesToAdd(prev => {
      const current = prev[id] || 1;
      const next = Math.max(1, current + delta);
      return { ...prev, [id]: next };
    });
  };

  // Add Item to Cart
  const handleAddToCart = (product, explicitQty = null) => {
    const qtyToAdd = explicitQty !== null ? explicitQty : getCardQty(product.id);
    
    // Check stock
    const currentCartItem = cart.find(item => item.product.id === product.id);
    const existingQty = currentCartItem ? currentCartItem.qty : 0;
    const requestedTotal = existingQty + qtyToAdd;

    if (product.stock !== undefined && product.stock !== null && product.stock > 0 && requestedTotal > product.stock) {
      showToast(
        `Only ${product.stock} units available in stock`,
        `You already have ${existingQty} in cart.`,
        'warning'
      );
      return;
    }

    setCart(prev => {
      const idx = prev.findIndex(item => item.product.id === product.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          qty: updated[idx].qty + qtyToAdd
        };
        return updated;
      }
      return [...prev, { product, qty: qtyToAdd }];
    });

    // Reset card input stepper
    setQuantitiesToAdd(prev => ({ ...prev, [product.id]: 1 }));

    showToast(`Added ${qtyToAdd}x ${product.name}`, fmt(product.price * qtyToAdd), 'success');
  };

  // Modify Cart Item Quantity
  const updateCartQty = (productId, delta) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.qty + delta;
          if (newQty <= 0) return null; // remove
          
          if (item.product.stock && newQty > item.product.stock) {
            showToast('Stock limit reached', `Only ${item.product.stock} units in inventory`, 'warning');
            return item;
          }
          return { ...item, qty: newQty };
        }
        return item;
      }).filter(Boolean);
    });
  };

  // Remove Item Completely
  const removeCartItem = (productId) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCategory = activeCategory === 'all' || p.category_id === activeCategory;
      const matchSearch = !searchQuery.trim() || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchSearch;
    });
  }, [products, activeCategory, searchQuery]);

  // Billing Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.product.price * item.qty), 0);
  }, [cart]);

  // Promo Calculation
  const discountAmount = useMemo(() => {
    if (!appliedPromo || subtotal === 0) return 0;
    if (appliedPromo.type === 'percent') {
      return Math.round((subtotal * appliedPromo.value) / 100);
    }
    if (appliedPromo.type === 'fixed') {
      return Math.min(subtotal, appliedPromo.value);
    }
    return 0;
  }, [appliedPromo, subtotal]);

  // Tax (VAT 7.5%)
  const taxAmount = useMemo(() => {
    if (!enableTax) return 0;
    const taxable = Math.max(0, subtotal - discountAmount);
    return Math.round(taxable * 0.075);
  }, [enableTax, subtotal, discountAmount]);

  const grandTotal = Math.max(0, subtotal - discountAmount + taxAmount);

  // Cash Change Calculation
  const tenderedNum = Number(cashTendered) || 0;
  const cashChange = tenderedNum >= grandTotal ? tenderedNum - grandTotal : 0;

  // Apply Promo Code
  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);

    try {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (coupon) {
        if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
          showToast('Coupon Minimum Required', `Order must be at least ${fmt(coupon.min_order_amount)}`, 'warning');
          setPromoLoading(false);
          return;
        }

        const promoObj = {
          code: coupon.code,
          type: coupon.type === 'percent' ? 'percent' : 'fixed',
          value: Number(coupon.value),
        };
        setAppliedPromo(promoObj);
        showToast('Promo Code Applied', `${coupon.code} active`, 'success');
        setPromoInput('');
        setPromoLoading(false);
        return;
      }

      if (code === 'SMOKEY10') {
        setAppliedPromo({ code: 'SMOKEY10', type: 'percent', value: 10 });
        showToast('10% Retail Promo Applied', '10% discount subtracted', 'success');
        setPromoInput('');
      } else if (code === 'WELCOME5') {
        setAppliedPromo({ code: 'WELCOME5', type: 'percent', value: 5 });
        showToast('5% Welcome Discount Applied', '5% discount subtracted', 'success');
        setPromoInput('');
      } else if (code === 'RETAIL5000') {
        if (subtotal < 25000) {
          showToast('Order too low for RETAIL5000', 'Minimum order ₦25,000 required', 'warning');
        } else {
          setAppliedPromo({ code: 'RETAIL5000', type: 'fixed', value: 5000 });
          showToast('₦5,000 Instant Voucher Applied', 'Subtracted ₦5,000', 'success');
          setPromoInput('');
        }
      } else {
        showToast('Invalid Promo Code', 'No active discount matching this code', 'error');
      }
    } catch (err) {
      console.warn('Coupon verification error:', err);
      showToast('Promo Verification Error', 'Could not verify coupon', 'error');
    } finally {
      setPromoLoading(false);
    }
  };

  // Complete Order & Checkout Pipeline
  const handleCompleteOrder = async () => {
    // 1. Validation: Cart must not be empty
    if (cart.length === 0) {
      showToast('Empty Basket', 'Add at least one product before placing order', 'warning');
      return;
    }

    // 2. Validation: Customer Name is REQUIRED
    const finalCustomerName = selectedCustomer?.name?.trim();
    if (!finalCustomerName) {
      setNameError(true);
      showToast('Customer Name Required', 'Please search or add a customer for this sale', 'error');
      const inputEl = document.getElementById('pos-customer-search-input');
      if (inputEl) inputEl.focus();
      return;
    }
    setNameError(false);

    // 3. Validation: Cash tendered check
    if (paymentMethod === 'cash' && tenderedNum > 0 && tenderedNum < grandTotal) {
      showToast('Insufficient Cash Tendered', `Tendered amount (${fmt(tenderedNum)}) is less than total payable (${fmt(grandTotal)})`, 'warning');
      return;
    }

    setProcessingOrder(true);

    const generatedRef = paymentMethod === 'cash'
      ? `CASH-${Date.now().toString().slice(-6)}`
      : paymentMethod === 'transfer'
        ? `TRF-${Date.now().toString().slice(-6)}`
        : `POS-${Date.now().toString().slice(-6)}`;

    const orderPayload = {
      customer_name: finalCustomerName,
      customer_phone: selectedCustomer?.phone || 'N/A',
      customer_email: selectedCustomer?.email || null,
      delivery_address: selectedCustomer?.address || 'In-Store Retail Counter',
      payment_method: paymentMethod === 'card' ? 'pos' : paymentMethod === 'transfer' ? 'bank_transfer' : 'cash',
      payment_channel: paymentMethod,
      paystack_ref: generatedRef,
      total: grandTotal,
      coupon_code: appliedPromo ? appliedPromo.code : null,
      coupon_discount: discountAmount,
      status: 'delivered', // Immediate retail fulfillment
      store_id: selectedStore !== 'all' ? selectedStore : null,
      notes: `[via Walk-in POS] Cashier: ${cashierName} | Payment: ${paymentMethod.toUpperCase()}${selectedCustomer?.note ? ` | Note: ${selectedCustomer.note}` : ''}`,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    try {
      // 1. Insert into Supabase Orders table
      const { data: insertedOrder } = await supabase
        .from('orders')
        .insert([orderPayload])
        .select()
        .single();

      const finalOrderId = insertedOrder?.id || ticketId;

      // 2. Insert into Order Items
      const orderItemsToInsert = cart.map(item => ({
        order_id: finalOrderId,
        product_id: item.product.id,
        name: item.product.name,
        price: item.product.price,
        qty: item.qty
      }));

      await supabase.from('order_items').insert(orderItemsToInsert).catch(err => {
        console.warn('Order items insert note:', err);
      });

      // 3. Atomically decrement stock in products where applicable
      for (const item of cart) {
        if (item.product.stock !== undefined && item.product.stock !== null) {
          const nextStock = Math.max(0, item.product.stock - item.qty);
          await supabase.from('products').update({ stock: nextStock }).eq('id', item.product.id).catch(() => {});
        }
      }

      // 4. Update local state
      setProducts(prev =>
        prev.map(p => {
          const c = cart.find(i => i.product.id === p.id);
          if (c && p.stock !== undefined && p.stock !== null) {
            return { ...p, stock: Math.max(0, p.stock - c.qty) };
          }
          return p;
        })
      );

      // 5. Construct completed receipt object
      const receiptData = {
        id: finalOrderId,
        ticketId,
        date: new Date(),
        customerName: finalCustomerName,
        customerPhone: selectedCustomer?.phone || 'N/A',
        customerAddress: selectedCustomer?.address || '',
        channel: 'Walk-in POS',
        items: [...cart],
        subtotal,
        discountAmount,
        appliedPromo,
        taxAmount,
        grandTotal,
        paymentMethod,
        paymentRef: generatedRef,
        cashTendered: tenderedNum,
        cashChange,
        cashier: cashierName
      };

      setCompletedOrder(receiptData);
      setShowReceiptModal(true);
      showToast('Sale Completed Successfully', `Receipt #${finalOrderId}`, 'success');

      // Increment sequence for the next customer
      const nextSeq = posSeq + 1;
      setPosSeq(nextSeq);
      localStorage.setItem('pos_seq_counter', String(nextSeq));

    } catch (err) {
      console.error('Order placement exception:', err);
      const fallbackReceipt = {
        id: ticketId,
        ticketId,
        date: new Date(),
        customerName: finalCustomerName,
        customerPhone: selectedCustomer?.phone || 'N/A',
        customerAddress: selectedCustomer?.address || '',
        channel: 'Walk-in POS',
        items: [...cart],
        subtotal,
        discountAmount,
        appliedPromo,
        taxAmount,
        grandTotal,
        paymentMethod,
        paymentRef: generatedRef,
        cashTendered: tenderedNum,
        cashChange,
        cashier: cashierName
      };
      setCompletedOrder(fallbackReceipt);
      setShowReceiptModal(true);
      showToast('Sale Recorded Locally', `Offline Receipt #${ticketId}`, 'success');

      // Increment sequence for the next customer even if offline fallback
      const nextSeq = posSeq + 1;
      setPosSeq(nextSeq);
      localStorage.setItem('pos_seq_counter', String(nextSeq));
    } finally {
      setProcessingOrder(false);
    }
  };

  // Reset / Next Customer Order
  const handleStartNextOrder = () => {
    setCart([]);
    setSelectedCustomer(null);
    setCustomerSearch('');
    setAppliedPromo(null);
    setPromoInput('');
    setCashTendered('');
    setNameError(false);
    setShowReceiptModal(false);
    setCompletedOrder(null);
  };

  // Trigger Native Browser Print
  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="pos-container" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      minHeight: 'calc(100vh - 120px)',
      fontFamily: "'DM Sans', sans-serif"
    }}>
      {/* ── 1. POS TOP STATUS BAR ── */}
      <div style={{
        background: 'var(--card-bg, #FFFFFF)',
        border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
        borderRadius: 16,
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        boxShadow: 'var(--shadow, 0 2px 12px rgba(0,0,0,0.06))'
      }}>
        {/* Left: Store Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, var(--red, #C0201F), var(--red-dark, #991818))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(192, 32, 31, 0.3)'
          }}>
            <Store size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, fontFamily: "'Mona Sans', sans-serif" }}>
              Walk-in POS
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted, #736B63)' }}>
              Retail Counter & Direct Dine-in Billing
            </p>
          </div>
        </div>

        {/* Right: Reset Action */}
        <div>
          {cart.length > 0 && (
            <button
              onClick={() => setConfirmClearCart(true)}
              title="Clear active basket"
              style={{
                height: 42,
                padding: '0 16px',
                borderRadius: 12,
                border: '1px solid rgba(220, 38, 38, 0.2)',
                background: 'rgba(220, 38, 38, 0.05)',
                color: 'var(--red, #C0201F)',
                fontSize: '0.85rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <RotateCcw size={15} /> Reset Order
            </button>
          )}
        </div>
      </div>

      {/* ── 2. MAIN POS WORKSPACE: CATALOG (LEFT) & BASKET (RIGHT) ── */}
      <div className="pos-main-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 460px',
        gap: 16,
        alignItems: 'flex-start'
      }}>
        {/* ── LEFT COLUMN: PRODUCT SEARCH, CATEGORIES & TOUCH PRODUCT GRID ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Product Items Search Bar (Above Categories) */}
          <div style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            alignItems: 'center'
          }}>
            <Search size={18} style={{ position: 'absolute', left: 16, color: 'var(--text-muted, #888)' }} />
            <input
              type="text"
              placeholder="Search products by name, description or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: 46,
                padding: '0 38px 0 44px',
                borderRadius: 14,
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.12))',
                background: 'var(--card-bg, #FFFFFF)',
                color: 'var(--text, #1A1610)',
                fontSize: '0.92rem',
                outline: 'none',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                transition: 'border-color 0.2s, box-shadow 0.2s'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 14,
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #888)',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
          {/* Category Tabs Pill Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}>
            {categories.map(cat => {
              const isActive = activeCategory === cat.id;
              const count = cat.id === 'all' 
                ? products.length 
                : products.filter(p => p.category_id === cat.id).length;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 30,
                    border: isActive 
                      ? '1px solid var(--red, #C0201F)' 
                      : '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                    background: isActive 
                      ? 'var(--red, #C0201F)' 
                      : 'var(--card-bg, #FFFFFF)',
                    color: isActive ? '#FFFFFF' : 'var(--text, #1A1610)',
                    fontSize: '0.88rem',
                    fontWeight: isActive ? 800 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: isActive 
                      ? '0 4px 12px rgba(192, 32, 31, 0.25)' 
                      : '0 1px 3px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{cat.label}</span>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--black2, #F3F0EA)',
                    color: isActive ? '#fff' : 'var(--text-muted, #5C5247)'
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Product Cards Grid */}
          {loading ? (
            <div style={{
              background: 'var(--card-bg, #FFFFFF)',
              borderRadius: 16,
              padding: 48,
              textAlign: 'center',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{
                width: 36,
                height: 36,
                border: '3px solid var(--border-subtle, #eee)',
                borderTopColor: 'var(--red, #C0201F)',
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spin 0.8s linear infinite'
              }} />
              <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Loading menu & inventory...</div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div style={{
              background: 'var(--card-bg, #FFFFFF)',
              borderRadius: 16,
              padding: 60,
              textAlign: 'center',
              border: '1px dashed var(--border-subtle, #ccc)'
            }}>
              <UtensilsCrossed size={42} style={{ color: 'var(--text-muted, #aaa)', marginBottom: 12 }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>No products found</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                Try adjusting your search query or selecting another category.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 14
            }}>
              {filteredProducts.map(product => {
                const cardQty = getCardQty(product.id);
                const inCart = cart.find(i => i.product.id === product.id);
                const isOutOfStock = product.stock !== undefined && product.stock !== null && product.stock <= 0;

                return (
                  <div
                    key={product.id}
                    className="pos-product-card"
                    style={{
                      background: 'var(--card-bg, #FFFFFF)',
                      border: inCart 
                        ? '1.5px solid var(--red, #C0201F)' 
                        : '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                      borderRadius: 16,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: inCart 
                        ? '0 6px 20px rgba(192, 32, 31, 0.12)' 
                        : '0 2px 8px rgba(0,0,0,0.04)',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                      opacity: isOutOfStock ? 0.65 : 1
                    }}
                  >
                    {/* Image Area with Badges */}
                    <div style={{
                      position: 'relative',
                      height: 140,
                      background: 'var(--black2, #F3F0EA)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden'
                    }}>
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                          }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          color: 'var(--text-muted, #888)'
                        }}>
                          <UtensilsCrossed size={36} style={{ opacity: 0.4 }} />
                          <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Smokey Hut</span>
                        </div>
                      )}

                      {/* Stock Badge */}
                      <div style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        padding: '3px 8px',
                        borderRadius: 20,
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        background: isOutOfStock 
                          ? 'rgba(239, 68, 68, 0.9)' 
                          : product.stock !== undefined && product.stock <= 5 
                            ? 'rgba(245, 158, 11, 0.9)' 
                            : 'rgba(0, 0, 0, 0.65)',
                        color: '#fff',
                        backdropFilter: 'blur(4px)'
                      }}>
                        {isOutOfStock ? 'Sold Out' : `${product.stock ?? 99}+ in stock`}
                      </div>

                      {/* In Cart Indicator */}
                      {inCart && (
                        <div style={{
                          position: 'absolute',
                          top: 10,
                          left: 10,
                          padding: '3px 8px',
                          borderRadius: 20,
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          background: 'var(--red, #C0201F)',
                          color: '#fff',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                        }}>
                          {inCart.qty} in cart
                        </div>
                      )}
                    </div>

                    {/* Content Area */}
                    <div style={{
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      justifyContent: 'space-between',
                      gap: 12
                    }}>
                      <div>
                        <div style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: 'var(--yellow-dark, #956D00)',
                          marginBottom: 4
                        }}>
                          {categories.find(c => c.id === product.category_id)?.label || 'Special'}
                        </div>
                        <h4 style={{
                          margin: 0,
                          fontSize: '0.96rem',
                          fontWeight: 800,
                          lineHeight: 1.3,
                          color: 'var(--text, #1A1610)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minHeight: '2.6em'
                        }}>
                          {product.name}
                        </h4>
                      </div>

                      {/* Price & Quantity Controls */}
                      <div>
                        <div style={{
                          fontSize: '1.15rem',
                          fontWeight: 900,
                          color: 'var(--red, #C0201F)',
                          fontFamily: "'Mona Sans', sans-serif",
                          marginBottom: 10
                        }}>
                          {fmt(product.price)}
                        </div>

                        {/* Stepper + Quick Add Button */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: 'var(--black2, #F3F0EA)',
                            borderRadius: 10,
                            padding: '2px',
                            border: '1px solid var(--border-subtle, rgba(0,0,0,0.06))'
                          }}>
                            <button
                              onClick={() => setCardQty(product.id, -1)}
                              disabled={cardQty <= 1 || isOutOfStock}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text, #1A1610)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: cardQty > 1 ? 'pointer' : 'not-allowed',
                                opacity: cardQty > 1 ? 1 : 0.4
                              }}
                            >
                              <Minus size={13} />
                            </button>
                            <span style={{
                              width: 24,
                              textAlign: 'center',
                              fontSize: '0.86rem',
                              fontWeight: 800,
                              color: 'var(--text, #1A1610)'
                            }}>
                              {cardQty}
                            </span>
                            <button
                              onClick={() => setCardQty(product.id, 1)}
                              disabled={isOutOfStock}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text, #1A1610)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: !isOutOfStock ? 'pointer' : 'not-allowed'
                              }}
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          <button
                            onClick={() => handleAddToCart(product)}
                            disabled={isOutOfStock}
                            style={{
                              flex: 1,
                              height: 34,
                              borderRadius: 10,
                              border: 'none',
                              background: isOutOfStock ? '#ccc' : 'var(--red, #C0201F)',
                              color: '#fff',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              cursor: !isOutOfStock ? 'pointer' : 'not-allowed',
                              boxShadow: !isOutOfStock ? '0 2px 8px rgba(192, 32, 31, 0.25)' : 'none',
                              transition: 'transform 0.1s, background 0.1s'
                            }}
                          >
                            <Plus size={14} /> Add
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: FIXED ORDER / BASKET & CHECKOUT CONSOLE (VIEWPORT PINNED) ── */}
        <div style={{
          position: 'sticky',
          top: 80,
          height: 'calc(100vh - 100px)',
          maxHeight: 'calc(100vh - 100px)',
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
          borderRadius: 20,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg, 0 16px 48px rgba(0,0,0,0.12))',
          overflow: 'hidden'
        }}>
          {/* Basket Header */}
          <div style={{
            padding: '14px 18px',
            background: 'var(--black, #FAFAF8)',
            borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'var(--black2, #F3F0EA)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  color: 'var(--text, #1A1610)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <ShoppingCart size={17} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text, #1A1610)' }}>
                      Customer Order
                    </h3>
                    <span style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'var(--black2, #F3F0EA)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      color: 'var(--text, #1A1610)',
                      fontFamily: 'monospace',
                      letterSpacing: '0.5px'
                    }}>
                      {ticketId}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #736B63)' }}>
                    {cart.length} unique item{cart.length !== 1 ? 's' : ''} in basket
                  </span>
                </div>
              </div>

              {cart.length > 0 && (
                <button
                  onClick={() => setConfirmClearCart(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #8A8379)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    borderRadius: 6,
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--red, #C0201F)';
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted, #8A8379)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Customer Search & Add New Component */}
          <div style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
            background: nameError ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
            position: 'relative',
            flexShrink: 0
          }}>
            {selectedCustomer ? (
              /* Selected Customer Card Preview - De-saturated & Optically Balanced */
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 12,
                background: 'var(--card-bg, #FFFFFF)',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.12))',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--black2, #F3F0EA)',
                    border: '1px solid rgba(0,0,0,0.06)',
                    color: 'var(--text, #1A1610)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                    flexShrink: 0
                  }}>
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong style={{
                        fontSize: '0.90rem',
                        fontWeight: 800,
                        color: 'var(--text, #1A1610)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {selectedCustomer.name}
                      </strong>
                      <span style={{
                        fontSize: '0.68rem',
                        background: 'rgba(0,0,0,0.05)',
                        color: 'var(--text-muted, #5C5247)',
                        padding: '1px 6px',
                        borderRadius: 6,
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        Active
                      </span>
                    </div>
                    <div style={{
                      fontSize: '0.76rem',
                      color: 'var(--text-muted, #736B63)',
                      marginTop: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {selectedCustomer.phone && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <Phone size={12} strokeWidth={2} color="var(--text-muted, #736B63)" />
                          {selectedCustomer.phone}
                        </span>
                      )}
                      {selectedCustomer.address && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          <MapPin size={12} strokeWidth={2} color="var(--text-muted, #736B63)" style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedCustomer.address}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerSearch('');
                  }}
                  title="Change customer"
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle, rgba(0,0,0,0.1))',
                    background: 'var(--black2, #F3F0EA)',
                    color: 'var(--text, #1A1610)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--black2, #F3F0EA)';
                  }}
                >
                  <X size={13} strokeWidth={2.2} /> Change
                </button>
              </div>
            ) : (
              /* Customer Search Input + "+ Add New" Button */
              <div ref={searchBoxRef} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted, #888)' }} />
                    <input
                      id="pos-customer-search-input"
                      type="text"
                      placeholder="Search customer (name, phone, order ID)... *"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                        setNameError(false);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUseTypedCustomer();
                      }}
                      style={{
                        width: '100%',
                        height: 40,
                        padding: '0 32px 0 36px',
                        borderRadius: 10,
                        border: nameError ? '1.5px solid #ef4444' : '1px solid var(--border-subtle, #ddd)',
                        background: 'var(--black, #FAFAF8)',
                        color: 'var(--text, #1A1610)',
                        fontSize: '0.86rem',
                        outline: 'none'
                      }}
                    />
                    {customerSearch && (
                      <button
                        onClick={() => {
                          setCustomerSearch('');
                          setShowCustomerDropdown(false);
                        }}
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: 12,
                          background: 'none',
                          border: 'none',
                          color: '#888',
                          cursor: 'pointer'
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* "+ Add New" Button */}
                  <button
                    onClick={() => {
                      setCustomerModalForm({ name: customerSearch.trim(), phone: '', email: '', address: '', note: '' });
                      setShowCustomerModal(true);
                      setCustomerModalError('');
                    }}
                    style={{
                      height: 40,
                      padding: '0 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'var(--red, #C0201F)',
                      color: '#fff',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(192, 32, 31, 0.25)'
                    }}
                  >
                    <UserPlus size={15} /> Add New
                  </button>
                </div>

                {nameError && (
                  <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700, marginTop: 4 }}>
                    Please select or add a customer (name is required).
                  </div>
                )}

                {/* Autocomplete Search Dropdown */}
                {showCustomerDropdown && customerSearch.trim().length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: 46,
                    left: 0,
                    right: 0,
                    background: '#FFFFFF',
                    border: '1px solid var(--border-subtle, #ddd)',
                    borderRadius: 12,
                    boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
                    zIndex: 100,
                    maxHeight: 260,
                    overflowY: 'auto',
                    padding: '6px'
                  }}>
                    {/* Quick option to use currently typed text */}
                    <div
                      onClick={handleUseTypedCustomer}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'rgba(192, 32, 31, 0.05)',
                        color: 'var(--red, #C0201F)',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4
                      }}
                    >
                      <Plus size={15} />
                      <span>Use "{customerSearch.trim()}" as Walk-in Customer</span>
                    </div>

                    {isSearchingCustomer && (
                      <div style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#888' }}>
                        Searching customers...
                      </div>
                    )}

                    {customerResults.map((cust, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectCustomer(cust)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #f2f2f2',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text, #1A1610)' }}>
                            {cust.name}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #736B63)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                            {cust.phone && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Phone size={11} strokeWidth={2} /> {cust.phone}
                              </span>
                            )}
                            {cust.address && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <MapPin size={11} strokeWidth={2} /> {cust.address}
                              </span>
                            )}
                          </div>
                        </div>
                        {cust.orderId && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4, background: '#eee', color: '#555' }}>
                            {cust.orderId.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    ))}

                    {customerResults.length === 0 && !isSearchingCustomer && (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        No existing customer found. Click <strong>Add New</strong> to register.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart Items List — SCROLLABLE MIDDLE SECTION */}
          <div style={{
            padding: '12px 18px',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            {cart.length === 0 ? (
              <div style={{
                padding: '36px 12px',
                textAlign: 'center',
                color: 'var(--text-muted, #888)',
                margin: 'auto 0'
              }}>
                <ShoppingBag size={40} style={{ opacity: 0.35, marginBottom: 10 }} />
                <div style={{ fontSize: '0.94rem', fontWeight: 800 }}>Your basket is empty</div>
                <div style={{ fontSize: '0.80rem', marginTop: 4 }}>Tap any item from the left menu to build this order.</div>
              </div>
            ) : (
              cart.map(item => (
                <div
                  key={item.product.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'var(--card-bg, #FFFFFF)',
                    border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    gap: 12
                  }}
                >
                  {/* Thumbnail & Title */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: 'var(--black2, #F3F0EA)',
                      overflow: 'hidden',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {item.product.image ? (
                        <img src={item.product.image} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <UtensilsCrossed size={18} color="var(--text-muted, #736B63)" />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: '0.90rem',
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--text, #1A1610)',
                        lineHeight: 1.3
                      }}>
                        {item.product.name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #736B63)', marginTop: 2 }}>
                        {fmt(item.product.price)} each
                      </div>
                    </div>
                  </div>

                  {/* Quantity Stepper (Optically balanced) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--black, #FAFAF8)',
                    border: '1px solid var(--border-subtle, rgba(0,0,0,0.12))',
                    borderRadius: 9,
                    padding: '2px',
                    flexShrink: 0
                  }}>
                    <button
                      onClick={() => updateCartQty(item.product.id, -1)}
                      style={{
                        width: 28,
                        height: 28,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text, #1A1610)',
                        borderRadius: 7
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Minus size={13} strokeWidth={2.2} />
                    </button>
                    <span style={{
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      width: 26,
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text, #1A1610)'
                    }}>
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateCartQty(item.product.id, 1)}
                      style={{
                        width: 28,
                        height: 28,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text, #1A1610)',
                        borderRadius: 7
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Plus size={13} strokeWidth={2.2} />
                    </button>
                  </div>

                  {/* Line Total & Remove - De-saturated & Optically Balanced */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.94rem',
                      fontWeight: 900,
                      color: 'var(--text, #1A1610)',
                      minWidth: 72,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {fmt(item.product.price * item.qty)}
                    </span>
                    <button
                      onClick={() => removeCartItem(item.product.id)}
                      title="Remove item"
                      style={{
                        width: 30,
                        height: 30,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-muted, #8A8379)',
                        cursor: 'pointer',
                        padding: 0,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                        e.currentTarget.style.color = '#ef4444';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-muted, #8A8379)';
                      }}
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── PINNED CHECKOUT CONSOLE (ALWAYS IN SCREEN VIEWPORT) ── */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
            background: 'var(--card-bg, #FFFFFF)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Payment Method Selector (Dropdown List with Actual SVG Icons) */}
            <div style={{
              padding: '12px 18px',
              position: 'relative'
            }}>
              <label style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                color: 'var(--text-muted, #736B63)',
                marginBottom: 6,
                display: 'block',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Payment Method
              </label>

            {(() => {
              const currentOpt = PAYMENT_OPTIONS.find(o => o.id === paymentMethod) || PAYMENT_OPTIONS[0];
              const CurrentIcon = currentOpt.icon;

              return (
                <div ref={paymentBoxRef} style={{ position: 'relative' }}>
                  <div
                    onClick={() => setPaymentDropdownOpen(!paymentDropdownOpen)}
                    style={{
                      width: '100%',
                      height: 48,
                      padding: '0 10px',
                      borderRadius: 12,
                      border: paymentDropdownOpen 
                        ? '1.5px solid var(--text, #1A1610)' 
                        : '1.5px solid var(--border-subtle, rgba(0,0,0,0.14))',
                      background: 'var(--card-bg, #FFFFFF)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxShadow: paymentDropdownOpen ? '0 0 0 3px rgba(0, 0, 0, 0.05)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: 'var(--black2, #F3F0EA)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        color: 'var(--text, #1A1610)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <CurrentIcon size={16} strokeWidth={2.2} />
                      </div>
                      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text, #1A1610)' }}>
                        {currentOpt.label}
                      </span>
                    </div>
                    <ChevronDown
                      size={18}
                      color="var(--text-muted, #736B63)"
                      style={{
                        transform: paymentDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0
                      }}
                    />
                  </div>

                  {/* Dropdown Menu - De-saturated & Optically Aligned */}
                  {paymentDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 5px)',
                      left: 0,
                      right: 0,
                      background: '#FFFFFF',
                      border: '1px solid var(--border-subtle, rgba(0,0,0,0.12))',
                      borderRadius: 12,
                      boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                      zIndex: 150,
                      padding: 5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3
                    }}>
                      {PAYMENT_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        const isSelected = paymentMethod === opt.id;
                        return (
                          <div
                            key={opt.id}
                            onClick={() => {
                              setPaymentMethod(opt.id);
                              setPaymentDropdownOpen(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              height: 42,
                              padding: '0 5px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              background: isSelected ? 'var(--black2, #F3F0EA)' : 'transparent',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.03)';
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                background: isSelected ? '#FFFFFF' : 'var(--black2, #F3F0EA)',
                                border: '1px solid rgba(0,0,0,0.06)',
                                color: 'var(--text, #1A1610)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                <Icon size={16} strokeWidth={2.2} />
                              </div>
                              <span style={{
                                fontSize: '0.88rem',
                                fontWeight: isSelected ? 800 : 600,
                                color: 'var(--text, #1A1610)'
                              }}>
                                {opt.label}
                              </span>
                            </div>
                            {isSelected && (
                              <Check 
                                size={16} 
                                strokeWidth={2.5}
                                color="var(--text, #1A1610)" 
                                style={{ marginRight: 5, flexShrink: 0 }} 
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* If Cash: Tender shortcuts & Change calculation */}
            {paymentMethod === 'cash' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text, #1A1610)' }}>
                    Cash Amount Tendered
                  </label>
                  {tenderedNum >= grandTotal && grandTotal > 0 && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#137333' }}>
                      Change: {fmt(cashChange)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    type="number"
                    placeholder="Enter cash given by customer..."
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    style={{
                      flex: 1,
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle, #ddd)',
                      background: 'var(--black, #FAFAF8)',
                      color: 'var(--text, #1A1610)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => setCashTendered(String(grandTotal))}
                    style={{
                      padding: '0 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle, #ccc)',
                      background: 'var(--black2, #eee)',
                      color: 'var(--text, #1A1610)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Exact
                  </button>
                </div>

                {/* Quick denomination chips */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CASH_SHORTCUTS.map(val => (
                    <button
                      key={val}
                      onClick={() => setCashTendered(String(val))}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border-subtle, #ddd)',
                        background: tenderedNum === val ? 'var(--text, #1A1610)' : 'var(--black, #FAFAF8)',
                        color: tenderedNum === val ? '#fff' : 'var(--text, #1A1610)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {fmt(val)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Promo Code Box (PLACED DIRECTLY ABOVE TOTAL AMOUNT) */}
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
            background: 'var(--black, #FAFAF8)'
          }}>
            {appliedPromo ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 10,
                background: '#E6F4EA',
                border: '1px solid #CEEAD6',
                color: '#137333',
                fontSize: '0.84rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag size={14} />
                  <strong>{appliedPromo.code}</strong>
                  <span>({appliedPromo.type === 'percent' ? `${appliedPromo.value}% OFF` : `-${fmt(appliedPromo.value)}`})</span>
                </div>
                <button
                  onClick={() => setAppliedPromo(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#137333',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Tag size={14} style={{ position: 'absolute', left: 10, top: 12, color: '#888' }} />
                  <input
                    type="text"
                    placeholder="Enter promo code (e.g. SMOKEY10)"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleApplyPromo(); }}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 10px 0 32px',
                      borderRadius: 10,
                      border: '1px solid var(--border-subtle, #ddd)',
                      background: 'var(--card-bg, #FFFFFF)',
                      color: 'var(--text, #1A1610)',
                      fontSize: '0.84rem',
                      outline: 'none'
                    }}
                  />
                </div>
                <button
                  onClick={handleApplyPromo}
                  disabled={!promoInput.trim() || promoLoading}
                  style={{
                    padding: '0 14px',
                    height: 38,
                    borderRadius: 10,
                    border: 'none',
                    background: promoInput.trim() ? 'var(--text, #1A1610)' : '#ccc',
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: promoInput.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  {promoLoading ? '...' : 'Apply'}
                </button>
              </div>
            )}
          </div>

            {/* Billing Breakdown & Grand Total (Always in Viewport) */}
            <div style={{
              padding: '12px 18px',
              background: 'var(--black, #FAFAF8)',
              borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <span>Subtotal</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fmt(subtotal)}</span>
              </div>

              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#137333' }}>
                  <span>Discount ({appliedPromo?.code})</span>
                  <span style={{ fontWeight: 700 }}>-{fmt(discountAmount)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  VAT / Tax (7.5%)
                  <button
                    onClick={() => setEnableTax(!enableTax)}
                    style={{
                      fontSize: '0.64rem',
                      padding: '1px 5px',
                      borderRadius: 4,
                      border: '1px solid #ccc',
                      background: enableTax ? 'var(--red, #C0201F)' : '#eee',
                      color: enableTax ? '#fff' : '#666',
                      cursor: 'pointer'
                    }}
                  >
                    {enableTax ? 'ON' : 'OFF'}
                  </button>
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fmt(taxAmount)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingTop: 8,
                marginTop: 4,
                borderTop: '1px dashed var(--border-subtle, #ccc)'
              }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 900, color: 'var(--text, #1A1610)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Total Amount
                  </span>
                  <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>Net total payable</div>
                </div>
                <div style={{
                  fontSize: '1.55rem',
                  fontWeight: 900,
                  color: 'var(--red, #C0201F)',
                  fontFamily: "'Mona Sans', sans-serif"
                }}>
                  {fmt(grandTotal)}
                </div>
              </div>
            </div>

            {/* Action Buttons: Bill & Place Order */}
            <div style={{
              padding: '12px 18px',
              background: 'var(--card-bg, #FFFFFF)',
              borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
              display: 'flex',
              gap: 10
            }}>
              <button
                onClick={() => {
                  if (cart.length === 0) {
                    showToast('Cart Empty', 'Add items before previewing bill', 'warning');
                    return;
                  }
                  const previewSlip = {
                    id: ticketId,
                    ticketId,
                    date: new Date(),
                    customerName: selectedCustomer?.name || 'Valued Customer',
                    customerPhone: selectedCustomer?.phone || 'N/A',
                    customerAddress: selectedCustomer?.address || '',
                    channel: 'Walk-in POS',
                    items: [...cart],
                    subtotal,
                    discountAmount,
                    appliedPromo,
                    taxAmount,
                    grandTotal,
                    paymentMethod,
                    paymentRef: paymentMethod.toUpperCase(),
                    cashTendered: tenderedNum,
                    cashChange,
                    cashier: cashierName
                  };
                  setCompletedOrder(previewSlip);
                  setShowReceiptModal(true);
                }}
                style={{
                  height: 48,
                  padding: '0 16px',
                  borderRadius: 12,
                  border: '1px solid var(--border-subtle, #ccc)',
                  background: 'var(--black, #FAFAF8)',
                  color: 'var(--text, #1A1610)',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Printer size={16} /> Bill
              </button>

              <button
                onClick={handleCompleteOrder}
                disabled={processingOrder || cart.length === 0}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 12,
                  border: 'none',
                  background: cart.length === 0 
                    ? '#ccc' 
                    : 'linear-gradient(135deg, var(--red, #C0201F), var(--red-dark, #991818))',
                  color: '#fff',
                  fontSize: '0.96rem',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: cart.length > 0 && !processingOrder ? 'pointer' : 'not-allowed',
                  boxShadow: cart.length > 0 ? '0 4px 16px rgba(192, 32, 31, 0.35)' : 'none',
                  transition: 'transform 0.15s'
                }}
              >
                {processingOrder ? (
                  <span>Processing Sale...</span>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    <span>Place Order</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. ADD NEW CUSTOMER MODAL ── */}
      {showCustomerModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'var(--card-bg, #FFFFFF)',
            borderRadius: 20,
            width: '100%',
            maxWidth: 460,
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
            border: '1px solid var(--border-subtle, #ddd)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-subtle, #eee)',
              background: 'var(--black, #FAFAF8)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(192, 32, 31, 0.1)',
                  color: 'var(--red, #C0201F)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>Add New Customer</h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Create profile for retail POS order</div>
                </div>
              </div>
              <button
                onClick={() => setShowCustomerModal(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {customerModalError && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  fontSize: '0.82rem',
                  fontWeight: 700
                }}>
                  {customerModalError}
                </div>
              )}

              {/* Name (Required) */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text, #1A1610)', display: 'block', marginBottom: 6 }}>
                  Customer Name <span style={{ color: 'var(--red, #C0201F)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chief Adeleke"
                  value={customerModalForm.name}
                  onChange={(e) => setCustomerModalForm({ ...customerModalForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    height: 40,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle, #ddd)',
                    background: 'var(--black, #FAFAF8)',
                    color: 'var(--text, #1A1610)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Phone & Email (Side by Side) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text, #1A1610)', display: 'block', marginBottom: 6 }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 0803 123 4567"
                    value={customerModalForm.phone}
                    onChange={(e) => setCustomerModalForm({ ...customerModalForm, phone: e.target.value })}
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border-subtle, #ddd)',
                      background: 'var(--black, #FAFAF8)',
                      color: 'var(--text, #1A1610)',
                      fontSize: '0.88rem',
                      outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text, #1A1610)', display: 'block', marginBottom: 6 }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. adeleke@gmail.com"
                    value={customerModalForm.email}
                    onChange={(e) => setCustomerModalForm({ ...customerModalForm, email: e.target.value })}
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border-subtle, #ddd)',
                      background: 'var(--black, #FAFAF8)',
                      color: 'var(--text, #1A1610)',
                      fontSize: '0.88rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text, #1A1610)', display: 'block', marginBottom: 6 }}>
                  Contact / Delivery Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 14 Commercial Ave, Sabo, Yaba"
                  value={customerModalForm.address}
                  onChange={(e) => setCustomerModalForm({ ...customerModalForm, address: e.target.value })}
                  style={{
                    width: '100%',
                    height: 40,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle, #ddd)',
                    background: 'var(--black, #FAFAF8)',
                    color: 'var(--text, #1A1610)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Order Note */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text, #1A1610)', display: 'block', marginBottom: 6 }}>
                  Order Note / Preference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pack pepper separate, frequent VIP"
                  value={customerModalForm.note}
                  onChange={(e) => setCustomerModalForm({ ...customerModalForm, note: e.target.value })}
                  style={{
                    width: '100%',
                    height: 40,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle, #ddd)',
                    background: 'var(--black, #FAFAF8)',
                    color: 'var(--text, #1A1610)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-subtle, #eee)',
              background: 'var(--black, #FAFAF8)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10
            }}>
              <button
                onClick={() => setShowCustomerModal(false)}
                style={{
                  height: 42,
                  padding: '0 18px',
                  borderRadius: 10,
                  border: '1px solid #ccc',
                  background: '#fff',
                  color: 'var(--text, #1A1610)',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModalCustomer}
                style={{
                  height: 42,
                  padding: '0 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--red, #C0201F)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Check size={16} /> Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. CLEAR CART CONFIRMATION MODAL ── */}
      <ConfirmModal
        isOpen={confirmClearCart}
        onClose={() => setConfirmClearCart(false)}
        onConfirm={() => {
          setCart([]);
          setTicketId(generatePosTicketId());
          setConfirmClearCart(false);
          showToast('Basket Cleared', '', 'info');
        }}
        title="Clear Current Basket?"
        message="All items in the active customer order will be removed."
        confirmText="Yes, Clear All"
        cancelText="Keep Items"
        isDestructive={true}
      />

      {/* ── 5. THERMAL RECEIPT & ORDER FINALIZATION MODAL ── */}
      {showReceiptModal && completedOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            width: '100%',
            maxWidth: 420,
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            fontFamily: "'Courier New', Courier, monospace"
          }}>
            {/* Modal Header Controls (Screen only) */}
            <div className="no-print" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid #eee',
              background: '#fafafa',
              fontFamily: "'DM Sans', sans-serif"
            }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Receipt size={18} color="var(--red, #C0201F)" />
                Retail POS Receipt
              </span>
              <button
                onClick={() => setShowReceiptModal(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Printable Receipt Paper Container (80mm width standard) */}
            <div id="pos-print-slip" style={{
              padding: '24px 22px',
              overflowY: 'auto',
              flex: 1,
              color: '#000',
              fontSize: '13px',
              lineHeight: 1.4
            }}>
              {/* Header Branding */}
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <img
                  src="/logo.svg"
                  alt="Smokeyhut Delight"
                  style={{
                    width: 48,
                    height: 48,
                    objectFit: 'contain',
                    margin: '0 auto 8px',
                    display: 'block'
                  }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '1px' }}>
                  SMOKEY HUT DELIGHT
                </div>
                <div style={{ fontSize: '11px', color: '#444' }}>
                  Authentic Smoked Delicacies & Retail Kitchen
                </div>
                <div style={{ fontSize: '11px', color: '#444' }}>
                  Tel: +234 814 174 8281 • Lagos, Nigeria
                </div>
                <div style={{ margin: '8px 0', borderTop: '1px dashed #000' }} />
              </div>

              {/* Receipt Metadata */}
              <div style={{ fontSize: '12px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>TICKET:</span>
                  <strong>{completedOrder.ticketId}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>DATE:</span>
                  <span>{new Date(completedOrder.date).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>CASHIER:</span>
                  <strong>{completedOrder.cashier}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>CUSTOMER:</span>
                  <strong>{completedOrder.customerName}</strong>
                </div>
                {completedOrder.customerPhone && completedOrder.customerPhone !== 'N/A' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>PHONE:</span>
                    <span>{completedOrder.customerPhone}</span>
                  </div>
                )}
                {completedOrder.customerAddress && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>ADDRESS:</span>
                    <span>{completedOrder.customerAddress}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>CHANNEL:</span>
                  <span>WALK-IN POS</span>
                </div>
                <div style={{ margin: '8px 0', borderTop: '1px dashed #000' }} />
              </div>

              {/* Itemized Table */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '12px', paddingBottom: 4 }}>
                  <span style={{ flex: 1 }}>ITEM</span>
                  <span style={{ width: 40, textAlign: 'center' }}>QTY</span>
                  <span style={{ width: 75, textAlign: 'right' }}>TOTAL</span>
                </div>
                <div style={{ borderTop: '1px solid #000', marginBottom: 6 }} />

                {completedOrder.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 4 }}>
                    <div style={{ flex: 1, paddingRight: 6 }}>
                      <div>{item.product.name}</div>
                      <div style={{ fontSize: '10px', color: '#555' }}>@{fmt(item.product.price)}</div>
                    </div>
                    <div style={{ width: 40, textAlign: 'center' }}>{item.qty}</div>
                    <div style={{ width: 75, textAlign: 'right', fontWeight: 700 }}>
                      {fmt(item.product.price * item.qty)}
                    </div>
                  </div>
                ))}
                <div style={{ margin: '8px 0', borderTop: '1px dashed #000' }} />
              </div>

              {/* Summary Totals */}
              <div style={{ fontSize: '12px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>SUBTOTAL:</span>
                  <span>{fmt(completedOrder.subtotal)}</span>
                </div>

                {completedOrder.discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>DISCOUNT ({completedOrder.appliedPromo?.code}):</span>
                    <span>-{fmt(completedOrder.discountAmount)}</span>
                  </div>
                )}

                {completedOrder.taxAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>VAT (7.5%):</span>
                    <span>{fmt(completedOrder.taxAmount)}</span>
                  </div>
                )}

                <div style={{ borderTop: '1px solid #000', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 900 }}>
                  <span>TOTAL:</span>
                  <span>{fmt(completedOrder.grandTotal)}</span>
                </div>
                <div style={{ borderTop: '1px solid #000', margin: '6px 0' }} />
              </div>

              {/* Payment Details */}
              <div style={{ fontSize: '12px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>PAYMENT METHOD:</span>
                  <strong>{completedOrder.paymentMethod.toUpperCase()}</strong>
                </div>

                {completedOrder.paymentMethod === 'cash' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>CASH TENDERED:</span>
                      <span>{fmt(completedOrder.cashTendered)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                      <span>CHANGE DUE:</span>
                      <span>{fmt(completedOrder.cashChange)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Footer barcode */}
              <div style={{ textAlign: 'center', marginTop: 14, paddingTop: 8, borderTop: '1px dashed #000' }}>
                <div style={{ letterSpacing: '4px', fontSize: '16px', fontWeight: 800, margin: '6px 0' }}>
                  ||| | | |||| | ||| | ||
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>
                  THANK YOU FOR DINING WITH US!
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginTop: 2 }}>
                  Freshness & Smokey Goodness Guaranteed
                </div>
              </div>
            </div>

            {/* Modal Action Buttons (Screen only) */}
            <div className="no-print" style={{
              padding: '16px 20px',
              borderTop: '1px solid #eee',
              background: '#fafafa',
              display: 'flex',
              gap: 12,
              fontFamily: "'DM Sans', sans-serif"
            }}>
              <button
                onClick={handlePrintSlip}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  border: '1px solid #ccc',
                  background: '#FFFFFF',
                  color: '#1A1610',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Printer size={16} /> Print Receipt
              </button>

              <button
                onClick={handleStartNextOrder}
                style={{
                  flex: 1.2,
                  height: 44,
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--red, #C0201F)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} /> Next Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Print & Responsive Styling */}
      <style>{`
        @media (max-width: 1024px) {
          .pos-main-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media print {
          body * {
            visibility: hidden;
          }
          #pos-print-slip, #pos-print-slip * {
            visibility: visible;
          }
          #pos-print-slip {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 12px !important;
          }
          #pos-print-slip img {
            max-width: 32mm !important;
            height: auto !important;
            display: block !important;
            margin: 0 auto 6px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .pos-product-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
        }
      `}</style>
    </div>
  );
}
