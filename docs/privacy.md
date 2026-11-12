# Unscratched Privacy Policy

Effective date: [effective date]

Unscratched is a free app that helps renters document the condition of a home. This page explains what happens to your information. The short version: your inspection photos, addresses, names, and notes stay on your phone. The only thing that leaves it is a fingerprint of each photo, used to get a timestamp receipt. If you turn on the optional "Suggest notes from photos" setting, a photo you choose is also sent, once, to get a suggested note, and is not stored. If you use the optional Shared expenses feature, you sign in with your email, and the expenses you and your roommates add are stored on our server so everyone in the group can see them.

## What we collect

Inspections need no account. Unscratched has no analytics, no ads, and no tracking SDKs. We do not sell any data.

By default, the only thing we receive is photo fingerprints (see "Timestamp receipts" below). We never receive your inspection addresses, names, notes, or anything that identifies you. We only receive an inspection photo if you turn on note suggestions and tap "Suggest note" on it (see "Optional note suggestions" below).

Two optional features send more:

- Shared expenses needs an account (your email address) and stores what you enter there on our server, linked to that account (see "Optional shared expenses" below).
- If you ask your landlord to acknowledge a report, the name your landlord types is stored with the report's fingerprint (see "Landlord acknowledgements" below).

## Where your data lives

Everything you enter for an inspection (addresses, names, notes, photos, signatures, and the deposit split between roommates) is stored only on your device. Photos are saved in the app's documents folder. Depending on your settings, iOS may include that folder in your own iCloud device backup. That backup is controlled by you and Apple, not by us.

## Sharing

The app only shares something when you choose to. If you create a PDF report and share it, you do that yourself through the system share sheet, and you pick where it goes. We do not receive a copy.

"Send to landlord" opens your own mail app with the report attached, or the share sheet if no mail account is set up. The email is sent by your mail app, not through our servers. A landlord email or portal link you save stays on your phone; the app only opens the portal link in your browser when you ask. The date and method you sent the report are recorded on your phone and printed in later reports.

## Permissions

- Camera: used only to take inspection photos inside the app. Photos are not sent anywhere unless you use optional note suggestions on a photo, as described below. Their fingerprints are sent for timestamp receipts.
- Notifications: if you set a move-out date and allow notifications, the app schedules reminders locally on your device (7 days before move-out, and 14 and 30 days after). No push notification server is involved and no push token is created.

## Timestamp receipts

A phone's clock can be changed, so when you finish an inspection the app asks our server to record when it first saw each photo. To do that it sends:

- the SHA-256 fingerprint (hash) of each photo, and
- one more SHA-256 fingerprint made from the list of that inspection's photo fingerprints.

A fingerprint is a 64-character string. It cannot be turned back into the photo, and it says nothing about where the photo was taken or who took it. Nothing else is sent: no photos, addresses, names, notes, account, or device identifier.

The server stores each fingerprint with the time it was first received and returns a receipt. Our database keeps no IP address and nothing that links a fingerprint to you or to other fingerprints. Like most web services, our hosting provider (Supabase) may keep standard request logs, which can include an IP address, for a short time to run and secure the service. We do not use those logs to identify anyone.

If you are offline, the fingerprints wait on your phone and are sent later. Until then, your report says "Receipt pending".

Anyone who has a fingerprint, or the verification code printed in your report, can check the time on our verify page (unscratched.app/v/...). They learn only that the fingerprint was received at that time. They cannot see the photo or anything about you.

Fingerprints are kept so receipts stay checkable. Because they are not linked to you, we cannot find "your" fingerprints to delete them.

## Landlord acknowledgements

After you finish an inspection, you can send your landlord a link to acknowledge the report. The link contains the report's fingerprint, not the report. If your landlord opens it and types their name, our server stores the fingerprint, that name, and the time. Your app then fetches the acknowledgements for your report so it can show them. Nothing about you is sent or stored. Each report can be acknowledged at most 5 times.

## Optional shared expenses

Shared expenses lets roommates split bills. It is the only part of Unscratched with an account, and nothing below happens unless you open it and sign in.

- Sign-in: you enter your email address and we email you a 6-digit code. Your email address is stored by our authentication provider (Supabase) as your account. The app keeps your sign-in session on your phone.
- What we store: the groups you create or join (name, currency, invite code), the display name you use in each group, and everything added to the group: expenses (description, amount, category, date, who paid, each person's share, and any itemized lines), payments between members, recurring expenses, and receipt photos you attach.
- Who can see it: only members of the same group. Anyone with a group's invite code can join it, so share the code only with your roommates. Receipt photos are kept in private storage that only group members can read.
- What it is used for: only to show the group's expenses and balances to its members. It is not used for advertising or shared with anyone else.

## Optional note suggestions

This feature is off unless you turn on "Suggest notes from photos" in Settings. When it is off, the app sends no photos and makes no suggestion requests.

When it is on, nothing is sent until you tap "Suggest note" under a photo. Then the app sends:

- a smaller copy of that one photo (about 768 pixels on the long side), and
- a random install id that the app creates once. It is not tied to your name, account, or device, and is used only to limit each install to 30 suggestions a day.

Our server passes the photo to Anthropic's Claude AI model, which returns a short description and a rough severity. The server sends that back to your phone and keeps nothing about the photo: it is not saved, and it is not written to our logs. Anthropic processes the photo to answer the request. Under its API terms it does not use the photo to train models by default, and may keep it for a limited time for trust and safety before deleting it. Our database keeps only the install id and how many suggestions it made each day.

The suggestion is only shown to you. Nothing is added to your note or condition unless you tap Apply, and you can edit or delete it after. AI suggestions can be wrong. They are a starting point for your own description, not an assessment of the damage or of who is responsible.

## Deleting your data

Deleting the app deletes its inspection data from your device. We hold no copy of your inspection photos or details. The only things on our side for inspections are anonymous photo fingerprints, landlord acknowledgements if you asked for one, and, if you used note suggestions, daily suggestion counts for a random install id, as described above.

If you used Shared expenses, deleting the app does not delete your account or your groups' data, because your roommates still use it. You can delete expenses, payments, and recurring expenses in the app. To delete your account, email us at [contact email] from the address you signed in with. We will delete your account and your membership in every group within 30 days. Expenses you added to a group stay visible to its other members, because their balances depend on them. If you have an iCloud device backup that included the app, manage or delete that backup in your iCloud settings.

## Changes

If this policy changes, the new version will be posted here with a new effective date.

## Contact

Questions: [contact email]
