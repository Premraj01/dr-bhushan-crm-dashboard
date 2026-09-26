import { createFileRoute } from "@tanstack/react-router";
import { CRMApp } from "@/components/crm-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clinic CRM — Dr. Bhushan’s Rejuvenation" },
      { name: "description", content: "Clinical CRM for patient care, appointments, treatments, billing and clinic operations at Dr. Bhushan’s Rejuvenation." },
      { property: "og:title", content: "Clinic CRM — Dr. Bhushan’s Rejuvenation" },
      { property: "og:description", content: "A focused workspace for premium PRP and hair transplant care." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CRMApp,
});
