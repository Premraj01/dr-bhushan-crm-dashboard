# Six-month appointment calendar

## Build
- Add a Month / 6 months view switch to the Appointments page.
- Keep the current single-month calendar and daily agenda unchanged in Month view.
- Add a compact six-month grid starting from the selected month, with appointment counts, surgery markers, today, and selected-day states.
- Let any day in the six-month grid open that date in the existing daily agenda and booking flow.
- Add previous/next six-month navigation plus a Today shortcut.

## UI
- Match the existing clinic colors, panels, buttons, and status indicators.
- Use a three-column desktop layout and a readable stacked mobile layout without crowding day cells.
- Show skeletons while month data loads and the existing error treatment if calendar data cannot be loaded.

## Technical details
- Reuse the current monthly appointments API by loading six fixed month queries in parallel; no backend changes.
- Keep all edits local to the working preview and do not push code.
- Verify frontend checks and the desktop/mobile calendar interaction.
