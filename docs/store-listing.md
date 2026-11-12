# Store listing

Draft copy for the App Store and Google Play. The owner reviews this text and enters it in App Store Connect and the Play Console. Character counts are checked against each store's limit.

Rules for all copy: no promise of getting a deposit back, no claim that the app or its reports are legal proof or legal advice, and the "Not legal advice" line stays in every full description.

## App Store (iOS)

| Field | Limit | Text | Count |
| --- | --- | --- | --- |
| Name | 30 | Unscratched: Move-In Checklist | 30 |
| Subtitle | 30 | Rental inspection photos & PDF | 30 |
| Keywords | 100 | move in,inspection,security deposit,tenant,renter,apartment,landlord,move out,condition,report | 94 |
| Promotional text | 170 | Walk your rental room by room, photograph every scratch, and export a dated PDF report. Free, no account needed, and your photos stay on your phone. | 148 |

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
- Split the deposit and any deductions between roommates, and see each person's expected refund in the comparison.
- Create a deposit-return letter prefilled from the comparison.

FOR ROOMMATES
- Every roommate can sign the report with their own name and signature.
- Optional shared expenses: split rent, bills, and groceries with your roommates, see who owes whom, and settle up. This feature uses a free account (email sign-in). Inspections never need one.

IN ENGLISH AND SPANISH
- The app and its PDF reports are available in English and Spanish, with room checklists for US, UK, and Canadian rentals.

PHOTOS YOU CAN CHECK LATER
- Every photo is taken inside the app and gets a SHA-256 fingerprint, printed in the report.
- When you finish, the app sends only those fingerprints (never the photos) to our server, which records when it first saw them.
- Your report includes a verification code. Anyone can enter it at unscratched.app to see when the photos were recorded.

PRIVATE BY DESIGN
- No account needed for inspections. No ads, no tracking.
- Inspection photos, addresses, names, and notes stay on your phone.
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
- `src/lib/suggestNote.ts` (opt-in, off by default): only when the user turns on "Suggest notes from photos" in Settings and then taps "Suggest note" under a photo, it posts `{ install_id, image }` to the `suggest-note` edge function. `image` is a 768px JPEG copy of that one photo; `install_id` is a random UUID made once and kept in the local `setting` table. With the setting off the item screen renders no button and no request is made.
- `supabase/functions/suggest-note/` forwards the image to the Anthropic Messages API (Claude Haiku) and returns `{ caption, severity }`. It never logs or stores the image. `supabase/migrations/20261111000100_suggest_note_usage.sql` stores only `install_id`, `day`, and `count` for the 30-a-day limit. Anthropic processes the image to answer the request and, under its API terms, may retain inputs for a limited period for trust and safety; it does not train on API data by default.
- `src/receipts/acknowledgements.ts` and `supabase/migrations/20261111000000_acknowledgements.sql`: a landlord opening the acknowledgement link (a web page, not the app) stores `manifest_sha256`, the typed `landlord_name`, and the time. The app only reads acknowledgements for its own manifest hash. Nothing about the tenant is sent.
- Shared expenses (`src/expenses/api.ts`, `supabase/migrations/20261112000000_expenses.sql`), optional, only after email sign-in: the user's email (Supabase Auth), a Supabase user id, per-group display names, group name, currency and invite code, expenses (description, amount, category, date, payer, shares, itemized lines), settlements, recurring expenses, and receipt photos in the private `expense-receipts` storage bucket. All rows are tied to the user id, so they are linked to the user. RLS limits reads to group members.
- Addresses, names, notes, signatures, the deposit split, and reminders of inspections never leave the device. Photos leave it only through the opt-in suggestion above. Reminders are local notifications, with no push token.
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

