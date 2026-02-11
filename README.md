# Scavenger Hunt Web App

## Setup
1. Install deps:
   ```bash
   npm install
   ```
2. Create `.env` from `.env.example` and set:
   - `DATABASE_URL`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
3. Run:
   ```bash
   npm start
   ```

Open `http://localhost:3000`.

## Notes
- Admin console: `http://localhost:3000/admin`
- Uses PostgreSQL for app data and sessions.
- Answers are normalized (lowercased, non-alphanumeric stripped) before comparison.
- Scores are based on total completion time plus top-3 bonuses.
