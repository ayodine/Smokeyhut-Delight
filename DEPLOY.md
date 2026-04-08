# Deploy Commands

Commands to run after making manual code changes.

## 1. Build
```bash
npm run build
```

## 2. Deploy to Firebase (frontend)
```bash
firebase deploy --only hosting
```

## 3. Deploy a Supabase Edge Function
```bash
npx supabase functions deploy verify-payment
```
Replace `verify-payment` with whichever function folder name you edited under `supabase/functions/`.

## 4. Push to GitHub
```bash
git add .
git commit -m "your message here"
git push
```

---

## All at once (build → deploy → push)
```bash
npm run build && firebase deploy --only hosting && git add . && git commit -m "your message" && git push
```
