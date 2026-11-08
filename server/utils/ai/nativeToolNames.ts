/** Native-only capability inventory; remote MCP discovery is intentionally unchanged. */
export const NATIVE_SUPPLEMENTAL_TOOL_NAMES = [
  'get_agent_clients', 'ask_spend_controller', 'ask_publishing_planner',
  'ask_financial_watch', 'ask_traffic_controller', 'read_official_documentation'
] as const
