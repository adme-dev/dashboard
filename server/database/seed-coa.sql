-- ============================================
-- Chart of Accounts Seed Data
-- Standard structure for Advertising Agencies
-- ============================================

-- Clear existing data (be careful in production!)
-- TRUNCATE chart_of_accounts CASCADE;

-- ============================================
-- ASSETS (1000s)
-- ============================================
INSERT INTO chart_of_accounts (code, name, category, description) VALUES
('1000', 'Assets', 'asset', 'All asset accounts'),
('1100', 'Cash and Bank Accounts', 'asset', 'Cash and equivalents'),
('1110', 'Operating Account', 'asset', 'Main business checking account'),
('1120', 'Payroll Account', 'asset', 'Dedicated payroll account'),
('1130', 'Savings Account', 'asset', 'Business savings'),
('1140', 'Client Trust Account', 'asset', 'Funds held for client media purchases'),
('1200', 'Accounts Receivable', 'asset', 'Money owed by clients'),
('1210', 'AR - Service Fees', 'asset', 'Receivables for agency services'),
('1220', 'AR - Media Pass-Through', 'asset', 'Receivables for media costs'),
('1230', 'AR - Retainer Prepayments', 'asset', 'Prepaid retainer credits'),
('1300', 'Work in Progress', 'asset', 'Unbilled work'),
('1310', 'WIP - Labor', 'asset', 'Unbilled labor costs'),
('1320', 'WIP - Expenses', 'asset', 'Unbilled expenses'),
('1400', 'Prepaid Expenses', 'asset', 'Prepaid items'),
('1410', 'Prepaid Media', 'asset', 'Media purchased but not yet placed'),
('1420', 'Prepaid Software', 'asset', 'Annual software subscriptions'),
('1430', 'Prepaid Insurance', 'asset', 'Insurance premiums'),
('1500', 'Fixed Assets', 'asset', 'Long-term assets'),
('1510', 'Computer Equipment', 'asset', 'Computers and hardware'),
('1520', 'Furniture and Fixtures', 'asset', 'Office furniture'),
('1530', 'Accumulated Depreciation', 'asset', 'Depreciation contra account');

-- Set parent relationships for assets
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '1100') WHERE code IN ('1110', '1120', '1130', '1140');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '1200') WHERE code IN ('1210', '1220', '1230');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '1300') WHERE code IN ('1310', '1320');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '1400') WHERE code IN ('1410', '1420', '1430');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '1500') WHERE code IN ('1510', '1520', '1530');

-- ============================================
-- LIABILITIES (2000s)
-- ============================================
INSERT INTO chart_of_accounts (code, name, category, description) VALUES
('2000', 'Liabilities', 'liability', 'All liability accounts'),
('2100', 'Accounts Payable', 'liability', 'Money owed to vendors'),
('2110', 'AP - Vendors', 'liability', 'General vendor payables'),
('2120', 'AP - Media Vendors', 'liability', 'Media platform payables'),
('2130', 'AP - Contractors', 'liability', 'Freelancer/contractor payables'),
('2200', 'Accrued Expenses', 'liability', 'Expenses incurred but not paid'),
('2210', 'Accrued Payroll', 'liability', 'Wages and salaries owed'),
('2220', 'Accrued Benefits', 'liability', 'Benefits payable'),
('2230', 'Accrued Taxes', 'liability', 'Tax liabilities'),
('2300', 'Deferred Revenue', 'liability', 'Prepayments from clients'),
('2310', 'Deferred - Retainer Advances', 'liability', 'Prepaid retainers'),
('2320', 'Deferred - Project Deposits', 'liability', 'Project deposit payments'),
('2400', 'Client Funds Held', 'liability', 'Media funds held for clients'),
('2500', 'Credit Cards Payable', 'liability', 'Corporate credit card balances'),
('2600', 'Loans Payable', 'liability', 'Business loans and lines of credit');

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '2100') WHERE code IN ('2110', '2120', '2130');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '2200') WHERE code IN ('2210', '2220', '2230');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '2300') WHERE code IN ('2310', '2320');

-- ============================================
-- EQUITY (3000s)
-- ============================================
INSERT INTO chart_of_accounts (code, name, category, description) VALUES
('3000', 'Equity', 'equity', 'Owner equity accounts'),
('3100', 'Owner''s Equity', 'equity', 'Owner investment and capital'),
('3200', 'Retained Earnings', 'equity', 'Accumulated profits'),
('3300', 'Owner Draws', 'equity', 'Owner withdrawals'),
('3400', 'Current Year Earnings', 'equity', 'Net income for current period');

