# XeroFlow Test Checklist

## Dev Server Startup Test
```bash
pnpm dev
```
- [ ] No import errors
- [ ] Server starts on port 3000
- [ ] No TypeScript errors

## Landing Page Test
```
http://localhost:3000/browserbase-light
```
- [ ] Page loads with XeroFlow branding
- [ ] All sections display correctly
- [ ] Responsive design works

## Login Page Test
```
http://localhost:3000/login
```
- [ ] Page loads with XeroFlow logo
- [ ] Form displays correctly
- [ ] Links work

## Dashboard Test (after login)
```
http://localhost:3000/dashboard
```
- [ ] Dashboard layout loads
- [ ] Navigation shows
- [ ] Stats cards display
- [ ] Implementations list loads

## API Tests
```bash
# Test auth endpoint (should return 401 without cookie)
curl http://localhost:3000/api/auth/me

# Test login (will fail without DB, but should not crash)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password"}'
```

## Database Tests
```bash
# Verify schema exists
psql $DATABASE_URL -c "\dt" | grep xero

# Should show:
# - xero_implementations
# - implementation_templates
# - template_tasks
# - implementation_tasks
# - task_comments
# - etc.
```

## Common Issues & Fixes

### Issue: "Cannot find module"
**Fix**: Check import path - server files should use relative imports (`../`) not `~/`

### Issue: "DATABASE_URL is not defined"
**Fix**: Create `.env` file with:
```
DATABASE_URL=postgresql://user:pass@host/db
JWT_SECRET=your-secret-key
```

### Issue: "Table does not exist"
**Fix**: Run schema SQL:
```bash
psql $DATABASE_URL -f server/database/schema-xeroflow.sql
```
