import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  dashboard: {
    getStats: () => ipcRenderer.invoke('dashboard:getStats'),
    getAlerts: () => ipcRenderer.invoke('dashboard:getAlerts'),
  },
  auth: {
    isFirstLaunch: () => ipcRenderer.invoke('auth:isFirstLaunch'),
    setup: (data: { shopName: string; password: string; secretQuestion: string; secretAnswer: string }) =>
      ipcRenderer.invoke('auth:setup', data),
    login: (data: { password: string }) => ipcRenderer.invoke('auth:login', data),
    getSecretQuestion: () => ipcRenderer.invoke('auth:getSecretQuestion'),
    verifySecretAnswer: (data: { answer: string }) => ipcRenderer.invoke('auth:verifySecretAnswer', data),
    resetPassword: (data: { newPassword: string }) => ipcRenderer.invoke('auth:resetPassword', data),
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    create: (data: { name: string }) => ipcRenderer.invoke('categories:create', data),
    update: (data: { id: number; name: string }) => ipcRenderer.invoke('categories:update', data),
    delete: (data: { id: number }) => ipcRenderer.invoke('categories:delete', data),
  },
  brands: {
    list: () => ipcRenderer.invoke('brands:list'),
    create: (data: { name: string }) => ipcRenderer.invoke('brands:create', data),
    update: (data: { id: number; name: string }) => ipcRenderer.invoke('brands:update', data),
    delete: (data: { id: number }) => ipcRenderer.invoke('brands:delete', data),
  },
  products: {
    list: (data: { showArchived: boolean }) => ipcRenderer.invoke('products:list', data),
    search: (data: { query: string }) => ipcRenderer.invoke('products:search', data),
    create: (data: {
      name: string; category_id: number; brand_id: number; model: string
      purchase_price: number; sale_price: number; initial_quantity: number
    }) => ipcRenderer.invoke('products:create', data),
    update: (data: {
      id: number; name: string; category_id: number; brand_id: number; model: string
      purchase_price: number; sale_price: number
    }) => ipcRenderer.invoke('products:update', data),
    archive: (data: { id: number }) => ipcRenderer.invoke('products:archive', data),
    restore: (data: { id: number }) => ipcRenderer.invoke('products:restore', data),
    adjustStock: (data: { product_id: number; movement_type: 'in' | 'out'; quantity: number; reason?: string; justification?: string }) =>
      ipcRenderer.invoke('products:adjustStock', data),
  },
  sales: {
    list: (data?: { status?: string; dateFrom?: string; dateTo?: string }) => ipcRenderer.invoke('sales:list', data),
    getById: (data: { id: number }) => ipcRenderer.invoke('sales:getById', data),
    create: (data: {
      client_name?: string; discount_amount: number; payment_method: 'cash' | 'mobile_money'
      items: Array<{ product_id: number; quantity: number }>
    }) => ipcRenderer.invoke('sales:create', data),
    cancel: (data: { id: number }) => ipcRenderer.invoke('sales:cancel', data),
    update: (data: {
      id: number; client_name?: string; discount_amount: number
      payment_method: 'cash' | 'mobile_money'; created_at?: string
    }) => ipcRenderer.invoke('sales:update', data),
    delete: (data: { id: number }) => ipcRenderer.invoke('sales:delete', data),
  },
  repairs: {
    list: (data?: { status?: string; dateFrom?: string; dateTo?: string }) => ipcRenderer.invoke('repairs:list', data),
    getById: (data: { id: number }) => ipcRenderer.invoke('repairs:getById', data),
    create: (data: {
      client_name?: string; device_model: string; status: string
      labor_cost: number; amount_paid: number
      parts: Array<{ product_id: number; quantity: number }>
    }) => ipcRenderer.invoke('repairs:create', data),
    update: (data: {
      id: number; client_name?: string; device_model: string
      labor_cost: number; amount_paid: number
      parts: Array<{ product_id: number; quantity: number }>
    }) => ipcRenderer.invoke('repairs:update', data),
    changeStatus: (data: { id: number; newStatus: string }) => ipcRenderer.invoke('repairs:changeStatus', data),
    cancel: (data: { id: number }) => ipcRenderer.invoke('repairs:cancel', data),
    delete: (data: { id: number }) => ipcRenderer.invoke('repairs:delete', data),
    pay: (data: { id: number; amount: number }) => ipcRenderer.invoke('repairs:pay', data),
  },
  settings: {
    getUser: () => ipcRenderer.invoke('settings:getUser'),
    updatePassword: (data: { currentPassword: string; newPassword: string }) => ipcRenderer.invoke('settings:updatePassword', data),
    updateSecretQuestion: (data: { question: string; answer: string; password: string }) => ipcRenderer.invoke('settings:updateSecretQuestion', data),
    updateShopName: (data: { shopName: string }) => ipcRenderer.invoke('settings:updateShopName', data),
    pickFolder: () => ipcRenderer.invoke('settings:pickFolder'),
    updateBackupFolder: (data: { folderPath: string }) => ipcRenderer.invoke('settings:updateBackupFolder', data),
  },
  history: {
    list: (data?: { operation_type?: string; dateFrom?: string; dateTo?: string }) => ipcRenderer.invoke('history:list', data),
  },
  stock: {
    byCategory: () => ipcRenderer.invoke('stock:byCategory'),
    categoryDetail: (categoryId: number) => ipcRenderer.invoke('stock:categoryDetail', { categoryId }),
    byBrand: () => ipcRenderer.invoke('stock:byBrand'),
    brandDetail: (brandId: number) => ipcRenderer.invoke('stock:brandDetail', { brandId }),
    profitLossByCategory: (categoryId: number) => ipcRenderer.invoke('stock:profitLossByCategory', { categoryId }),
    profitLossByBrand: (brandId: number) => ipcRenderer.invoke('stock:profitLossByBrand', { brandId }),
  },
  global: {
    search: (data: { query: string }) => ipcRenderer.invoke('global:search', data),
  },
  reports: {
    getData: (data?: { month?: string }) => ipcRenderer.invoke('reports:getData', data),
  },
  backups: {
    create: (data: { triggerType: 'manual' | 'auto_close' | 'auto_hourly' | 'auto_movement_threshold' }) => ipcRenderer.invoke('backups:create', data),
    list: () => ipcRenderer.invoke('backups:list'),
    restore: (data: { filePath: string }) => ipcRenderer.invoke('backups:restore', data),
    openFolder: () => ipcRenderer.invoke('backups:openFolder'),
    getStatus: () => ipcRenderer.invoke('backups:getStatus'),
  },
})
