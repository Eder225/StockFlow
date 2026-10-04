interface Product {
  id: number
  name: string
  category_id: number
  brand_id: number
  model: string
  purchase_price: number
  sale_price: number
  quantity: number
  is_deleted: number
  created_at: string
  updated_at: string
  category_name: string
  brand_name: string
}

interface Category {
  id: number
  name: string
  is_predefined: number
  created_at: string
}

interface Brand {
  id: number
  name: string
  is_predefined: number
  created_at: string
}

interface Sale {
  id: number
  client_name: string | null
  discount_amount: number
  payment_method: 'cash' | 'mobile_money'
  subtotal: number
  total: number
  status: 'validated' | 'cancelled'
  created_at: string
  cancelled_at: string | null
  item_count: number
}

interface SaleItem {
  id: number
  sale_id: number
  product_id: number
  unit_price: number
  quantity: number
  subtotal: number
  product_name: string
}

interface SaleDetail extends Sale {
  items: SaleItem[]
}

interface Repair {
  id: number
  client_name: string | null
  device_model: string
  status: 'pending' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
  labor_cost: number
  amount_paid: number
  total_due: number
  remaining: number
  created_at: string
  updated_at: string
  delivered_at: string | null
  cancelled_at: string | null
}

interface RepairPart {
  id: number
  repair_id: number
  product_id: number
  unit_price: number
  quantity: number
  product_name: string
  current_price: number
}

interface RepairDetail extends Repair {
  parts: RepairPart[]
}

interface UserInfo {
  id: number
  shop_name: string
  secret_question: string
  backup_folder_path: string
  created_at: string
  updated_at: string
}

interface ReportsData {
  totalRevenue: number
  totalSales: number
  monthRevenue: number
  monthSales: number
  selectedMonth: string
  availableMonths: string[]
  paymentBreakdown: Array<{ payment_method: string; count: number; total: number }>
  monthPaymentBreakdown: Array<{ payment_method: string; count: number; total: number }>
  totalRepairRevenue: number
  monthRepairRevenue: number
  repairsByStatus: Array<{ status: string; count: number }>
  stockValue: number
  lowStock: number
  outOfStock: number
  monthlySales: Array<{ month: string; count: number; total: number }>
  topProducts: Array<{ name: string; qty: number; total: number }>
  monthTopProducts: Array<{ name: string; qty: number; total: number }>
  totalProfit: number
  monthProfit: number
  profitByProduct: Array<{ name: string; qty: number; revenue: number; profit: number }>
  monthProfitByProduct: Array<{ name: string; qty: number; revenue: number; profit: number }>
}

interface StockByCategoryItem {
  category_id: number
  category_name: string
  product_count: number
  total_quantity: number
  total_value: number
}

interface StockByBrandItem {
  brand_id: number
  brand_name: string
  product_count: number
  total_quantity: number
  total_value: number
}

interface StockCategoryDetail {
  id: number
  name: string
  model: string
  quantity: number
  purchase_price: number
  sale_price: number
  brand_name: string
}

interface StockBrandDetail {
  id: number
  name: string
  model: string
  quantity: number
  purchase_price: number
  sale_price: number
  category_name: string
}

interface ProductProfitLoss {
  product_id: number
  sold_qty: number
  gross_revenue: number
  discount: number
  revenue: number
  profit: number
  repair_qty: number
  repair_revenue: number
  repair_profit: number
  labor_revenue: number
  adj_out_qty: number
  adj_in_qty: number
  adjustments: Array<{ movement_type: string; quantity: number; justification: string | null; created_at: string }>
}

interface StockMovement {
  id: number
  product_id: number
  movement_type: 'in' | 'out'
  quantity: number
  reason: string
  reference_type: string | null
  reference_id: number | null
  stock_before: number
  stock_after: number
  justification: string | null
  created_at: string
}

type GlobalSearchResult = {
  type: 'product' | 'sale' | 'repair' | 'history'
  id: number
  title: string
  subtitle: string
  destination: 'products' | 'sales' | 'repairs' | 'history'
}

interface HistoryLog {
  id: number
  operation_type: string
  entity_type: string
  entity_id: number | null
  description: string
  created_at: string
}

interface DashboardStats {
  productCount: number
  stockValue: number
  todaySalesCount: number
  todaySalesTotal: number
  inProgressRepairs: number
  monthlySales: Array<{ month: string; count: number; total: number }>
}

interface DashboardAlerts {
  lowStockProducts: Array<{ id: number; name: string; quantity: number; sale_price: number }>
  topProducts: Array<{ name: string; qty: number; total: number }>
  recentHistory: Array<{ description: string; created_at: string; operation_type: string }>
  shopName: string
}