With note suggestions in the build (they are, from #82), add two more rows, both App Functionality, not linked, not used for tracking:

| Data type | Why |
| --- | --- |
| User Content > Photos or Videos | The opt-in suggestion sends one downscaled photo. We do not keep it, but Anthropic (our third-party partner here) may retain API inputs for a limited period, which is longer than real-time servicing. Declaring it is the conservative answer. |
| Identifiers > Device ID | The random install id, stored with daily counts for the rate limit. It is app-generated, not the IDFA or IDFV, and tied to no account. Declared because it is an identifier stored server-side. |

Resulting label: "Data Not Linked to You: User Content, Identifiers".

With shared expenses in the build (they are, from #103), add these rows. All are App Functionality, linked to the user (they are stored under their account), and not used for tracking:

| Data type | Why |
| --- | --- |
| Contact Info > Email Address | Sign-in with an emailed code. |
| Contact Info > Name | The display name shown to other group members. |
| Financial Info > Other Financial Info | Expense amounts, shares, and payments between roommates. No card or bank details. |
| User Content > Photos or Videos | Receipt photos attached to expenses. |
| User Content > Other User Content | Expense descriptions, categories, and group names. |
| Identifiers > User ID | The Supabase account id. |

Resulting label: "Data Linked to You: Contact Info, Financial Info, User Content, Identifiers" and "Data Not Linked to You: User Content, Identifiers". The inspection fingerprints and note suggestions stay not linked: they never carry the account id.

Landlord acknowledgements are not declared: the landlord's name is entered on a web page by the landlord, not collected from the app's user, and the app only reads it back.

**Account deletion (App Store Review Guideline 5.1.1(v), Google Play account deletion policy):** signed-in users delete their account in the app (Shared expenses > Delete account, with a confirmation). The delete-account edge function deletes the account at once; see "Deleting your data" in the privacy policy for what happens to group data. For Google Play's web deletion link, use the privacy policy URL: its "Deleting your data" section explains the in-app steps and gives the email route for people who no longer have the app. This needs both the shared-expenses follow-up (#105) and the account deletion PR merged, and the `delete-account` function deployed (`supabase functions deploy delete-account`), before a build with shared expenses is submitted.

Why not "Data Not Collected": Apple counts data as collected when it is transmitted off the device and kept longer than needed to answer the request in real time. The fingerprints are stored on our server permanently so receipts stay checkable, so they are collected. They are derived from the user's photos, so "Other User Content" is the closest honest category. Claiming "Data Not Collected" now would be inaccurate and is a review risk.

Why the fingerprints are not linked: the stored row has no account, device id, or IP, and receipts are requested without the shared-expenses session. Nothing ties a fingerprint to a person or to the user's other fingerprints.

Why the IP is not declared: Apple's guidance excludes data that is not stored beyond what is needed to service the request. The IP only appears in the hosting provider's short-lived operational logs and is never stored in our database or used. If the owner raises the Supabase log retention or starts using those logs, revisit this and add Identifiers or Usage Data as needed.

### Google Play Data safety

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | Yes |
| Is all user data collected by your app encrypted in transit? | Yes (HTTPS to Supabase) |
| Do you provide a way for users to request that their data is deleted? | Yes. Signed-in users delete their shared-expenses account in the app (Shared expenses > Delete account), and the privacy policy URL is the web link for deletion requests (by email). Inspection data is not linked to any user, so only shared-expenses accounts can be deleted. Data kept after deletion: expenses and payments in groups shared with other members stay, no longer linked to the account, because those members' balances depend on them |
| Data type collected | App activity > Other user-generated content (photo fingerprints) |
| Collected or shared? | Collected. Not shared (Supabase is a service provider processing on our behalf, which Google does not count as sharing) |
| Processed ephemerally? | No (stored permanently) |
| Required or optional? | Required (fingerprints are sent automatically when an inspection is finished; there is no in-app toggle) |
| Purpose | App functionality |

Note suggestions add two more data types:

| Data type collected | Collected or shared? | Processed ephemerally? | Required or optional? | Purpose |
| --- | --- | --- | --- | --- |
| Photos and videos > Photos | Collected. Not shared (Supabase and Anthropic process it on our behalf as service providers) | No (conservative: Anthropic may retain API inputs for a limited period) | Optional (off by default; sent only when the user taps Suggest note) | App functionality |
| Device or other IDs | Collected. Not shared | No (kept with daily counts) | Optional | App functionality (rate limiting) |

Shared expenses add these types. All are collected, not shared, not processed ephemerally, optional (only after sign-in), and used for app functionality and account management:

| Data type collected | What |
| --- | --- |
| Personal info > Email address | Sign-in |
| Personal info > Name | Display name in a group |
| Personal info > User IDs | Supabase account id |
| Financial info > Other financial info | Expense amounts, shares, payments |
| Photos and videos > Photos | Receipt photos |
| App activity > Other user-generated content | Expense descriptions, categories, group names |

Not declared: Location, App info and performance, Messages, Contacts.

Why not "No data collected": the same reason as Apple. Google counts data transmitted off the device and stored as collected. The fingerprints are user-generated derived data, so they are declared.

### If receipts are switched off

The app only sends fingerprints when `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set at build time (`src/receipts/config.ts`). A build without them sends nothing, and both labels can then say "Data Not Collected" / "No data collected". Ship labels that match the build that goes to the store. Note suggestions use the same build-time config, so such a build sends no photos or install id either.

## Privacy policy

`docs/privacy.md` is the policy text for both store listings. Host it at a public URL (for example unscratched.app/privacy) and fill in the effective date and contact email before submitting.

## Disclaimer

"Not legal advice" appears in:

- the full description above (last paragraph),
- the app's Settings screen, About section (`app/settings.tsx`),
- the footer of every PDF report and comparison report (`src/report/buildReportHtml.ts`, `src/report/buildComparisonHtml.ts`).
