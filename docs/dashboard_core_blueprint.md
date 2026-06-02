# Smokeyhut Delight - Dashboard Core Functions Blueprint

This blueprint outlines the exact backend integrations, state management, database queries, and logical operations required to replicate the core functionalities of the **Smokeyhut Delight Admin Dashboard** in a new project. 

This document ignores the visual UI design and focuses entirely on the **core functions, business logic, state machines, and Supabase database interactions** for every page.

---

## 1. Authentication & Security Roster

### Login (`Login.jsx`)
* **State Management:**
  * `email` (string): User credentials email.
  * `password` (string): User credentials password.
  * `loading` (boolean): Flag to disable action buttons and show loading spinners during login requests.
* **Core Functions:**
  * **Login Request:** Uses Supabase Authentication (`supabase.auth.signInWithPassword`) to authenticate staff members.
  * **Session Initialization:** Saves session cookies and handles redirection to the admin dashboard or last requested route.
  * **Error Handling:** Catches wrong credentials, locked profiles, or database timeouts and triggers custom toasts.

### Password Reset (`ResetPassword.jsx`)
* **State Management:**
  * `email` (string): Target recovery email.
  * `newPassword` (string): Replacement password (used once reset token matches).
  * `loading` (boolean): Network status handler.
* **Core Functions:**
  * **Password Recovery Request:** Sends password reset emails via `supabase.auth.resetPasswordForEmail`.
  * **Update Password:** Once user returns from a recovery link, updates credentials using `supabase.auth.updateUser`.

### Layout Page Guard (`Layout.jsx`)
* **State Management:**
  * `sidebarCollapsed` (boolean): Persists sidebar toggle preferences inside local storage (`localStorage.getItem('sidebarCollapsed')`).
* **Core Functions:**
  * **Pulsing Anti-Flicker Guard:** Validates session loading (`loading` state from `useAuth()`). During initialization, displays a loading placeholder to prevent unauthenticated screens or partial layouts from flashes.
  * **Role-Based Routing Gate:** Restricts user routing based on active roles (`Admin`, `Manager`, `Rider`, `Staff`). Automatically redirects unauthenticated requests back to `/login`.

---

## 2. Overview Dashboard Analytics

### Overview (`Overview.jsx`)
* **Data Sources & Binds:**
  * `orders` (Supabase table)
  * `stores` (Supabase table)
* **Core Functions:**
  * **Real-time Metrics Aggregator:** Computes the following analytical metrics:
    * **Gross Sales:** SUM of `total` fields from `orders` where `status` is not `cancelled` or `pending`.
    * **Net Sales:** Gross sales minus delivery fees and item cost estimations.
    * **Order Volume:** COUNT of active orders.
    * **Store Count:** COUNT of operational locations.
  * **Sales Trends Graphing:** Groups sales volumes chronologically (weekly or monthly chunks) by matching `created_at` timestamps.
  * **Pending Order Listener:** Sets up a real-time Postgres channel subscription to the `orders` table to dynamically increment active counts when a customer places a storefront order.

---

## 3. Order Roster & Delivery Orchestrator

### Orders (`Orders.jsx`)
* **Data Sources & Binds:**
  * `orders` (Supabase table)
  * `order_items` (Supabase table)
  * `products` (Supabase table)
  * `stores` (Supabase table)
* **State Management:**
  * `ordersList` (array): Array of retrieved order entries.
  * `selectedIds` (Set): Set tracking items for bulk operations.
  * `filterStatus` (string): Filtering criteria (`all`, `pending`, `completed`, `cancelled`, `delivered`).
  * `search` (string): Search query string.
  * `isTrash` (boolean): Toggles view to soft-deleted orders (`deleted_at !== null`).
* **Core Functions & Logical Actions:**
  * **Audience Querying:** Fetches all order records, joining corresponding itemized order entries `order_items`.
  * **Soft Delete Logic:** Update orders with `deleted_at: timestamp` instead of hard deletions, enabling restore actions.
  * **Bulk Operations:** Modifies multiple orders in a single database roundtrip:
    * `bulkStatusUpdate`: Calls `.update({ status: newStatus }).in('id', selectedIds)`.
    * `bulkSoftDelete`: Calls `.update({ deleted_at: timestamp }).in('id', selectedIds)`.
    * `bulkPermanentDelete`: Performs cascades: first deletes records from `order_items` then `orders` using `.delete().in('id', selectedIds)`.
  * **Stock Validation before Order Creation:** Checks `products` table stock volume before adding manual items, throwing warning toasts if requested quantity exceeds active stock.
  * **Invoice Calculation:** Automatically aggregates total order values inside state using item costs, shipping rates, and discount multipliers.

---

## 4. Product Catalog & Inventory Auditing

### Products (`Products.jsx`)
* **Data Sources & Binds:**
  * `products` (Supabase table)
  * `categories` (Supabase table)
  * `order_items` (Supabase table)
  * Supabase Storage: `product-images` bucket.
* **Core Functions:**
  * **Image File Uploads:** Uploads raw JPEG/PNG image blobs to Supabase Storage, retrieves public CDN URLs, and links the URL to the product payload before database insertions.
  * **Categories Management:** Dynamically inserts and deletes item categorization labels within the `categories` schema.
  * **Active Inventory Listings:** Returns products where `deleted_at` is null, sorting lists descending by `created_at`.
  * **Sales Intersections:** Links `order_items` records to estimate cumulative item popularity and gross sales performance.