interface ElectronAPI {
  dashboard: {
    getStats: () => Promise<DashboardStats>
    getAlerts: () => Promise<DashboardAlerts>
  }
  auth: {
    isFirstLaunch: () => Promise<boolean>
    setup: (data: { shopName: string; password: string; secretQuestion: string; secretAnswer: string }) => Promise<{ success: boolean }>
    login: (data: { password: string }) => Promise<{ success: boolean; error?: string }>
    getSecretQuestion: () => Promise<{ success: boolean; question?: string; error?: string }>
    verifySecretAnswer: (data: { answer: string }) => Promise<{ success: boolean; error?: string }>
    resetPassword: (data: { newPassword: string }) => Promise<{ success: boolean }>
  }
  categories: {
    list: () => Promise<Category[]>
    create: (data: { name: string }) => Promise<{ success: boolean; error?: string }>
    update: (data: { id: number; name: string }) => Promise<{ success: boolean; error?: string }>
    delete: (data: { id: number }) => Promise<{ success: boolean; error?: string }>
  }
  brands: {
    list: () => Promise<Brand[]>
    create: (data: { name: string }) => Promise<{ success: boolean; error?: string }>
    update: (data: { id: number; name: string }) => Promise<{ success: boolean; error?: string }>
    delete: (data: { id: number }) => Promise<{ success: boolean; error?: string }>
  }
  products: {
    list: (data: { showArchived: boolean }) => Promise<Product[]>
    search: (data: { query: string }) => Promise<Product[]>
    create: (data: {
      name: string; category_id: number; brand_id: number; model: string
      purchase_price: number; sale_price: number; initial_quantity: number
    }) => Promise<{ success: boolean; id?: number }>
    update: (data: {
      id: number; name: string; category_id: number; brand_id: number; model: string
      purchase_price: number; sale_price: number
    }) => Promise<{ success: boolean; error?: string }>
    archive: (data: { id: number }) => Promise<{ success: boolean }>
    restore: (data: { id: number }) => Promise<{ success: boolean }>
    adjustStock: (data: { product_id: number; movement_type: 'in' | 'out'; quantity: number; reason?: string; justification?: string }) =>
      Promise<{ success: boolean; error?: string; stock_before?: number; stock_after?: number }>
  }
  sales: {
    list: (data?: { status?: string; dateFrom?: string; dateTo?: string }) => Promise<Sale[]>
    getById: (data: { id: number }) => Promise<SaleDetail | null>
    create: (data: {
      client_name?: string; discount_amount: number; payment_method: 'cash' | 'mobile_money'
      items: Array<{ product_id: number; quantity: number }>
    }) => Promise<{ success: boolean; error?: string; saleId?: number; subtotal?: number; discount?: number; total?: number; itemCount?: number }>
    cancel: (data: { id: number }) => Promise<{ success: boolean; error?: string }>
    update: (data: {
      id: number; client_name?: string; discount_amount: number
      payment_method: 'cash' | 'mobile_money'; created_at?: string
    }) => Promise<{ success: boolean; error?: string; total?: number }>
    delete: (data: { id: number }) => Promise<{ success: boolean; error?: string }>
  }
  repairs: {
    list: (data?: { status?: string; dateFrom?: string; dateTo?: string }) => Promise<Repair[]>
    getById: (data: { id: number }) => Promise<RepairDetail | null>
    create: (data: {
      client_name?: string; device_model: string; status: string
      labor_cost: number; amount_paid: number
      parts: Array<{ product_id: number; quantity: number }>
    }) => Promise<{ success: boolean; error?: string; repairId?: number; totalDue?: number; remaining?: number }>
    update: (data: {
      id: number; client_name?: string; device_model: string
      labor_cost: number; amount_paid: number
      parts: Array<{ product_id: number; quantity: number }>
    }) => Promise<{ success: boolean; error?: string; totalDue?: number; remaining?: number }>
    changeStatus: (data: { id: number; newStatus: string }) => Promise<{ success: boolean; error?: string }>
    cancel: (data: { id: number }) => Promise<{ success: boolean; error?: string }>
    delete: (data: { id: number }) => Promise<{ success: boolean; error?: string }>
    pay: (data: { id: number; amount: number }) => Promise<{ success: boolean; error?: string; amountPaid?: number; remaining?: number }>
  }
  settings: {
    getUser: () => Promise<UserInfo | null>
    updatePassword: (data: { currentPassword: string; newPassword: string }) => Promise<{ success: boolean; error?: string }>
    updateSecretQuestion: (data: { question: string; answer: string; password: string }) => Promise<{ success: boolean; error?: string }>
    updateShopName: (data: { shopName: string }) => Promise<{ success: boolean; error?: string }>
    pickFolder: () => Promise<{ success: boolean; path?: string; error?: string }>
    updateBackupFolder: (data: { folderPath: string }) => Promise<{ success: boolean; error?: string }>
  }
  history: {
    list: (data?: { operation_type?: string; dateFrom?: string; dateTo?: string }) => Promise<HistoryLog[]>
  }
  reports: {
    getData: (data?: { month?: string }) => Promise<ReportsData>
  }
  stock: {
    byCategory: () => Promise<StockByCategoryItem[]>
    categoryDetail: (categoryId: number) => Promise<StockCategoryDetail[]>
    byBrand: () => Promise<StockByBrandItem[]>
    brandDetail: (brandId: number) => Promise<StockBrandDetail[]>
    profitLossByCategory: (categoryId: number) => Promise<ProductProfitLoss[]>
    profitLossByBrand: (brandId: number) => Promise<ProductProfitLoss[]>
  }
  global: {
    search: (data: { query: string }) => Promise<GlobalSearchResult[]>
  }
  backups: {
    create: (data: { triggerType: 'manual' | 'auto_close' | 'auto_hourly' | 'auto_movement_threshold' }) => Promise<{ success: boolean; error?: string; filePath?: string }>
    list: () => Promise<Array<{ file_path: string; trigger_type: string; created_at: string; size: number }>>
    restore: (data: { filePath: string }) => Promise<{ success: boolean; error?: string; safetyBackup?: string }>
    openFolder: () => Promise<{ success: boolean }>
    getStatus: () => Promise<{ movementCount: number; lastBackupTime: string | null; backupFolder: string }>
  }
}

interface Window {
  electronAPI: ElectronAPI
}
