import { useState, type FormEvent } from "react";
import { Eye, FilePlus2, FileText, LoaderCircle, Trash2, Undo2, Upload, X } from "lucide-react";
import { Banner, StatusChip, type Tone } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DOCUMENT_FORMATS,
  DOCUMENT_KINDS,
  MAX_UPLOAD_MB,
  openFile,
  PHOTO_USES,
  useRemoveRecord,
  useRevokeDocument,
  useUploadDocument,
  type DocumentKind,
  type MedicalHistory,
  type PatientDocument,
} from "./history-api";
import { errorText } from "@/lib/api";
import { DateInput } from "@/components/form/date-input";
import { TimeInput } from "@/components/form/time-input";
import { ValidatedForm } from "@/components/form/validated-form";
import { dateTime, fileSize } from "./format";
import { ConfirmDialog } from "./shared";
import { SelectInput } from "@/components/form/select-input";
import { useCan } from "@/lib/use-permissions";

const DEFAULT_TITLE: Record<DocumentKind, string> = {
  "Surgery consent": "Informed consent — hair transplant surgery",
  "Photo consent": "Before & after photo consent",
  "Medical clearance": "Medical clearance certificate",
  Other: "",
};

/** Now, as local YYYY-MM-DDTHH:mm. */
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

type Status = { label: string; value: string; tone: Tone };

/** At-a-glance: is everything needed before surgery on file? */
function statusCards(
  docs: PatientDocument[],
  clearance: MedicalHistory["clearance"] | undefined,
): Status[] {
  const latest = (kind: DocumentKind) => docs.find((d) => d.kind === kind);
  const surgery = latest("Surgery consent");
  const photo = latest("Photo consent");
  const cert = latest("Medical clearance");
  return [
    {
      label: "Surgery consent",
      ...(surgery && !surgery.revokedAt
        ? { value: `Signed ${dateTime(surgery.signedAt)}`, tone: "success" as const }
        : surgery
          ? { value: "Withdrawn", tone: "error" as const }
          : { value: "Not on file", tone: "warning" as const }),
    },
    {
      label: "Photo consent",
      ...(photo && !photo.revokedAt
        ? { value: photo.photoUse ?? "Signed", tone: "success" as const }
        : photo
          ? { value: "Withdrawn — clinical use only", tone: "error" as const }
          : { value: "Not on file — clinical use only", tone: "neutral" as const }),
    },
    {
      label: "Medical clearance",
      ...(cert
        ? { value: `Certificate ${dateTime(cert.signedAt)}`, tone: "success" as const }
        : clearance === "Pending"
          ? { value: "Required — awaiting certificate", tone: "warning" as const }
          : clearance === "Received"
            ? { value: "Received — certificate not uploaded", tone: "warning" as const }
            : { value: "Not required", tone: "neutral" as const }),
    },
  ];
}

