import {
  registerDashboardHandlers,
  registerCatalogHandlers,
  registerSalesHandlers,
  registerRepairsHandlers,
  registerSettingsHandlers,
  registerReportsHandlers,
} from './handlers/index'

export function registerHandlers() {
  registerDashboardHandlers()
  registerCatalogHandlers()
  registerSalesHandlers()
  registerRepairsHandlers()
  registerSettingsHandlers()
  registerReportsHandlers()
}