-- ============================================
-- REVENUE (4000s)
-- ============================================
INSERT INTO chart_of_accounts (code, name, category, description) VALUES
('4000', 'Revenue', 'revenue', 'All income accounts'),
('4100', 'Service Revenue', 'revenue', 'Core agency services'),
('4110', 'Retainer Fees', 'revenue', 'Monthly retainer revenue'),
('4120', 'Project Fees', 'revenue', 'Project-based revenue'),
('4130', 'Hourly Billing', 'revenue', 'Time-based billing'),
('4140', 'Strategy & Consulting', 'revenue', 'Strategic planning revenue'),
('4200', 'Creative Services', 'revenue', 'Creative work revenue'),
('4210', 'Design Services', 'revenue', 'Graphic and web design'),
('4220', 'Video Production', 'revenue', 'Video content creation'),
('4230', 'Copywriting', 'revenue', 'Content writing services'),
('4240', 'Photography', 'revenue', 'Photography services'),
('4300', 'Media Revenue', 'revenue', 'Media-related income'),
('4310', 'Media Commission', 'revenue', 'Commission on media spend'),
('4320', 'Media Management Fees', 'revenue', 'Fees for managing ad accounts'),
('4330', 'Media Markup', 'revenue', 'Markup on pass-through media'),
('4400', 'Production Markup', 'revenue', 'Markup on third-party production'),
('4500', 'Other Revenue', 'revenue', 'Miscellaneous income'),
('4510', 'Rush Fees', 'revenue', 'Expedited work premiums'),
('4520', 'Reimbursed Expenses', 'revenue', 'Client expense reimbursements');

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '4100') WHERE code IN ('4110', '4120', '4130', '4140');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '4200') WHERE code IN ('4210', '4220', '4230', '4240');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '4300') WHERE code IN ('4310', '4320', '4330');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '4500') WHERE code IN ('4510', '4520');

-- ============================================
-- COST OF SERVICES (5000s)
-- Direct costs tied to client work
-- ============================================
INSERT INTO chart_of_accounts (code, name, category, description) VALUES
('5000', 'Cost of Services', 'cost_of_services', 'Direct costs of delivering services'),
('5100', 'Direct Labor', 'cost_of_services', 'Billable employee labor'),
('5110', 'Creative Labor', 'cost_of_services', 'Designer, writer, art director time'),
('5120', 'Account Management Labor', 'cost_of_services', 'AM and PM billable time'),
('5130', 'Strategy Labor', 'cost_of_services', 'Strategist billable time'),
('5140', 'Media Buyer Labor', 'cost_of_services', 'Media team billable time'),
('5200', 'Contractor Costs', 'cost_of_services', 'Freelancer and contractor expenses'),
('5210', 'Freelance Creative', 'cost_of_services', 'External creative talent'),
('5220', 'Freelance Development', 'cost_of_services', 'External developers'),
('5230', 'Freelance Media', 'cost_of_services', 'External media specialists'),
('5300', 'Media Costs', 'cost_of_services', 'Pass-through media spend'),
('5310', 'Digital Media - Google', 'cost_of_services', 'Google Ads spend'),
('5320', 'Digital Media - Meta', 'cost_of_services', 'Facebook/Instagram spend'),
('5330', 'Digital Media - LinkedIn', 'cost_of_services', 'LinkedIn Ads spend'),
('5340', 'Digital Media - Programmatic', 'cost_of_services', 'DSP and programmatic spend'),
('5350', 'Traditional Media', 'cost_of_services', 'TV, radio, print, OOH'),
('5400', 'Production Costs', 'cost_of_services', 'Third-party production'),
('5410', 'Print Production', 'cost_of_services', 'Printing and materials'),
('5420', 'Video Production', 'cost_of_services', 'External video costs'),
('5430', 'Photography Production', 'cost_of_services', 'External photo shoots'),
('5500', 'Software & Tools (Project)', 'cost_of_services', 'Project-specific software'),
('5510', 'Stock Assets', 'cost_of_services', 'Stock photos, video, music'),
('5520', 'Specialized Software', 'cost_of_services', 'Project-specific tool licenses');

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '5100') WHERE code IN ('5110', '5120', '5130', '5140');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '5200') WHERE code IN ('5210', '5220', '5230');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '5300') WHERE code IN ('5310', '5320', '5330', '5340', '5350');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '5400') WHERE code IN ('5410', '5420', '5430');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '5500') WHERE code IN ('5510', '5520');

