<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The repo is split into `frontend/` (Vite React SPA) and `backend/` (NestJS + Socket.IO), each with its own `package.json`. Run npm commands inside the relevant folder.
- Patients (list, profile, edit, treatment packages), Appointments (calendar + dashboard "Today’s schedule") and Settings → Treatments/Concerns use the API via TanStack Query (`src/components/patients/patients-api.ts`, `src/components/settings/catalog-settings.tsx`); other screens still render mock data. `src/lib/api.ts` and `src/lib/socket.ts` are the integration points.
- Package pricing is computed server-side in `backend/src/packages/packages.service.ts` (PRP per session, FUE per graft + complimentary PRP); `previewPackage()` in the frontend mirrors it for display only.
- Backend data is in-memory (`backend/src/common/in-memory.repository.ts`) until a database is chosen.
- Creating a package books one appointment per scheduled session (`packageId` links them); accepting/cancelling the package confirms/cancels those appointments (`PackagesService.setStatus`).
