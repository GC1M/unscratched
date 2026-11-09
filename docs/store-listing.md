# Store listing

Draft copy for the App Store and Google Play. The owner reviews this text and enters it in App Store Connect and the Play Console. Character counts are checked against each store's limit.

Rules for all copy: no promise of getting a deposit back, no claim that the app or its reports are legal proof or legal advice, and the "Not legal advice" line stays in every full description.

## App Store (iOS)

| Field | Limit | Text | Count |
| --- | --- | --- | --- |
| Name | 30 | Unscratched: Move-In Checklist | 30 |
| Subtitle | 30 | Rental inspection photos & PDF | 30 |
| Keywords | 100 | move in,inspection,security deposit,tenant,renter,apartment,landlord,move out,condition,report | 94 |
| Promotional text | 170 | Walk your rental room by room, photograph every scratch, and export a dated PDF report. Free, no account, and your photos stay on your phone. | 141 |

Keyword notes: Apple already indexes words in the name and subtitle, so "checklist", "rental", "photos", and "PDF" are left out of the keyword field. Use commas, no spaces after them.

### Description (App Store and Play, limit 4000)

```
Moving into a rental? Record its condition before you unpack, so you have a clear, dated record when your security deposit comes up at move-out.

Unscratched walks you through your home room by room. Mark each wall, floor, window, and appliance as good, fair, or damaged, add a note, and take photos with the in-app camera. When you finish, you get a clean PDF report you can send to your landlord or keep for move-out day.

HOW IT WORKS
- Start a move-in inspection with the address and unit.
- Go room by room. Kitchen, bathroom, bedroom, and more come with a ready rental checklist. Add, rename, or remove rooms and items to match your place.
- Mark each item's condition, add a note, and photograph anything worth remembering.
- Finish the inspection. It locks, so photos cannot be swapped later.
- Export a PDF report with every room, condition, note, and photo, and share it from your phone. You can also export the full-size photos as a zip file.

AT MOVE-OUT
- Start a move-out inspection linked to your move-in.
- Export a side-by-side comparison that shows what changed.
- Set your move-out date to get reminders on your phone before and after you leave.

PHOTOS YOU CAN CHECK LATER
- Every photo is taken inside the app and gets a SHA-256 fingerprint, printed in the report.
- When you finish, the app sends only those fingerprints (never the photos) to our server, which records when it first saw them.
- Your report includes a verification code. Anyone can enter it at unscratched.app to see when the photos were recorded.

PRIVATE BY DESIGN
- No account, no sign-in, no ads, no tracking.
- Photos, addresses, names, and notes stay on your phone.
- Free.

Unscratched helps you document a rental's condition. It is not legal advice, and it does not guarantee any outcome in a deposit dispute. For legal questions, check your local tenant laws or talk to a lawyer or a tenant rights organization.
```

## Google Play (Android)

| Field | Limit | Text | Count |
| --- | --- | --- | --- |
| App name | 30 | Unscratched: Move-In Checklist | 30 |
| Short description | 80 | Move-in inspection checklist with photos and a PDF report for renters. Free. | 76 |
| Full description | 4000 | Same text as the App Store description above | under 4000 |

Play has no keyword field. Search ranking uses the title, short description, and full description, which include "move-in inspection", "security deposit", "rental checklist", and "tenant".

## Screenshot shot list

Actual screenshots are taken later on a device or simulator with sample data (a fictional address such as "12 Elm St, Unit 4B" and the names "Alex Tenant" and "Sam Landlord"; never real people). Use light mode for the set, and take a matching dark mode set only if the owner wants one.

Sizes: iPhone 6.9" (1320 x 2868) is required by App Store Connect, and Apple scales it down for smaller iPhones. Play needs at least 2 phone screenshots (1080 x 1920 or larger works).

| # | Screen | State to show | Caption |
| --- | --- | --- | --- |
| 1 | Home | One inspection in progress (hero card with progress) and one finished below | Document your rental before you unpack |
| 2 | Room list | Kitchen, Bathroom, Bedroom, Living room with a mix of done and not done | Go room by room with a ready checklist |
| 3 | Item screen | "Walls" in the kitchen marked Damaged, a note "Scuff by the door", two photos | Mark condition, add notes, take photos |
| 4 | Camera | In-app camera framing a wall or floor | Every photo is taken in the app, never imported |
| 5 | Export | PDF report preview or the export screen with the share button | Export a dated PDF report in one tap |
| 6 | Move-out comparison | Comparison PDF page with a move-in and move-out photo side by side | Compare move-in and move-out side by side |
| 7 | Verify page (optional) | unscratched.app/v/code showing "This photo existed on the server at ..." | Anyone can check when your photos were taken |

