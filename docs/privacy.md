# Unscratched Privacy Policy

Effective date: [effective date]

Unscratched is a free app that helps renters document the condition of a home. This page explains what happens to your information. The short version: your photos, addresses, names, and notes stay on your phone. The only thing that leaves it is a fingerprint of each photo, used to get a timestamp receipt.

## What we collect

Unscratched has no accounts, no sign-in, no analytics, no ads, and no tracking SDKs. We do not sell any data.

The only thing we receive is photo fingerprints (see "Timestamp receipts" below). We never receive your photos, addresses, names, notes, or anything that identifies you or your device.

## Where your data lives

Everything you enter (addresses, names, notes, and photos) is stored only on your device. Photos are saved in the app's documents folder. Depending on your settings, iOS may include that folder in your own iCloud device backup. That backup is controlled by you and Apple, not by us.

## Sharing

The app only shares something when you choose to. If you create a PDF report and share it, you do that yourself through the system share sheet, and you pick where it goes. We do not receive a copy.

## Permissions

- Camera: used only to take inspection photos inside the app. Images are never sent anywhere; only their fingerprints are, as described below.
- Noti## Timestamp receipts

A phone's clock can be changed, so when you finish an inspection the app asks our server to record when it first saw each photo. To do that it sends:

- the SHA-256 fingerprint (hash) of each photo, and
- one more SHA-256 fingerprint made from the list of that inspection's photo fingerprints.

A fingerprint is a 64-character string. It cannot be turned back into the photo, and it says nothing about where the photo was taken or who took it. Nothing else is sent: no photos, addresses, names, notes, account, or device identifier.

The server stores each fingerprint with the time it was first received and returns a receipt. Our database keeps no IP address and nothing that links a fingerprint to you or to other fingerprints. Like most web services, our hosting provider (Supabase) may keep standard request logs, which can include an IP address, for a short time to run and secure the service. We do not use those logs to identify anyone.

If you are offline, the fingerprints wait on your phone and are sent later. Until then, your report says "Receipt pending".

Anyone who has a fingerprint, or the verification code printed in your report, can check the time on our verify page (unscratched.app/v/...). They learn only that the fingerprint was received at that time. They cannot see the photo or anything about you.

Fingerprints are kept so receipts stay checkable. Because they are not linked to you, we cannot find "your" fingerprints to delete them.

eceipt. Only the fingerprints would be sent. No photos, addresses, or names would be sent. A fingerprint is a short string of characters that cannot be turned back into the photo.

This policy will be updated before that feature ships.

## Deleting your data

Deleting the app deletes its data from your device. We hold no copy of your photos or inspection details. The only thing on our side is anonymous photo fingerprints, as described above. If you have an iCloud device backup that included the app, manage or delete that backup in your iCloud settings.

## Changes

If this policy changes, the new version will be posted here with a new effective date.

## Contact

Questions: [contact email]
