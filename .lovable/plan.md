# Package visit reminder UI

## Goal
Update the Reminders section so it clearly reflects automated reminders created from dated package visits.

## Changes
- Use upcoming package-linked appointments as the reminder schedule, including package, visit date/time, and send timing.
- Replace Email with Call; support WhatsApp, SMS, and call actions in the reminder dialog and activity log.
- Present automatic reminders separately from completed activity, with clear queued, sent, and call-needed states.
- Keep sending simulated in the frontend and retain the existing app theme, loading states, empty states, and mobile layout.

## Technical details
- Reuse live appointment and patient queries already used by the CRM.
- Treat appointments carrying a package ID as package visits.
- Persist simulated reminder activity in browser storage; no messaging provider or backend scheduler will be added in this change.
- Verify the screen at desktop and mobile sizes and confirm the frontend passes its checks.
