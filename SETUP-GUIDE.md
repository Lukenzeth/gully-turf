# Gully Turf Booking System — Setup Guide

## What You'll End Up With
- A Google Sheet that stores all bookings and blocked dates (viewable/exportable by the school)
- A React web app that reads/writes to that sheet via a Google Apps Script API
- Anyone with the link can book; admin functions are PIN-protected

---

## Step 1: Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it **"Gully Turf Bookings"**
3. Rename the first tab (bottom of screen) from "Sheet1" to **Bookings**
4. In the **Bookings** tab, type these headers across Row 1:

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Key | Ref | Name | Email | Phone | Org | Date | DateKey | SlotId | StartTime | EndTime | Duration | BaseRate | LightingCost | GST | Total | BookedAt |

5. Click the **+** button at the bottom to add a second tab, name it **Blocks**
6. In the **Blocks** tab, type these headers across Row 1:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Key | Date | Type | StartTime | EndTime | Reason | CreatedAt |

---

## Step 2: Add the Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any code already in the editor
3. Copy the entire contents of the **google-apps-script.js** file and paste it in
4. Click **Save** (floppy disk icon or Ctrl+S)
5. Click **Deploy → New Deployment**
6. Click the gear icon and select **Web app**
7. Set these options:
   - **Description**: "Gully Turf API"
   - **Execute as**: Me
   - **Who has access**: Anyone
8. Click **Deploy**
9. You'll be asked to authorise — click through and allow access
10. **Copy the Web App URL** — it looks like:
    `https://script.google.com/macros/s/AKfycbx.../exec`

> **Important**: Every time you edit the Apps Script code, you need to create a **New Deployment** for changes to take effect. The URL changes each time you redeploy.

---

## Step 3: Connect the React App

1. Open the **gully-turf-booking.jsx** file
2. Find this line near the top:
   ```
   const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE";
   ```
3. Replace it with your actual Web App URL:
   ```
   const API_URL = "https://script.google.com/macros/s/AKfycbx.../exec";
   ```

---

## Step 4: Deploy the Website

The simplest free options:

### Option A: Vercel (Recommended)
1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Create a new GitHub repo, add the JSX file as a React project
3. Import the repo into Vercel — it auto-deploys
4. You get a URL like `gully-turf.vercel.app`

### Option B: Netlify
1. Go to [netlify.com](https://netlify.com)
2. Same process — connect GitHub, auto-deploy

### Option C: Embed on NPBHS Website
If the school website supports iframes or custom HTML, you can embed the app directly on a page under the Facility Hire section.

---

## Step 5: Change the Admin PIN

In the React file, find:
```
const ADMIN_PIN = "npbhs2024";
```
Change `npbhs2024` to whatever PIN you want the school admin to use.

---

## How It All Works

```
User clicks "Book" on website
        ↓
React app sends booking data → Google Apps Script API
        ↓
Apps Script checks for conflicts in the Google Sheet
        ↓
If clear → adds rows to the Bookings sheet
If conflict → returns error, user sees "slot taken" message
        ↓
React app refreshes data every 15 seconds
so all users see the latest bookings
```

---

## The Google Sheet

The school can open the spreadsheet at any time to:
- See all upcoming bookings
- Filter by date, name, team, etc.
- Export to CSV/Excel for reporting
- Manually delete rows if needed (admin override)

Each booking gets a unique reference (e.g. GT-A1B2C3) that customers use to manage or cancel their booking on the website.

---

## Pricing Summary (built into the app)

| Type | Rate | When |
|------|------|------|
| Weekday | $30 + GST per 30 min | Mon–Fri from 5:30 PM |
| Weekend | $50 + GST per 60 min | Sat–Sun 6 AM – 10 PM |
| Lighting | +$25/hr + GST | Any booking after 7:30 PM |

---

## Troubleshooting

**"Loading Gully Turf..." never finishes**
- Check the API_URL is correct and the Apps Script is deployed
- Make sure "Who has access" is set to "Anyone"

**Bookings not showing for other users**
- The app refreshes every 15 seconds — wait a moment
- Check the Google Sheet directly to confirm data is being written

**"Network error" on booking**
- Google Apps Script has a ~6 minute timeout — large recurring bookings may hit this
- Try booking fewer weeks at a time

**Admin can't log in**
- Default PIN is `npbhs2024` — check it hasn't been changed in the code
