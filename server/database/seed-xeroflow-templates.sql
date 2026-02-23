-- ============================================
-- XeroFlow Default Templates
-- Seed data for standard implementation templates
-- ============================================

-- Insert Default Templates
INSERT INTO implementation_templates (name, description, template_type, company_type, estimated_duration_days, default_priority, is_system_template, is_active) VALUES
('Standard Small Business', 'Complete Xero setup for small businesses with basic accounting needs', 'standard', 'any', 14, 'medium', true, true),
('Retail Business Setup', 'Specialized template for retail clients with inventory and POS integration', 'retail', 'company', 21, 'medium', true, true),
('Professional Services', 'For consultants, agencies, and service-based businesses', 'professional_services', 'any', 14, 'medium', true, true),
('Construction/Trades', 'For builders, contractors, and trade businesses with job costing', 'construction', 'any', 21, 'high', true, true),
('E-commerce Setup', 'Online retailers with multiple sales channels and payment gateways', 'ecommerce', 'company', 21, 'high', true, true),
('Sole Trader Basic', 'Streamlined setup for sole traders with simple requirements', 'standard', 'sole_trader', 7, 'low', true, true),
('Multi-Entity Group', 'For corporate groups with multiple subsidiaries requiring consolidation', 'multi_entity', 'company', 45, 'high', true, true),
('Non-Profit Organization', 'For charities and non-profits with specific reporting requirements', 'non_profit', 'non_profit', 21, 'medium', true, true);

-- Get template IDs for task creation
DO $$
DECLARE
  v_standard_id UUID;
  v_retail_id UUID;
  v_professional_id UUID;
  v_construction_id UUID;
  v_ecommerce_id UUID;
  v_sole_trader_id UUID;
