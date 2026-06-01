import { execSync } from 'child_process';
import path from 'path';
import * as XLSX from 'xlsx';

async function run() {
  console.log('Querying orders for May 2026 from database...');
  
  // Fetch ALL orders (including deleted ones) in the month of May 2026
  const ordersSql = `
    SELECT id, customer_name, customer_email, customer_phone, delivery_address, total, status, created_at, deleted_at, store_id, notes, channel, payment_method
    FROM orders
    WHERE created_at >= '2026-05-01T00:00:00Z' AND created_at <= '2026-05-31T23:59:59.999Z'
    ORDER BY created_at DESC;
  `;
  
  let orders = [];
  try {
    const rawResult = execSync(`npx supabase db query --linked --output=json "${ordersSql.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(rawResult);
    orders = parsed.rows || [];
  } catch (err) {
    console.error('Error executing orders query:', err);
    process.exit(1);
  }
  
  console.log(`Found ${orders.length} orders in May 2026.`);
  
  if (orders.length === 0) {
    console.log('No orders found for May 2026. Checking May of other years...');
    const fallbackSql = `
      SELECT id, customer_name, customer_email, customer_phone, delivery_address, total, status, created_at, deleted_at, store_id, notes, channel, payment_method
      FROM orders
      WHERE EXTRACT(MONTH FROM created_at) = 5
      ORDER BY created_at DESC;
    `;
    try {
      const rawResult = execSync(`npx supabase db query --linked --output=json "${fallbackSql.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(rawResult);
      orders = parsed.rows || [];
      console.log(`Found ${orders.length} orders in May across all years.`);
    } catch (err) {
      console.error('Error executing fallback orders query:', err);
      process.exit(1);
    }
  }
  
  if (orders.length === 0) {
    console.log('No orders found in May at all.');
    process.exit(0);
  }
  
  // Fetch order items for these orders
  console.log('Querying order items for May orders...');
  const orderIds = orders.map(o => `'${o.id}'`).join(',');
  const itemsSql = `
    SELECT id, order_id, name, price, qty, product_id
    FROM order_items
    WHERE order_id IN (${orderIds});
  `;
  
  let items = [];
  try {
    const rawResult = execSync(`npx supabase db query --linked --output=json "${itemsSql.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(rawResult);
    items = parsed.rows || [];
  } catch (err) {
    console.error('Error executing order items query:', err);
    process.exit(1);
  }
  
  console.log(`Found ${items.length} order items.`);
  
  // Group orders into:
  // 1. Sold (active: deleted_at is null AND status !== 'cancelled')
  // 2. Cancelled (active: deleted_at is null AND status === 'cancelled')
  // 3. Deleted (deleted_at is not null, regardless of status)
  
  const soldOrders = orders.filter(o => !o.deleted_at && o.status !== 'cancelled');
  const cancelledOrders = orders.filter(o => !o.deleted_at && o.status === 'cancelled');
  const deletedOrders = orders.filter(o => o.deleted_at);
  
  console.log(`Groups: Sold=${soldOrders.length}, Cancelled=${cancelledOrders.length}, Deleted=${deletedOrders.length}`);
  
  // Map items to orders
  const itemsByOrderId = {};
  items.forEach(i => {
    if (!itemsByOrderId[i.order_id]) itemsByOrderId[i.order_id] = [];
    itemsByOrderId[i.order_id].push(i);
  });
  
  // Build data arrays for Excel
  const soldData = [];
  const cancelledData = [];
  const deletedData = [];
  
  // Helper to format rows
  function addOrderItemsToData(groupOrders, targetDataList, isDeleted = false) {
    groupOrders.forEach(o => {
      const orderItems = itemsByOrderId[o.id] || [];
      if (orderItems.length === 0) {
        // Order has no items, add a placeholder row with order details
        targetDataList.push({
          'Order ID': o.id,
          'Customer Name': o.customer_name,
          'Customer Phone': o.customer_phone || '—',
          'Customer Email': o.customer_email || '—',
          'Product Name': '—',
          'Qty': 0,
          'Unit Price (₦)': 0,
          'Item Total (₦)': 0,
          'Order Total (₦)': Number(o.total || 0),
          'Order Date': new Date(o.created_at).toLocaleString('en-GB'),
          'Status': o.status,
          'Channel': o.channel || '—',
          'Payment Method': (o.payment_method || '—').replace(/_/g, ' '),
          ...(isDeleted ? { 'Deleted At': new Date(o.deleted_at).toLocaleString('en-GB') } : {})
        });
      } else {
        orderItems.forEach(i => {
          targetDataList.push({
            'Order ID': o.id,
            'Customer Name': o.customer_name,
            'Customer Phone': o.customer_phone || '—',
            'Customer Email': o.customer_email || '—',
            'Product Name': i.name,
            'Qty': Number(i.qty),
            'Unit Price (₦)': Number(i.price),
            'Item Total (₦)': Number(i.qty) * Number(i.price),
            'Order Total (₦)': Number(o.total || 0),
            'Order Date': new Date(o.created_at).toLocaleString('en-GB'),
            'Status': o.status,
            'Channel': o.channel || '—',
            'Payment Method': (o.payment_method || '—').replace(/_/g, ' '),
            ...(isDeleted ? { 'Deleted At': new Date(o.deleted_at).toLocaleString('en-GB') } : {})
          });
        });
      }
    });
  }
  
  addOrderItemsToData(soldOrders, soldData);
  addOrderItemsToData(cancelledOrders, cancelledData);
  addOrderItemsToData(deletedOrders, deletedData, true);
  
  // Create workbook and worksheets
  const wb = XLSX.utils.book_new();
  
  // Helper to append a sheet with column widths auto-calculated
  function appendSheetWithWidths(data, sheetName) {
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Auto-fit column widths
    const cols = Object.keys(data[0] || {});
    ws['!cols'] = cols.map(key => {
      let maxLen = key.length;
      data.forEach(row => {
        const valStr = String(row[key] || '');
        if (valStr.length > maxLen) maxLen = valStr.length;
      });
      return { wch: maxLen + 4 };
    });
    
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // Add Sold sheet
  if (soldData.length > 0) {
    appendSheetWithWidths(soldData, 'Products Sold');
  } else {
    const ws = XLSX.utils.aoa_to_sheet([['No products sold in May.']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Products Sold');
  }
  
  // Add Cancelled sheet
  if (cancelledData.length > 0) {
    appendSheetWithWidths(cancelledData, 'Products Cancelled');
  } else {
    const ws = XLSX.utils.aoa_to_sheet([['No products cancelled in May.']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Products Cancelled');
  }
  
  // Add Deleted sheet
  if (deletedData.length > 0) {
    appendSheetWithWidths(deletedData, 'Deleted Orders');
  } else {
    const ws = XLSX.utils.aoa_to_sheet([['No deleted orders in May.']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Deleted Orders');
  }
  
  // Save workbook to file
  const reportPath = path.resolve(process.cwd(), 'smokeyhut-may-report.xlsx');
  XLSX.writeFile(wb, reportPath);
  console.log(`\nSuccess! Excel report successfully written to: ${reportPath}`);
}

run();
