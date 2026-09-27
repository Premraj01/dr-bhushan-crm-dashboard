# Clinic timings settings

## Goal
Add an easy day-by-day clinic timings screen inside Settings that matches the existing CRM.

## Changes
- Add a **Clinic timings** item to the Settings menu.
- Show Monday–Sunday rows with an open/closed switch and opening/closing time selectors.
- Include a quick **Copy Monday to weekdays** action for faster setup.
- Show the clinic timezone and a clear summary of open days.
- Add save feedback and keep the configured hours in the browser for this prototype.
- Make the layout compact on desktop and easy to edit on mobile.

## Technical details
- Keep this frontend-only and reuse the existing Button, Switch, banner, panel, and status styles.
- Use semantic theme tokens and add only focused Settings styles.
- Validate that closing time is later than opening time before saving.
- Verify the Settings flow in the preview and run the frontend checks.