BEGIN
  -- Get template IDs
  SELECT id INTO v_standard_id FROM implementation_templates WHERE name = 'Standard Small Business';
  SELECT id INTO v_retail_id FROM implementation_templates WHERE name = 'Retail Business Setup';
  SELECT id INTO v_professional_id FROM implementation_templates WHERE name = 'Professional Services';
  SELECT id INTO v_construction_id FROM implementation_templates WHERE name = 'Construction/Trades';
  SELECT id INTO v_ecommerce_id FROM implementation_templates WHERE name = 'E-commerce Setup';
  SELECT id INTO v_sole_trader_id FROM implementation_templates WHERE name = 'Sole Trader Basic';

  -- ============================================
  -- STANDARD SMALL BUSINESS TEMPLATE TASKS
  -- ============================================
  
  INSERT INTO template_tasks (template_id, name, description, sort_order, category, estimated_hours, default_assignee_role, checklist_items, client_description, show_to_client) VALUES
  (v_standard_id, 'Initial Discovery Call', 'Understand client needs, current systems, and requirements', 1, 'setup', 1.0, 'project_manager', '["Review current accounting system", "Identify pain points", "Discuss goals and timeline", "Explain XeroFlow process"]','We will discuss your current accounting setup and understand your business requirements.', true),
  
  (v_standard_id, 'Xero Organization Setup', 'Create Xero organization or connect existing one', 2, 'setup', 1.0, 'consultant', '["Create Xero org (if new)", "Verify organization details", "Set fiscal year end", "Configure base currency", "Set GST/VAT settings"]','Setting up your Xero organization with correct business details and settings.', true),
  
  (v_standard_id, 'Chart of Accounts Configuration', 'Customize chart of accounts based on client needs', 3, 'configuration', 2.0, 'consultant', '["Review default accounts", "Add custom accounts", "Set account codes", "Configure bank accounts", "Set up credit cards"]','Configuring your chart of accounts to match your business structure.', true),
  
  (v_standard_id, 'Bank Feed Connections', 'Connect bank accounts and credit cards to Xero', 4, 'configuration', 1.0, 'consultant', '["Add bank accounts", "Connect bank feeds", "Set up credit cards", "Configure PayPal (if needed)", "Test feed connections"]','Connecting your bank accounts so transactions flow automatically into Xero.', true),
  
  (v_standard_id, 'Invoice Branding Setup', 'Configure invoice templates and branding', 5, 'configuration', 1.0, 'consultant', '["Upload logo", "Set brand colors", "Configure payment terms", "Set default messages", "Create invoice templates"]','Customizing your invoices with your logo and brand colors.', true),
  
  (v_standard_id, 'Payment Services Integration', 'Set up payment gateways for online payments', 6, 'configuration', 1.0, 'consultant', '["Configure Stripe (if needed)", "Set up GoCardless for Direct Debit", "Configure PayPal", "Test payment flows", "Enable pay-on-invoice"]','Setting up online payment options so your customers can pay invoices easily.', true),
  
  (v_standard_id, 'User Access & Permissions', 'Add team members and configure access levels', 7, 'configuration', 1.0, 'consultant', '["Add client users", "Set user permissions", "Configure advisor access", "Set up 2FA", "Create user guide"]','Adding your team members with appropriate access levels.', true),
  
  (v_standard_id, 'Opening Balances Entry', 'Enter opening balances and conversion balances', 8, 'data_migration', 2.0, 'consultant', '["Gather opening balances", "Enter conversion balances", "Verify balances", "Lock conversion date", "Run opening reports"]','Entering your opening balances from your previous accounting system.', true),
  
  (v_standard_id, 'Historical Data Import', 'Import historical invoices, bills, and contacts', 9, 'data_migration', 3.0, 'consultant', '["Export data from old system", "Format import files", "Import contacts", "Import invoices", "Import bills", "Verify data accuracy"]','Importing your historical data (invoices, bills, contacts) from your old system.', true),
  
  (v_standard_id, 'First Month Reconciliation', 'Complete first bank reconciliation', 10, 'review', 2.0, 'consultant', '["Review bank feed", "Match transactions", "Create rules", "Reconcile accounts", "Review exceptions"]','Completing your first bank reconciliation to ensure everything balances.', false),
  
  (v_standard_id, 'Training Session 1: Basics', 'Cover daily operations - invoicing, expenses, bank rec', 11, 'training', 2.0, 'consultant', '["Dashboard overview", "Creating invoices", "Recording expenses", "Bank reconciliation", "Basic reporting", "Q&A session"]','Training session covering daily operations: invoicing, expenses, and bank reconciliation.', true),
  
  (v_standard_id, 'Training Session 2: Advanced', 'Cover advanced features - reporting, integrations, automation', 12, 'training', 2.0, 'consultant', '["Advanced reporting", "Budget vs actual", "Fixed assets", "Integration options", "Automation rules", "Best practices"]','Advanced training covering reports, budgets, and integrations.', true),
  
  (v_standard_id, 'Go-Live Checklist', 'Final verification before client goes live', 13, 'go_live', 1.0, 'project_manager', '["All accounts reconciled", "Training completed", "Users confident", "Support plan confirmed", "Go-live date set"]','Final checks before you start using Xero for your daily operations.', false),
  
  (v_standard_id, '30-Day Support Period', 'Post go-live support and optimization', 14, 'support', 4.0, 'consultant', '["Weekly check-ins", "Answer questions", "Optimize workflows", "Additional training if needed", "Handover to ongoing support"]','30 days of post go-live support to answer questions and optimize your setup.', true);


  -- ============================================
  -- RETAIL BUSINESS TEMPLATE TASKS (additional to standard)
  -- ============================================
  
  INSERT INTO template_tasks (template_id, name, description, sort_order, category, estimated_hours, default_assignee_role, checklist_items, client_description, show_to_client) VALUES
  (v_retail_id, 'Initial Discovery Call', 'Understand retail-specific needs: inventory, POS, multi-location', 1, 'setup', 1.5, 'project_manager', '["Review current POS system", "Inventory management needs", "Multi-location requirements", "E-commerce channels", "Payment processing setup"]','Discussing your retail-specific requirements including POS and inventory.', true),
  
  (v_retail_id, 'Inventory Setup', 'Configure tracked inventory in Xero', 5, 'configuration', 3.0, 'consultant', '["Enable inventory", "Set up inventory items", "Configure cost of goods sold", "Set reorder points", "Import initial stock levels"]','Setting up inventory tracking for your products.', true),
  
  (v_retail_id, 'POS Integration', 'Connect retail POS system to Xero', 6, 'configuration', 4.0, 'consultant', '["Choose POS integration method", "Configure Vend/Shopify/ Square", "Map POS accounts", "Test daily sync", "Set up clearing accounts"]','Connecting your POS system to sync sales data with Xero.', true),
  
  (v_retail_id, 'E-commerce Integration', 'Connect online sales channels', 7, 'configuration', 3.0, 'consultant', '["Connect Shopify/WooCommerce", "Map payment gateways", "Configure tax settings", "Set up shipping accounts", "Test order sync"]','Connecting your online store to import sales automatically.', true);


  -- ============================================
  -- PROFESSIONAL SERVICES TEMPLATE TASKS
  -- ============================================
  
  INSERT INTO template_tasks (template_id, name, description, sort_order, category, estimated_hours, default_assignee_role, checklist_items, client_description, show_to_client) VALUES
  (v_professional_id, 'Initial Discovery Call', 'Understand project-based billing and time tracking needs', 1, 'setup', 1.0, 'project_manager', '["Current project management tools", "Time tracking requirements", "Billing methods (fixed/time)", "Retainer arrangements", "Reporting needs"]','Understanding your project billing and time tracking requirements.', true),
  
  (v_professional_id, 'Project Setup', 'Configure Xero Projects or integrate with practice management', 5, 'configuration', 2.0, 'consultant', '["Set up Xero Projects", "Configure task types", "Set up time tracking", "Configure billing rates", "Set up retainer tracking"]','Setting up project tracking and time billing functionality.', true),
  
  (v_professional_id, 'Time Tracking Training', 'Train team on logging time and expenses', 11, 'training', 1.5, 'consultant', '["Xero Projects app setup", "Logging time entries", "Expense claims", "Billable vs non-billable", "Approval workflows"]','Training your team on time tracking and expense logging.', true);


  -- ============================================
  -- CONSTRUCTION/TRADES TEMPLATE TASKS
  -- ============================================
  
  INSERT INTO template_tasks (template_id, name, description, sort_order, category, estimated_hours, default_assignee_role, checklist_items, client_description, show_to_client) VALUES
  (v_construction_id, 'Initial Discovery Call', 'Understand job costing and project-based accounting needs', 1, 'setup', 2.0, 'project_manager', '["Current job management system", "Job costing requirements", "Subcontractor management", "Progress billing needs", "Retention money tracking"]','Discussing job costing and project-specific accounting requirements.', true),
  
  (v_construction_id, 'Job Costing Setup', 'Configure tracking categories for jobs', 5, 'configuration', 4.0, 'consultant', '["Set up tracking categories", "Configure job codes", "Set up cost centers", "Configure divisions (if multi)", "Create job templates"]','Setting up job costing to track profitability per project.', true),
  
  (v_construction_id, 'Progress Billing Setup', 'Configure milestone and progress invoicing', 6, 'configuration', 2.0, 'consultant', '["Set up progress claim templates", "Configure retention settings", "Set up variations tracking", "Configure AIA-style billing", "Create payment schedules"]','Setting up progress billing for milestone-based invoicing.', true),
  
  (v_construction_id, 'Subcontractor Management', 'Setup for managing subbies and CIS (UK) / Subcontractor tax', 7, 'configuration', 3.0, 'consultant', '["Configure subcontractor tracking", "Set up CIS if UK", "Configure tax codes", "Set up payment runs", "Create compliance reports"]','Setting up subcontractor management and compliance tracking.', true);


  -- ============================================
  -- E-COMMERCE TEMPLATE TASKS
  -- ============================================
  
  INSERT INTO template_tasks (template_id, name, description, sort_order, category, estimated_hours, default_assignee_role, checklist_items, client_description, show_to_client) VALUES
  (v_ecommerce_id, 'Initial Discovery Call', 'Understand multi-channel sales and fulfillment needs', 1, 'setup', 2.0, 'project_manager', '["Current sales channels", "Inventory locations", "Fulfillment method", "Multi-currency needs", "Tax nexus requirements"]','Discussing your multi-channel sales and inventory requirements.', true),
  
  (v_ecommerce_id, 'Multi-Channel Inventory Setup', 'Configure inventory across multiple sales channels', 5, 'configuration', 4.0, 'consultant', '["Choose inventory management approach", "Configure A2X or similar", "Set up channel mappings", "Configure COGS accounts", "Set up inventory locations"]','Setting up inventory management across all your sales channels.', true),
  
  (v_ecommerce_id, 'Payment Gateway Reconciliation', 'Setup for Stripe, PayPal, Amazon settlements', 6, 'configuration', 3.0, 'consultant', '["Connect payment gateways", "Configure clearing accounts", "Set up fee tracking", "Create reconciliation rules", "Test settlement imports"]','Setting up automatic reconciliation for your payment gateways.', true),
  
  (v_ecommerce_id, 'Multi-Currency Setup', 'Configure foreign currency transactions', 7, 'configuration', 2.0, 'consultant', '["Enable multi-currency", "Set up currency accounts", "Configure exchange rates", "Set up PayPal foreign currency", "Test foreign transactions"]','Setting up multi-currency for international sales.', true);


  -- ============================================
  -- SOLE TRADER BASIC TEMPLATE (streamlined)
  -- ============================================
  
  INSERT INTO template_tasks (template_id, name, description, sort_order, category, estimated_hours, default_assignee_role, checklist_items, client_description, show_to_client) VALUES
  (v_sole_trader_id, 'Initial Call & Setup', 'Quick setup call and Xero organization creation', 1, 'setup', 1.0, 'consultant', '["Discuss requirements", "Create Xero org", "Set basic settings", "Add bank accounts"]','Quick setup call to get you started.', true),
  
  (v_sole_trader_id, 'Bank Feeds & Basic Setup', 'Connect banks and configure basic settings', 2, 'configuration', 1.0, 'consultant', '["Connect bank feeds", "Set up invoice branding", "Add basic contacts", "Configure sales tax"]','Connecting your bank accounts and basic configuration.', true),
  
  (v_sole_trader_id, 'Training Session', 'One-hour training covering essentials', 3, 'training', 1.0, 'consultant', '["Dashboard overview", "Creating invoices", "Recording expenses", "Bank reconciliation", "Basic reports", "Q&A"]','One-hour training session covering the essentials.', true),
  
  (v_sole_trader_id, 'Go-Live', 'Final checks and handover', 4, 'go_live', 0.5, 'consultant', '["Verify setup", "Go live", "Provide support contact"]','Final checks and you are ready to go!', true);

END $$;

-- Insert template usage stats
UPDATE implementation_templates 
SET usage_count = 0 
WHERE is_system_template = true;

-- Add comments explaining templates
COMMENT ON TABLE implementation_templates IS 'Reusable templates for different types of Xero implementations';
COMMENT ON TABLE template_tasks IS 'Individual tasks within each template';

-- Verify insertion
SELECT t.name as template_name, COUNT(tt.id) as task_count
FROM implementation_templates t
LEFT JOIN template_tasks tt ON t.id = tt.template_id
WHERE t.is_system_template = true
GROUP BY t.name
ORDER BY t.name;
