import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Db = ReturnType<typeof createClient>;

// The exact column set both the poll API (export-orders) and the push API
// (push-order) select from `orders`, so partners receive an identical shape no
// matter which path an order arrives on. Change it here and both stay in sync.
export const ORDER_COLUMNS =
  'id,status,channel,created_at,updated_at,total,delivery_fee,payment_method,customer_name,customer_phone,customer_email,delivery_address,delivery_zone,notes';

export interface ShapedOrder {
  id: string;
  status: string;
  channel: string;
  created_at: string;
  updated_at: string;
  total: number;
  delivery_fee: number;
  payment_method: string;
  notes: string | null;
  customer: {
    name: string;
    phone: string;
    email: string | null;
    address: string;
    zone: string | null;
  };
  items: { product_id: number | null; name: string; price: number; qty: number }[];
}

// Given raw `orders` rows (selected with ORDER_COLUMNS), fetch their line items
// in one query and return the partner-facing JSON shape. Empty in → empty out.
export async function shapeOrders(db: Db, orders: Record<string, any>[]): Promise<ShapedOrder[]> {
  const ids = orders.map((o) => o.id);
  const itemsByOrder: Record<string, ShapedOrder['items']> = {};

  if (ids.length) {
    const { data: items, error } = await db
      .from('order_items')
      .select('order_id,product_id,name,price,qty')
      .in('order_id', ids);
    if (error) throw error;
    for (const it of items ?? []) {
      (itemsByOrder[it.order_id] ??= []).push({
        product_id: it.product_id, name: it.name, price: it.price, qty: it.qty,
      });
    }
  }

  return orders.map((o) => ({
    id: o.id,
    status: o.status,
    channel: o.channel,
    created_at: o.created_at,
    updated_at: o.updated_at,
    total: o.total,
    delivery_fee: o.delivery_fee,
    payment_method: o.payment_method,
    notes: o.notes,
    customer: {
      name: o.customer_name,
      phone: o.customer_phone,
      email: o.customer_email,
      address: o.delivery_address,
      zone: o.delivery_zone,
    },
    items: itemsByOrder[o.id] ?? [],
  }));
}
