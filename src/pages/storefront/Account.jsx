import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Truck, Search, CheckCircle, Clock } from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useToast } from '../../context/ToastContext';
import { customerSupabase, publicSupabase } from '../../lib/supabase';
import StorefrontCalendar from '../../components/StorefrontCalendar';
import { formatReleaseDate, getLagosDateString, deriveAdminPreorderInfo } from '../../lib/preorderUtils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const STATUS_COLORS = {
  pending: '#f59e0b', pending_payment: '#f59e0b', paid: '#16a34a',
  shipped: '#2563eb', delivered: '#16a34a', cancelled: '#ef4444',
};
const fmt = (n) => '₦' + Number(n || 0).toLocaleString();

async function notifyScheduleChange(type, order) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ type, order }),
    });
  } catch { /* non-blocking */ }
}

export default function Account() {
  const { user, signInWithGoogle } = useCustomerAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState({});   // { order_id: [{name, qty, is_preorder, preorder_release_date}] }
  const [loading, setLoading] = useState(true);

  // Guest / direct Order ID lookup state
  const [lookupOrderId, setLookupOrderId] = useState(searchParams.get('order') || '');
  const [lookupContact, setLookupContact] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookedUpOrder, setLookedUpOrder] = useState(null);

  // Active order being scheduled/rescheduled
  const [schedulingOrderId, setSchedulingOrderId] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  const loadUserOrders = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    let { data: ords, error } = await customerSupabase
      .from('orders')
      .select('id, created_at, total, status, payment_method, delivery_status, notes, scheduled_delivery_date, is_preorder, preorder_status, preorder_release_date, requires_dedicated_dispatch, scheduling_history, customer_name, customer_email, customer_phone')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      const fallback = await customerSupabase
        .from('orders')
        .select('id, created_at, total, status, payment_method, delivery_status, notes, scheduled_delivery_date, customer_name, customer_email, customer_phone')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      ords = fallback.data;
    }

    const list = ords || [];
    setOrders(list);
    if (list.length) {
      const { data: its } = await customerSupabase
        .from('order_items')
        .select('order_id, name, qty')
        .in('order_id', list.map(o => o.id));
      const grouped = {};
      (its || []).forEach(it => { (grouped[it.order_id] ||= []).push(it); });
      setItems(grouped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadUserOrders();
  }, [loadUserOrders]);

  const handleLookupOrder = async (e) => {
    if (e) e.preventDefault();
    const id = lookupOrderId.trim().toUpperCase();
    const contact = lookupContact.trim();
    if (!id || !contact) {
      showToast('Missing details', 'Please enter both your Order ID and Phone/Email', 'error');
      return;
    }
    setLookupLoading(true);
    try {
      const { data, error } = await publicSupabase.rpc('get_preorder_for_scheduling', {
        p_order_id: id,
        p_contact: contact,
      });
      if (error) throw error;
      setLookedUpOrder(data);
    } catch (err) {
      showToast('Order Lookup Failed', err.message || 'Could not find matching order', 'error');
      setLookedUpOrder(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSaveDeliveryDate = async (orderObj, contactOverride = null) => {
    if (!selectedDate) {
      showToast('Select a date', 'Please choose a valid delivery date first', 'error');
      return;
    }
    const info = deriveAdminPreorderInfo(orderObj);
    const todayLagos = getLagosDateString();
    const minDate = info.releaseDate && info.releaseDate > todayLagos ? info.releaseDate : todayLagos;
    if (selectedDate < minDate) {
      showToast('Invalid Date', `Delivery date cannot be earlier than ${formatReleaseDate(minDate)}`, 'error');
      return;
    }

    setSavingSchedule(true);
    const hadPreviousDate = Boolean(orderObj.scheduled_delivery_date);
    try {
      const client = user ? customerSupabase : publicSupabase;
      const { data, error } = await client.rpc('schedule_preorder_delivery', {
        p_order_id: orderObj.id,
        p_delivery_date: selectedDate,
        p_contact: contactOverride || orderObj.customer_phone || orderObj.customer_email || null,
        p_note: scheduleNote.trim() || null,
      });

      if (error) {
        // Fallback direct update if signed-in owner and RPC migration not yet applied
        if (user) {
          const { error: updErr } = await customerSupabase
            .from('orders')
            .update({
              scheduled_delivery_date: selectedDate,
              delivery_status: 'Rescheduled',
            })
            .eq('id', orderObj.id);
          if (updErr) throw error;
        } else {
          throw error;
        }
      }

      notifyScheduleChange(hadPreviousDate ? 'preorder_date_rescheduled' : 'preorder_date_selected', {
        id: orderObj.id,
        customer_name: orderObj.customer_name || user?.user_metadata?.full_name || 'Customer',
        customer_email: orderObj.customer_email || user?.email || null,
        customer_phone: orderObj.customer_phone || lookupContact || '',
        scheduled_delivery_date: selectedDate,
        preorder_release_date: info.releaseDate,
        total: orderObj.total,
      });

      showToast(
        hadPreviousDate ? 'Delivery Date Rescheduled' : 'Delivery Date Confirmed',
        `Your order ${orderObj.id} is scheduled for ${formatReleaseDate(selectedDate)}`,
        'success'
      );
      setSchedulingOrderId(null);
      setScheduleNote('');
      if (lookedUpOrder && lookedUpOrder.id === orderObj.id) {
        setLookedUpOrder({
          ...lookedUpOrder,
          scheduled_delivery_date: selectedDate,
          preorder_status: data?.preorder_status || 'date_selected',
        });
      }
      if (user) {
        loadUserOrders();
      }
    } catch (err) {
      showToast('Could not save date', err.message || 'Please try again', 'error');
    } finally {
      setSavingSchedule(false);
    }
  };

  const renderOrderCard = (o, isGuestLookup = false) => {
    const info = deriveAdminPreorderInfo(o);
    const todayLagos = getLagosDateString();
    const minSelectableDate = info.releaseDate && info.releaseDate > todayLagos ? info.releaseDate : todayLagos;
    const isSchedulingThis = schedulingOrderId === o.id;
    const isCancelledOrDelivered = o.status === 'cancelled' || o.status === 'delivered' || o.delivery_status === 'Delivered';
    const orderItemsList = isGuestLookup
      ? (o.items || [])
      : (items[o.id] || []);

    return (
      <div key={o.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 18, marginBottom: 14, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: '1rem', color: '#111' }}>{o.id}</span>
              {info.isPreorder && (
                <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: 20 }}>
                  Pre-Order · {info.stageLabel}
                </span>
              )}
              {Boolean(o.requires_dedicated_dispatch || /\[Dedicated Dispatch/i.test(o.notes || '')) && (
                <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Truck size={11} /> Dedicated Dispatch (2×)
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Placed {new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', background: STATUS_COLORS[o.status] || '#6b7280', padding: '4px 10px', borderRadius: 20 }}>
            {o.status === 'pending_payment' ? 'Awaiting Payment' : o.status}
          </span>
        </div>

        <div style={{ fontSize: '0.84rem', color: '#4b5563', marginBottom: 10 }}>
          {orderItemsList.map(it => `${it.qty}× ${it.name}`).join(', ') || '—'}
        </div>

        {info.isPreorder && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: '0.8rem', color: '#78350f', lineHeight: 1.5 }}>
                <div>
                  <strong>Release Date:</strong>{' '}
                  {info.formattedReleaseDate || info.releaseDate || 'Scheduled'}
                </div>
                <div>
                  <strong>Selected Delivery Date:</strong>{' '}
                  {o.scheduled_delivery_date ? (
                    <span style={{ color: '#15803d', fontWeight: 800 }}>
                      {formatReleaseDate(o.scheduled_delivery_date)}
                    </span>
                  ) : (
                    <span style={{ color: '#b45309', fontWeight: 700 }}>
                      Not yet selected (eligible from {info.formattedReleaseDate || info.releaseDate})
                    </span>
                  )}
                </div>
              </div>

              {!isCancelledOrDelivered && (
                <button
                  type="button"
                  onClick={() => {
                    if (isSchedulingThis) {
                      setSchedulingOrderId(null);
                    } else {
                      setSchedulingOrderId(o.id);
                      setSelectedDate(o.scheduled_delivery_date && o.scheduled_delivery_date >= minSelectableDate ? o.scheduled_delivery_date : minSelectableDate);
                    }
                  }}
                  style={{
                    background: o.scheduled_delivery_date ? '#fff' : '#b45309',
                    color: o.scheduled_delivery_date ? '#b45309' : '#fff',
                    border: '1.5px solid #b45309',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Calendar size={14} />
                  {isSchedulingThis
                    ? 'Cancel'
                    : o.scheduled_delivery_date
                      ? 'Reschedule Delivery Date'
                      : 'Select Delivery Date'}
                </button>
              )}
            </div>

            {isSchedulingThis && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #fcd34d' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78350f', marginBottom: 8 }}>
                  Choose your delivery date (earliest eligible date: <strong>{formatReleaseDate(minSelectableDate)}</strong>):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                  <StorefrontCalendar
                    value={selectedDate}
                    onChange={(d) => setSelectedDate(d)}
                    minDate={minSelectableDate}
                  />
                  <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Selected Date</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111', marginTop: 2 }}>
                        {selectedDate ? formatReleaseDate(selectedDate) : 'None selected'}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={scheduleNote}
                      onChange={(e) => setScheduleNote(e.target.value)}
                      placeholder="Optional delivery note (e.g. afternoon preferred)"
                      style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.84rem' }}
                    />
                    <button
                      type="button"
                      disabled={savingSchedule || !selectedDate}
                      onClick={() => handleSaveDeliveryDate(o, isGuestLookup ? lookupContact : null)}
                      className="btn-primary"
                      style={{ border: 'none', cursor: savingSchedule ? 'not-allowed' : 'pointer', padding: '11px 16px', borderRadius: 10, fontWeight: 800 }}
                    >
                      {savingSchedule ? 'Saving…' : 'Confirm Delivery Date'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', color: '#111' }}>{fmt(o.total)}</div>
          {o.scheduled_delivery_date && !info.isPreorder && (
            <div style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={13} /> Scheduled: {formatReleaseDate(o.scheduled_delivery_date)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px 60px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 8 }}>My Orders &amp; Pre-Order Scheduling</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
        Track your orders or select and reschedule your preferred delivery date for pre-ordered items on or after their release date.
      </p>

      {/* Direct Pre-Order / Guest Order Lookup Card */}
      <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '18px 20px', marginBottom: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Calendar size={17} color="#c0201f" />
          <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>Find Order / Schedule Pre-Order Delivery</h2>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>
          Checked out as a guest? Enter your Order Reference (e.g. <code>SH-...</code>) and the Phone Number or Email used at checkout to select or update your pre-order delivery date.
        </p>
        <form onSubmit={handleLookupOrder} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={lookupOrderId}
            onChange={(e) => setLookupOrderId(e.target.value.toUpperCase())}
            placeholder="Order ID (e.g. SH-123456)"
            style={{ flex: '1 1 180px', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.88rem' }}
          />
          <input
            type="text"
            value={lookupContact}
            onChange={(e) => setLookupContact(e.target.value)}
            placeholder="Phone number or Email used"
            style={{ flex: '1 1 220px', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.88rem' }}
          />
          <button
            type="submit"
            disabled={lookupLoading}
            className="btn-primary"
            style={{ border: 'none', padding: '10px 18px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={15} /> {lookupLoading ? 'Searching…' : 'Find Order'}
          </button>
        </form>

        {lookedUpOrder && (
          <div style={{ marginTop: 16 }}>
            {renderOrderCard(lookedUpOrder, true)}
          </div>
        )}
      </div>

      {/* Signed-in Account Orders */}
      {!user ? (
        <div style={{ textAlign: 'center', padding: '28px 20px', background: '#fafafa', borderRadius: 14, border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>Sign in to view all your orders</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: 16 }}>
            Sign in with Google to automatically see all orders linked to your account.
          </p>
          <button onClick={signInWithGoogle} className="btn-primary" style={{ padding: '12px 20px', border: 'none', cursor: 'pointer' }}>
            Sign in with Google
          </button>
        </div>
      ) : (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 14 }}>Your Account Orders</h2>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : orders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>You have no orders yet.</p>
          ) : (
            orders.map(o => renderOrderCard(o, false))
          )}
        </div>
      )}
    </div>
  );
}
