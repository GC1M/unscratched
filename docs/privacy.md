# Unscratched Privacy Policy

Effective date: [effective date]

Unscratched is a free app that helps renters document the condition of a home. This page explains what happens to your information. The short version: your photos, addresses, names, and notes stay on your phone. The only thing that leaves it is a fingerprint of each photo, used to get a timestamp receipt. If you turn on the optional "Suggest notes from photos" setting, a photo you choose is also sent, once, to get a suggested note, and is not stored.

## What we collect

Unscratched has no accounts, no sign-in, no analytics, no ads, and no tracking SDKs. We do not sell any data.

By default, the only thing we receive is photo fingerprints (see "Timestamp receipts" below). We never receive your addresses, names, notes, or anything that identifies you. We only receive a photo if you turn on note suggestions and tap "Suggest note" on it (see "Optional note suggestions" below).

## Where your data lives

Everything you enter (addresses, names, notes, and photos) is stored only on your device. Photos are saved in the app's documents folder. Depending on your settings, iOS may include that folder in your own iCloud device backup. That backup is controlled by you and Apple, not by us.

## Sharing

The app only shares something when you choose to. If you create a PDF report and share it, you do that yourself through the system share sheet, and you pick where it goes. We do not receive a copy.

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

## Optional note suggestions

This feature is off unless you turn on "Suggest notes from photos" in Settings. When it is off, the app sends no photos and makes no suggestion requests.

When it is on, nothing is sent until you tap "Suggest note" under a photo. Then the app sends:

- a smaller copy of that one photo (about 768 pixels on the long side), and
- a random install id that the app creates once. It is not tied to your name, account, or device, and is used only to limit each install to 30 suggestions a day.

Our server passes the photo to Anthropic's Claude AI model, which returns a short description and a rough severity. The server sends that back to your phone and keeps nothing about the photo: it is not saved, and it is not written to our logs. Anthropic processes the photo to answer the request. Under its API terms it does not use the photo to train models by default, and may keep it for a limited time for trust and safety before deleting it. Our database keeps only the install id and how many suggestions it made each day.

The suggestion is only shown to you. Nothing is added to your note or condition unless you tap Apply, and you can edit or delete it after. AI suggestions can be wrong. They are a starting point for your own description, not an assessment of the damage or of who is responsible.

## Deleting your data

Deleting the app deletes its data from your device. We hold no copy of your photos or inspection details. The only things on our side are anonymous photo fingerprints and, if you used note suggestions, daily suggestion counts for a random install id, as described above. If you have an iCloud device backup that included the app, manage or delete that backup in your iCloud settings.

## Changes

If this policy changes, the new version will be posted here with a new effective date.

## Contact

Questions: [contact email]