Caption rules: short, sentence case, no "guaranteed", no "win your deposit back", no "legal proof".

## Privacy labels

What actually leaves the device (checked against the code on main):

- `src/receipts/queue.ts` posts `{ hashes: [...] }` to the `issue-receipts` edge function. The body is only 64-character lowercase hex SHA-256 strings: one per photo of a finished inspection, plus one manifest hash per inspection (the SHA-256 of that inspection's sorted photo hashes, `src/receipts/manifest.ts`). The request carries the public anon key, which is the same for every install, so it identifies the app, not the user or device.
- `supabase/functions/issue-receipts/index.ts` validates the hashes, inserts them, and returns receipts. It never logs request bodies, and it reads no headers or IP address.
- `supabase/migrations/20261109000000_receipts.sql`: the `receipts` table has only `id`, `sha256`, and `server_time`. No IP, no device id, no user id, no install id. Rows are not linked to each other or to a person.
- Supabase's own platform logs (API gateway and edge function logs) record request metadata, including the client IP, for a short retention period set by the Supabase plan. The app does not read or use them.
- The verify page (`web/verify/`) sends only the typed hash or code to the `lookup_receipt` RPC and has no analytics.
- Camera photos, addresses, names, notes, and reminders never leave the device. Reminders are local notifications, with no push token.
- No analytics, ads, crash SDK, or third-party tracking SDKs are in the app.

### Apple App Privacy (nutrition label)

Recommended answer: **Data Not Linked to You**, one data type.

| Question | Answer |
| --- | --- |
| Do you or your third-party partners collect data from this app? | Yes |
| Data type | User Content > Other User Content (photo fingerprints) |
| Purpose | App Functionality |
| Linked to the user's identity? | No |
| Used for tracking? | No |

Resulting label: "Data Not Linked to You: User Content". No "Data Used to Track You" and no "Data Linked to You" sections.

Why not "Data Not Collected": Apple counts data as collected when it is transmitted off the device and kept longer than needed to answer the request in real time. The fingerprints are stored on our server permanently so receipts stay checkable, so they are collected. They are derived from the user's photos, so "Other User Content" is the closest honest category. Claiming "Data Not Collected" now would be inaccurate and is a review risk.

Why not linked: the stored row has no account, device id, or IP, and the app has no sign-in. Nothing ties a fingerprint to a person or to the user's other fingerprints.

Why the IP is not declared: Apple's guidance excludes data that is not stored beyond what is needed to service the request. The IP only appears in the hosting provider's short-lived operational logs and is never stored in our database or used. If the owner raises the Supabase log retention or starts using those logs, revisit this and add Identifiers or Usage Data as needed.

### Google Play Data safety

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | Yes |
| Is all user data collected by your app encrypted in transit? | Yes (HTTPS to Supabase) |
| Do you provide a way for users to request that their data is deleted? | No (data is not linked to any user, so there is no account or record to delete; see the privacy policy) |
| Data type collected | App activity > Other user-generated content (photo fingerprints) |
| Collected or shared? | Collected. Not shared (Supabase is a service provider processing on our behalf, which Google does not count as sharing) |
| Processed ephemerally? | No (stored permanently) |
| Required or optional? | Required (fingerprints are sent automatically when an inspection is finished; there is no in-app toggle) |
| Purpose | App functionality |

Not declared: Photos and videos (photos never leave the device), Location, Personal info, Device or other IDs, App info and performance, Financial info.

Why not "No data collected": the same reason as Apple. Google counts data transmitted off the device and stored as collected. The fingerprints are user-generated derived data, so they are declared.

### If receipts are switched off

The app only sends fingerprints when `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set at build time (`src/receipts/config.ts`). A build without them sends nothing, and both labels can then say "Data Not Collected" / "No data collected". Ship labels that match the build that goes to the store.

## Privacy policy

`docs/privacy.md` is the policy text for both store listings. Host it at a public URL (for example unscratched.app/privacy) and fill in the effective date and contact email before submitting.

## Disclaimer

"Not legal advice" appears in:

- the full description above (last paragraph),
- the app's Settings screen, About section (`app/settings.tsx`),
- the footer of every PDF report and comparison report (`src/report/buildReportHtml.ts`, `src/report/buildComparisonHtml.ts`).
