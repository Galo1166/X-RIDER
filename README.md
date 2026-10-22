# X-RIDER

Cash-only dispatch-rider delivery marketplace. The Next.js frontend uses a local Express API backed by
SQLite during development. Supabase is not the selected backend.

## Run
```bash
npm install
npm run dev      # Next.js at http://localhost:3000 and Express at http://localhost:4000
```
Open `/login` to sign in or create an account using a Nigerian mobile number. After successful
signup or sign-in, the customer booking home is at `/home`; `/` is the public welcome page. The UI defaults to
`+234`, accepts a 10-digit national number (for example, `803 123 4567`) or one with its leading `0`,
and normalizes it to E.164. New accounts require a verified phone number, a password of at least 8
characters, and acceptance of the terms. Sign-in supports the phone/password combination and a
one-time-code option. Forgot-password requests a phone code and only changes the password after the
code is verified; resetting a password invalidates existing sessions.

During local development codes are returned as a clearly labeled on-screen preview; **SMS delivery is
not configured**, so this does not verify phone ownership outside the local prototype. Codes expire
after five minutes, can be requested once per phone every 60 seconds, and allow up to five verification
attempts. The development API also caps OTP requests at five per phone per hour and ten per day, with
additional per-IP limits for OTP requests, verification, password resets, and password logins. Passwords
are stored as salted scrypt hashes. The API limits repeated failed password logins and temporarily locks
the phone after ten attempts in a 15-minute window. These local SQLite limits are prototype safeguards,
not production controls; production needs a shared rate-limit store and proxy-aware client-IP handling.
Other development API write limits are three support tickets per user per hour, ten order requests per
user per hour, 30 route quotes and 30 chat messages per user per minute, and five rider application
submissions per user per hour. Tune these after observing real usage; production must use shared counters.

The local Express API stores accounts, sessions, profiles, orders, and OTP challenges in
`.local/x-rider.sqlite`; the file is created automatically and ignored by git. The local API refuses to
start with `NODE_ENV=production`. Do not expose the development code preview or local auth service to
real users. A production SMS provider, persistent production database, and production session/auth
architecture still need to be selected and implemented before launch. Legacy Supabase code and
migrations remain in the repository, but are not part of the chosen backend.

## Structure
```
src/app/(auth)/login        Nigerian phone/password sign in, OTP signup and password reset
src/app/(customer)/         customer app: booking home (/home), activity, account
src/app/rider/              rider application, delivery, earnings, and account screens
src/app/admin/              admin dashboard (stub, port next)
src/components/             MapLibre/Geoapify CityMap, BottomNav, Toast
src/lib/api.ts              Frontend client for the Express API
src/lib/pricing.ts          fares, promos, fee (move to DB/admin settings)
src/app/globals.css         design tokens + glass styles (rebrand here)
server/index.cjs            Development-only Express API and SQLite persistence
```
One Next.js app with route groups keeps shared types, API client and styles in one place.
If the apps need separate deploys later, split into a monorepo (Turborepo).

## Ported so far
Auth, request flow (addresses, phone, send/receive, fare breakdown, promo), activity list, account, bottom nav, theme.

## Maps and routing

The customer app uses MapLibre GL JS to display Geoapify's OpenStreetMap-based map style. Geoapify
provides address autocomplete, reverse geocoding for map taps/current location, and road routing for
distance and ETA. Create a Geoapify project and add this browser key to `.env.local`, then restart
the Next.js dev server:

```env
NEXT_PUBLIC_GEOAPIFY_API_KEY=your_geoapify_key
```

Restrict the key to the app's allowed website domains in Geoapify's dashboard, including
`localhost:3000` for development and the production domain before launch. The key is used by the
browser to load map styles and call location APIs; it must be domain-restricted and usage monitored.
The map style provides the required provider and OpenStreetMap attribution—do not hide it. Review
Geoapify's current free-plan quotas, attribution terms, and API limits before production use.

