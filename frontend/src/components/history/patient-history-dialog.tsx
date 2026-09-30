import { useState } from "react";
import { Camera, FileSignature, HeartPulse, IndianRupee, Pill, ScanFace } from "lucide-react";
import { Banner } from "@/components/crm-ui";
import { usePatient } from "@/components/patients/patients-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsTab } from "./documents-tab";
import { FinancialTab } from "./financial-tab";
import { HairForm } from "./hair-form";
import { useDocuments, useHistory, usePhotos } from "./history-api";
import { MedicalForm } from "./medical-form";
import { PhotoVault } from "./photo-vault";
import { PrescriptionsTab } from "./prescriptions-tab";
import { SafetyStrip } from "./safety-strip";
import { errorText } from "@/lib/api";

export type HistoryTab =
  "medical" | "hair" | "prescriptions" | "photos" | "documents" | "financial";

/** The patient's full record: medical baseline, hair assessment, photos, consents and billing. */
export function PatientHistoryDialog({
  patientId,
  canEditClinical,
  isAdmin,
  onOpenChange,
}: {
  patientId: string | null;
  /** Doctors and admins record the medical history and hair assessment. */
  canEditClinical: boolean;
  /** Only admins delete photos and documents. */
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: patient } = usePatient(patientId);
  const history = useHistory(patientId);
  const documents = useDocuments(patientId);
  const photos = usePhotos(patientId);
  const [tab, setTab] = useState<HistoryTab>("medical");
  const [message, setMessage] = useState<string | null>(null);
  const [lastId, setLastId] = useState(patientId);
  if (patientId !== lastId) {
    setLastId(patientId);
    setTab("medical");
    setMessage(null);
  }
  const notify = setMessage;

  return (
    <Dialog open={patientId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="history-dialog">
        <DialogHeader>
          <DialogTitle>Patient history · {patient?.name ?? patientId}</DialogTitle>
          <DialogDescription>
            {patient
              ? [
                  patient.id,
                  patient.age != null && `${patient.age} years`,
                  patient.gender,
                  patient.concern,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {history.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : history.isError ? (
          <Banner tone="error">{errorText(history.error)}</Banner>
        ) : (
          <SafetyStrip history={history.data} />
        )}
        {message && (
          <Banner tone="success" onClose={() => setMessage(null)}>
            {message}
          </Banner>
        )}

        {patientId && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as HistoryTab)}>
            <TabsList className="edit-tabs history-tabs">
              <TabsTrigger value="medical">
                <HeartPulse />
                Medical
              </TabsTrigger>
              <TabsTrigger value="hair">
                <ScanFace />
                Hair & treatment
              </TabsTrigger>
              <TabsTrigger value="prescriptions">
                <Pill />
                Prescriptions
                {history.data?.prescribed.length
                  ? ` (${history.data.prescribed.length} active)`
                  : ""}
              </TabsTrigger>
              <TabsTrigger value="photos">
                <Camera />
                Photos{photos.data?.length ? ` (${photos.data.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileSignature />
                Consent & documents
              </TabsTrigger>
              <TabsTrigger value="financial">
                <IndianRupee />
                Financial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="medical">
              {history.data && (
                <MedicalForm
                  key={`${patientId}-${history.data.medical?.updatedAt ?? "new"}`}
                  patientId={patientId}
                  medical={history.data.medical}
                  prescribed={history.data.prescribed}
                  onOpenPrescriptions={() => setTab("prescriptions")}
                  canEdit={canEditClinical}
                  onSaved={() => notify("Medical history saved.")}
                />
              )}
            </TabsContent>
            <TabsContent value="hair">
              {history.data && (
                <HairForm
                  key={`${patientId}-${history.data.hair?.updatedAt ?? "new"}`}
                  patientId={patientId}
                  hair={history.data.hair}
                  gender={patient?.gender}
                  canEdit={canEditClinical}
                  onSaved={() => notify("Hair assessment saved.")}
                />
              )}
            </TabsContent>
            <TabsContent value="prescriptions">
              <PrescriptionsTab
                patientId={patientId}
                canPrescribe={canEditClinical}
                onNotice={notify}
              />
            </TabsContent>
            <TabsContent value="photos">
              <PhotoVault
                patientId={patientId}
                documents={documents.data}
                isAdmin={isAdmin}
                onNotice={notify}
              />
            </TabsContent>
            <TabsContent value="documents">
              <DocumentsTab
                patientId={patientId}
                documents={documents.data}
                isPending={documents.isPending}
                error={documents.error}
                clearance={history.data?.medical?.clearance}
                isAdmin={isAdmin}
                onNotice={notify}
              />
            </TabsContent>
            <TabsContent value="financial">
              <FinancialTab patientId={patientId} onNotice={notify} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