### Product Stats (`ProductStats.jsx`)
* **Core Functions:**
  * **Item Performance Diagnostics:** Tracks total sales counts, daily demand spikes, and individual item gross earnings by filtering active order statuses.

---

## 5. Directory Roster & Campaign Builder

### Customers & CRM (`Customers.jsx`)
* **Data Sources & Binds:**
  * `profiles` (Supabase table / customer profiles)
  * `orders` (Supabase table)
* **State Management:**
  * `customers` (array): Fetched database profile listings.
  * `sendingTest` (boolean): Flag showing email dispatcher status.
  * `tab` (string): Current visible view (`list` or `campaigns`).
* **Core Functions:**
  * **Audience Sorting switch case (`getAudience`):** Extracts targeted customer cohorts for marketing campaigns:
    * `all`: Returns all users with non-empty emails.
    * `vip_customers`: Filters users with cumulative spending `totalSpent >= 200,000`.
    * `high_aov`: Filters users with an average order value `(totalSpent / orders) >= 15,000`.
    * `loyal_buyers`: Filters users with a minimum order count of `orders >= 3`.
    * `slipped_90` / `inactive_30` / `inactive_60`: Filter segments based on date range cutoffs from `lastOrder`.
  * **Recipient Deduplication:** Automates safety checks to block duplicate email delivery by caching matched contacts inside an internal Set, matching by lowercase email addresses.
  * **Live WYSIWYG Editor Binding:** Syncs compose inputs dynamically:
    * The subject text field is bound in real-time to a live mock header.
    * Editing text blocks inside the rendered preview directly updates the primary message content state.
  * **Dynamic Placeholders Helper:** Replaces dynamic bracket items (e.g. `{customer_name}`) with corresponding column strings during recipient mapping sequences before firing emails.
  * **SMTP Test Delivery:** Fires single-recipient template drafts before dispatching campaign updates in bulk to email lists.

---

## 6. Financial Configuration & Logistics Rules

### Coupons (`Coupons.jsx`)
* **Data Table:** `coupons`
* **Core Functions:**
  * **Code Uniqueness Validation:** Validates that newly entered coupon codes do not collide with existing database codes.
  * **Activation Toggler:** Toggles the `is_active` status of coupons, disabling them for storefront checkouts instantly.
  * **Limits Auditing:** Tracks discount values (flat rate or percentages), start/expiry dates, and maximum usage locks against current usage records.

### Delivery Zones & Shipping Rules (`DeliveryZones.jsx` & `Shipping.jsx`)
* **Data Tables:** `delivery_zones`, `delivery_areas`, `orders`
* **Core Functions:**
  * **Area pricing matching:** Maps customer locations to designated delivery pricing zones, automatically fetching associated fee increments during checkout processes.
  * **Logistics carriers status routing:** Updates delivery dispatch tracking states (`shipped`, `out_for_delivery`, `delivered`) and logs rider allocations.

### Payments Ledger (`Payments.jsx`)
* **Data Table:** `orders` (filtering by payment column entries)
* **Core Functions:**
  * **Channel Reconciliation:** Groups payments based on the payment method (`cash_on_delivery`, `bank_transfer`, `pos`, `paystack`).
  * **Online Verification Hook:** Interfaces online Paystack checkout states to mark associated order invoices as `paid` within database records once payment callbacks are verified.

---

## 7. Operational Roster & Systems

### Stores (`Stores.jsx`)
* **Data Table:** `stores`
* **Core Functions:**
  * **Multi-outlet registry:** CRUD actions for physical brand locations. Toggling a store's status immediately hides it from the online storefront location selector.

### Staff & Granular Permissions (`Staff.jsx`)
* **Data Table:** `profiles` (filtering by role columns)
* **Core Functions:**
  * **Granular Privilege Matrix:** Saves access controls inside individual staff profiles as an array of permission strings (e.g., `["Settings:manage", "Finance:read", "Orders:write"]`). Pages check this array to hide edit tools or block navigation.

### Settings Context (`Settings.jsx` / `SettingsContext.jsx`)
* **Core Functions:**
  * **Global Settings Sync:** Reads store parameters from a unified state context. Saving changes updates standard settings globally:
    * Operational store hours, contact details, bank transfer targets, and ticker tape banners.

---

## 8. Finance Ledger & Reports (`/finance`)

### Expenses (`Expenses.jsx`)
* **Data Tables:** `expenses`, `expense_categories`
* **Core Functions:**
  * **Ledger tracking:** Records financial outflows, linking expenditures to specific category categories for tax audits.

### Inventory Value (`Inventory.jsx`)
* **Data Tables:** `inventory_items`, `inventory_movements`
* **Core Functions:**
  * **Movement Stock ledger:** Tracks item increases/decreases (`in`, `out`, `adjust`).
  * **Valuation Estimator:** Multiplies remaining items by historical wholesale values to determine current inventory cash asset estimations.

### Sales Reports (`SalesReport.jsx`)
* **Core Functions:**
  * **Financial aggregations:** Generates cost sheets by matching sales aggregates against expenses.
  * **XLSX Exporter:** Generates formatted multi-sheet Excel workbooks of financial statements using sheet libraries.