The map opens around Kano, can use the browser's current location, and supports selecting pickup and
destination by autocomplete or tapping the map. Selected coordinates are saved with each order.
Geoapify routing returns driving distance and ETA for the booking quote. The local Express API
recalculates routes from the submitted coordinates and calculates the saved order fare itself; it
does not trust browser-provided distance or price values. The fare is ₦900 base + ₦150 per road
kilometre, with the existing `XRIDER10` and `FIRST500` discounts and rounding rules. Live rider
tracking is not included yet. Without a Geoapify key, the map, place search, and route quote are
unavailable.

## Port next (in this order)
1. Customer: live location tracking, saved places, settings, and remaining order support flows.
2. Rider: document verification, live navigation/location, and push notifications.
3. Production hardening: replace the local API/database, connect SMS, configure hosting, and review access controls.

## Backend plan
- Development: Express API in `server/index.cjs`, proxied by Next.js at `/api/*`; SQLite persists local accounts, profiles, and orders.
- Admin console: `/admin` provides operations metrics, order management, rider approvals, customer/account access, cash remittances, daily rider commissions, support cases, fares/promos, admin-account management, and audit history. Set `ADMIN_PHONE=+234...` in `.env.local`, create or use that phone's normal account, then sign in again to bootstrap the first admin. Additional admins are granted through Customers & access.
- Commission: delivered orders create an immutable per-order commission record using the final customer fare after discounts. The initial rate is 20%; admins can change it for future deliveries. The Commission view shows customer-fare revenue and commission totals for today, the current Monday-to-date week, the current month, and all time, based on Africa/Lagos service dates. It also groups amounts per rider and service date. Admins confirm each full-day settlement; the date, amount, and admin are audited. Unsettled same-day commission is due by day end; from the next day, overdue riders are forced offline and blocked from accepting or being assigned new jobs until settled. Existing active deliveries can still be completed. Cash collected and cash remittances remain tracked separately.
- Development auth: Nigerian phone/password sign in; phone-OTP signup and password reset; salted password/code hashes; OTP expiry, resend cooldown, attempt limits; failed-login lockout; and an HTTP-only session cookie. The displayed development code is not sent over SMS and is not suitable for production.
- Order lifecycle: Express creates live orders immediately, calculates their price, and persists customer cancellation and rider status changes. The customer view refreshes order status from the API.
- Rider workspace: `/rider` requires an existing account sign-in before application. Applications collect vehicle type/plate, operating area, identity document, vehicle photo, and profile photo. The local development API stores uploaded files privately under `.local/rider-documents`, associates them with the applicant, and allows only the applicant or an administrator to download them. Admins can review submitted documents in the Riders section. Rider approval status, online status, delivery requests, order acceptance and status updates, support tickets, commission earnings, and active-delivery customer/rider chat use the API. Riders receive an in-app new-delivery prompt, can open pickup and drop-off directions in Google Maps, and separately record arrival at pickup and package pickup. Chat messages are stored per order and refreshed every 2.5 seconds; phone links call the other participant's account number. Delivery requests refresh every five seconds; there is no push/realtime dispatch. Identity verification, live rider location/navigation, and in-app commission settlement are not implemented.
- Production database, SMS provider, session/auth architecture, and deployment target have not been selected.
- Keep API validation and business rules server-side when replacing the local development backend.
- Realtime (jobs, rider location, chat, status): choose and implement a production solution as part of the backend decision; local chat currently polls every 2.5 seconds.
- Maps: MapLibre GL JS with Geoapify map tiles, place autocomplete, reverse geocoding, and driving routes. Rider live-location tracking remains to be integrated.
- Files (rider verification documents): development files are stored locally and are not served as public static assets. Production must use private object storage with authenticated access or signed URLs. Never store file contents in the database.
- Push notifications: Web Push or FCM. Rider app should become native (Flutter / React Native) for background location.
- Rules enforced locally on the server: price calculation, rider approval, promo validity and redemption limits, role checks, order transitions, and cash-remittance ceilings. Production controls still need a security review and deployment-specific hardening.