export function DocumentsTab({
  patientId,
  documents,
  isPending,
  error,
  clearance,
  onNotice,
}: {
  patientId: string;
  documents: PatientDocument[] | undefined;
  isPending: boolean;
  error: unknown;
  clearance: MedicalHistory["clearance"] | undefined;
  onNotice: (message: string) => void;
}) {
  const canDelete = useCan("documents", "delete");
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<PatientDocument | null>(null);
  const [deleting, setDeleting] = useState<PatientDocument | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const revoke = useRevokeDocument(patientId);
  const remove = useRemoveRecord("documents", patientId);

  if (isPending) return <Skeleton className="h-48 w-full" />;
  if (!documents) return <Banner tone="error">{errorText(error)}</Banner>;

  const view = (d: PatientDocument) => {
    setOpenError(null);
    openFile(`/documents/${d.id}/file`).catch((e: unknown) => setOpenError(errorText(e)));
  };

  return (
    <div className="documents-tab">
      <div className="consent-status">
        {statusCards(documents, clearance).map((s) => (
          <div key={s.label}>
            <span>{s.label}</span>
            <StatusChip tone={s.tone}>{s.value}</StatusChip>
          </div>
        ))}
      </div>

      <div className="vault-toolbar">
        <h4>Signed forms & certificates</h4>
        <Button
          size="sm"
          variant={adding ? "outline" : "default"}
          onClick={() => setAdding((a) => !a)}
        >
          {adding ? <X /> : <FilePlus2 />}
          {adding ? "Close" : "Add document"}
        </Button>
      </div>

      {adding && (
        <DocumentUpload
          patientId={patientId}
          onDone={(d) => {
            setAdding(false);
            onNotice(`${d.title} added to the record.`);
          }}
        />
      )}

      {openError && <Banner tone="error">{openError}</Banner>}
      {(revoke.isError || remove.isError) && (
        <Banner tone="error">{errorText(revoke.error ?? remove.error)}</Banner>
      )}

      {documents.length === 0 ? (
        <div className="empty-state">
          <FileText />
          <h3>No documents yet</h3>
          <p>Upload the signed surgery consent and photo consent before the procedure.</p>
        </div>
      ) : (
        <div className="document-list">
          {documents.map((d) => (
            <article key={d.id} className={d.revokedAt ? "revoked" : undefined}>
              <FileText />
              <div className="min-w-0">
                <strong>{d.title}</strong>
                <small>
                  {d.kind}
                  {d.photoUse && ` · ${d.photoUse}`} · {d.format} · signed {dateTime(d.signedAt)}
                </small>
                <small>
                  Recorded {dateTime(d.createdAt)} by {d.uploadedBy.name} · {fileSize(d.file.size)}
                </small>
                {d.notes && <p>{d.notes}</p>}
                {d.revokedAt && (
                  <StatusChip tone="error">
                    Withdrawn {dateTime(d.revokedAt)} · {d.revokedBy?.name}
                  </StatusChip>
                )}
              </div>
              <div className="document-actions">
                <Button size="sm" variant="outline" onClick={() => view(d)}>
                  <Eye />
                  View
                </Button>
                {(d.kind === "Surgery consent" || d.kind === "Photo consent") && !d.revokedAt && (
                  <Button size="sm" variant="ghost" onClick={() => setRevoking(d)}>
                    <Undo2 />
                    Withdraw
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${d.title}`}
                    onClick={() => setDeleting(d)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={revoking !== null}
        title="Record withdrawal of consent?"
        description={
          revoking?.kind === "Photo consent"
            ? "The patient's photos must no longer be used for marketing or education. The signed form stays on record with the withdrawal time."
            : "The signed form stays on record, marked as withdrawn now. Surgery should not go ahead without a new signed consent."
        }
        action="Mark as withdrawn"
        isPending={revoke.isPending}
        onCancel={() => setRevoking(null)}
        onConfirm={() =>
          revoke.mutate(revoking!.id, {
            onSuccess: (d) => {
              setRevoking(null);
              onNotice(`${d.title} marked as withdrawn.`);
            },
            onError: () => setRevoking(null),
          })
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.title}”?`}
        description="The file is removed permanently. Signed consents are legal records — only delete a wrong upload. To record that a patient changed their mind, use Withdraw."
        action="Delete document"
        isPending={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              setDeleting(null);
              onNotice("Document deleted.");
            },
            onError: () => setDeleting(null),
          })
        }
      />
    </div>
  );
}

function DocumentUpload({
  patientId,
  onDone,
}: {
  patientId: string;
  onDone: (d: PatientDocument) => void;
}) {
  const upload = useUploadDocument(patientId);
  const [kind, setKind] = useState<DocumentKind>("Surgery consent");
  const [title, setTitle] = useState(DEFAULT_TITLE["Surgery consent"]);
  const [signedAt, setSignedAt] = useState(nowLocal());
  const [signedDate = "", signedTime = ""] = signedAt.split("T");
  const [today, timeNow] = nowLocal().split("T") as [string, string];
  const [format, setFormat] = useState<PatientDocument["format"]>("Physical (scanned)");
  const [photoUse, setPhotoUse] = useState<PatientDocument["photoUse"]>();
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const tooBig = !!file && file.size > MAX_UPLOAD_MB * 1024 * 1024;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file || tooBig) return;
    upload.mutate(
      {
        file,
        kind,
        title: title.trim(),
        signedAt: new Date(signedAt).toISOString(),
        format,
        ...(kind === "Photo consent" && { photoUse }),
        ...(notes.trim() && { notes: notes.trim() }),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <ValidatedForm className="photo-upload" onSubmit={submit}>
      <fieldset className="form-lock" disabled={upload.isPending}>
        <div className="form-grid">
          <label>
            Document
            <SelectInput
              value={kind}
              onChange={(e) => {
                const next = e.target.value as DocumentKind;
                // Replace the suggested title, but keep one the user typed.
                if (title === DEFAULT_TITLE[kind]) setTitle(DEFAULT_TITLE[next]);
                setKind(next);
              }}
            >
              {DOCUMENT_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </SelectInput>
          </label>
          <label>
            Title
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Signed on
            <DateInput
              required
              max={today}
              data-error-max="The signing date can’t be in the future"
              value={signedDate}
              onChange={(d) => setSignedAt(`${d}T${signedTime}`)}
            />
          </label>
          <label>
            Signed at
            <TimeInput
              required
              {...(signedDate === today && { max: timeNow })}
              value={signedTime}
              onChange={(t) => setSignedAt(`${signedDate}T${t}`)}
            />
          </label>
          <label>
            Format
            <SelectInput
              value={format}
              onChange={(e) => setFormat(e.target.value as PatientDocument["format"])}
            >
              {DOCUMENT_FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </SelectInput>
          </label>
          {kind === "Photo consent" && (
            <label className="full">
              Anonymised photos may be used for
              <SelectInput
                required
                value={photoUse ?? ""}
                onChange={(e) =>
                  setPhotoUse((e.target.value || undefined) as PatientDocument["photoUse"])
                }
              >
                <option value="">Select what the patient agreed to</option>
                {PHOTO_USES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </SelectInput>
            </label>
          )}
          {kind === "Surgery consent" && (
            <p className="full field-note">
              The form should cover the risks, possible complications and expected outcome, and be
              signed by the patient and the doctor.
            </p>
          )}
          <label className="full">
            Notes
            <input
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — witness, version of the form"
            />
          </label>
        </div>
        <label className="photo-drop">
          <Upload />
          <span>
            <strong>{file ? file.name : "Choose the signed file"}</strong>
            <small>
              {file ? fileSize(file.size) : `PDF, JPEG, PNG or WebP · up to ${MAX_UPLOAD_MB} MB`}
            </small>
          </span>
          <input
            type="file"
            required
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {tooBig && <Banner tone="error">That file is over {MAX_UPLOAD_MB} MB.</Banner>}
      </fieldset>
      {upload.isError && <Banner tone="error">{errorText(upload.error)}</Banner>}
      <div className="photo-upload-actions">
        <Button type="submit" disabled={!file || tooBig || upload.isPending}>
          {upload.isPending ? (
            <>
              <LoaderCircle className="animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload />
              Save document
            </>
          )}
        </Button>
      </div>
    </ValidatedForm>
  );
}