-- ============================================
-- OPERATING EXPENSES (6000s)
-- Overhead not tied to specific client work
-- ============================================
INSERT INTO chart_of_accounts (code, name, category, description) VALUES
('6000', 'Operating Expenses', 'operating_expense', 'General business overhead'),
('6100', 'Payroll Expenses', 'operating_expense', 'Non-billable employee costs'),
('6110', 'Salaries - Admin', 'operating_expense', 'Administrative staff salaries'),
('6120', 'Salaries - Management', 'operating_expense', 'Management salaries'),
('6130', 'Payroll Taxes', 'operating_expense', 'Employer payroll taxes'),
('6140', 'Employee Benefits', 'operating_expense', 'Health, dental, 401k, etc.'),
('6150', 'Workers Compensation', 'operating_expense', 'Workers comp insurance'),
('6200', 'Facilities', 'operating_expense', 'Office and workspace costs'),
('6210', 'Rent', 'operating_expense', 'Office rent'),
('6220', 'Utilities', 'operating_expense', 'Electric, water, gas'),
('6230', 'Internet & Phone', 'operating_expense', 'Communications'),
('6240', 'Office Supplies', 'operating_expense', 'General office supplies'),
('6250', 'Equipment Maintenance', 'operating_expense', 'Repairs and maintenance'),
('6300', 'Technology', 'operating_expense', 'General tech expenses'),
('6310', 'Software Subscriptions', 'operating_expense', 'SaaS tools (non-project)'),
('6320', 'Hardware', 'operating_expense', 'Computer equipment'),
('6330', 'IT Services', 'operating_expense', 'IT support and services'),
('6400', 'Professional Services', 'operating_expense', 'External professional help'),
('6410', 'Legal Fees', 'operating_expense', 'Attorney fees'),
('6420', 'Accounting Fees', 'operating_expense', 'CPA and bookkeeping'),
('6430', 'Consulting', 'operating_expense', 'Business consultants'),
('6500', 'Marketing & BD', 'operating_expense', 'Business development'),
('6510', 'Advertising', 'operating_expense', 'Agency marketing'),
('6520', 'Website & Hosting', 'operating_expense', 'Agency web presence'),
('6530', 'Events & Sponsorships', 'operating_expense', 'Industry events'),
('6540', 'Client Entertainment', 'operating_expense', 'Client meals and entertainment'),
('6600', 'Travel', 'operating_expense', 'Business travel'),
('6610', 'Airfare', 'operating_expense', 'Flight costs'),
('6620', 'Lodging', 'operating_expense', 'Hotel costs'),
('6630', 'Ground Transportation', 'operating_expense', 'Car rental, rideshare'),
('6640', 'Meals - Travel', 'operating_expense', 'Travel meal expenses'),
('6700', 'Insurance', 'operating_expense', 'Business insurance'),
('6710', 'General Liability', 'operating_expense', 'GL insurance'),
('6720', 'Professional Liability', 'operating_expense', 'E&O insurance'),
('6730', 'Cyber Insurance', 'operating_expense', 'Data breach coverage'),
('6800', 'Other Expenses', 'operating_expense', 'Miscellaneous'),
('6810', 'Bank Fees', 'operating_expense', 'Bank service charges'),
('6820', 'Dues & Subscriptions', 'operating_expense', 'Professional memberships'),
('6830', 'Training & Education', 'operating_expense', 'Professional development'),
('6840', 'Depreciation', 'operating_expense', 'Asset depreciation'),
('6850', 'Bad Debt', 'operating_expense', 'Uncollectible accounts');

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '6100') WHERE code IN ('6110', '6120', '6130', '6140', '6150');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '6200') WHERE code IN ('6210', '6220', '6230', '6240', '6250');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '6300') WHERE code IN ('6310', '6320', '6330');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '6400') WHERE code IN ('6410', '6420', '6430');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '6500') WHERE code IN ('6510', '6520', '6530', '6540');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '6600') WHERE code IN ('6610', '6620', '6630', '6640');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '6700') WHERE code IN ('6710', '6720', '6730');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '6800') WHERE code IN ('6810', '6820', '6830', '6840', '6850');

-- ============================================
-- Sample Team Members
-- ============================================
INSERT INTO team_members (name, email, role, default_hourly_rate, target_utilization) VALUES
('Creative Director', 'creative@agency.com', 'Creative Director', 250.00, 60.00),
('Senior Designer', 'designer@agency.com', 'Senior Designer', 150.00, 80.00),
('Account Manager', 'am@agency.com', 'Account Manager', 175.00, 70.00),
('Media Buyer', 'media@agency.com', 'Media Buyer', 125.00, 85.00),
('Junior Designer', 'junior@agency.com', 'Junior Designer', 85.00, 85.00),
('Copywriter', 'copy@agency.com', 'Copywriter', 120.00, 75.00);

-- ============================================
-- Sample Client
-- ============================================
INSERT INTO agency_clients (name, billing_type, retainer_amount, payment_terms, hourly_rate, media_commission_rate, notes) VALUES
('Acme Corporation', 'hybrid', 15000.00, 30, 175.00, 15.00, 'Monthly retainer + project work + media management'),
('TechStart Inc', 'retainer', 8000.00, 15, 150.00, NULL, 'Monthly retainer for ongoing marketing'),
('Local Restaurant Group', 'project', NULL, 30, 125.00, 10.00, 'Project-based with occasional media buys');
