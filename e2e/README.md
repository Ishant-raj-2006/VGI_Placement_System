# Browser (end-to-end) tests

Optional. They drive the real React UI in headless Chromium against a **running, freshly seeded** instance.

```bash
# 1. Terminal A – backend with demo data (use a throw-away database!)
cd backend
export MONGODB_URI=mongodb://127.0.0.1:27017/cpms_e2e_test EXPOSE_DEV_TOKENS=true RATE_LIMIT_ENABLED=false
npm run seed:reset && npm start          # serves the API and (if built) the frontend on :5000

# 2. Terminal B
cd frontend && npm run build              # once, so the backend can serve the UI
cd ../e2e && npm install && npx playwright install chromium
BASE=http://localhost:5000 npm run smoke  # opens every page for every role, fails on console/network errors
BASE=http://localhost:5000 npm run flow   # full lifecycle: register → verify → drive → approve → apply → interview → offer → accept
```

`flow` creates new records each run; re-seed (`npm run seed:reset`) between runs for a clean state.
Set `CHROMIUM_PATH=/path/to/chrome` to use an existing browser instead of the Playwright download.
