# Three-month appointment calendar

## What will change
- Add a **3 months** option between Month and 6 months.
- Show three consecutive compact calendars using the same appointment counts, surgery markers, selected date, and agenda behavior.
- Move the range backward or forward by three months when this view is active.
- Keep the existing loading, retry, desktop, and mobile behavior consistent.

## Technical details
- Reuse the existing multi-month appointment query with a three-month range.
- Generalize the current six-month view labels and layout so both overview lengths share one implementation.
- Keep all changes local; do not push code.

## Verification
- Check Month, 3 months, and 6 months switching.
- Confirm date selection updates the daily agenda.
- Confirm desktop and mobile layouts have no horizontal overflow.
