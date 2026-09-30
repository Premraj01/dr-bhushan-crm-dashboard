import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Columns2, ImageOff, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { Banner, StatusChip } from "@/components/crm-ui";
import { clinicToday } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MAX_UPLOAD_MB,
  PHOTO_ANGLES,
  PHOTO_MILESTONES,
  useFileUrl,
  usePhotos,
  useRemoveRecord,
  useUploadPhoto,
  type PatientDocument,
  type PatientPhoto,
  type PhotoAngle,
  type PhotoMilestone,
} from "./history-api";
import { errorText } from "@/lib/api";
import { longDate } from "./format";
import { ConfirmDialog } from "./shared";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

/** Protected photo, fetched with the auth header. */
function Photo({ photo, className }: { photo: PatientPhoto; className?: string }) {
  const { url, isError } = useFileUrl(`/photos/${photo.id}/file`);
  if (isError)
    return (
      <div className={cn("photo-missing", className)}>
        <ImageOff />
      </div>
    );
  if (!url) return <Skeleton className={cn("photo-img", className)} />;
  return (
    <img
      src={url}
      alt={`${photo.angle}, ${photo.milestone}`}
      className={cn("photo-img", className)}
    />
  );
}

/** What anonymised photos may be used for, from the latest photo consent still in force. */
function PhotoConsentChip({ documents }: { documents: PatientDocument[] | undefined }) {
  const active = documents?.find((d) => d.kind === "Photo consent" && !d.revokedAt);
  const withdrawn = documents?.some((d) => d.kind === "Photo consent" && d.revokedAt);
  if (active) return <StatusChip tone="success">Photo use: {active.photoUse}</StatusChip>;
  return (
    <StatusChip tone="warning">
      {withdrawn ? "Photo consent withdrawn" : "No photo-use consent"} — clinical records only
    </StatusChip>
  );
}

export function PhotoVault({
  patientId,
  documents,
  isAdmin,
  onNotice,
}: {
  patientId: string;
  documents: PatientDocument[] | undefined;
  isAdmin: boolean;
  onNotice: (message: string) => void;
}) {
  const { data: photos, isPending, isError, error } = usePhotos(patientId);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"timeline" | "compare">("timeline");
  const [angleFilter, setAngleFilter] = useState<PhotoAngle | "">("");
  const [viewing, setViewing] = useState<PatientPhoto | null>(null);

  const shown = (photos ?? []).filter((p) => !angleFilter || p.angle === angleFilter);
  const byMilestone = PHOTO_MILESTONES.map((m) => ({
    milestone: m,
    photos: shown.filter((p) => p.milestone === m),
  })).filter((g) => g.photos.length > 0);

  return (
    <div className="photo-vault">
      <div className="vault-toolbar">
        <PhotoConsentChip documents={documents} />
        <div className="vault-actions">
          {(photos?.length ?? 0) > 0 && (
            <div className="segmented" role="group" aria-label="View">
              <button
                type="button"
                aria-pressed={mode === "timeline"}
                onClick={() => setMode("timeline")}
              >
                Timeline
              </button>
              <button
                type="button"
                aria-pressed={mode === "compare"}
                onClick={() => setMode("compare")}
              >
                <Columns2 />
                Before & after
              </button>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => setAdding((a) => !a)}
            variant={adding ? "outline" : "default"}
          >
            {adding ? <X /> : <Camera />}
            {adding ? "Close" : "Add photos"}
          </Button>
        </div>
      </div>

      {adding && (
        <PhotoUpload
          patientId={patientId}
          onDone={(n) => {
            setAdding(false);
            onNotice(`${n} photo${n === 1 ? "" : "s"} added to the vault.`);
          }}
        />
      )}

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <Banner tone="error">{errorText(error)}</Banner>
      ) : photos.length === 0 ? (
        <div className="empty-state">
          <Camera />
          <h3>No photos yet</h3>
          <p>Start with the pre-operative set: every angle, dry and wet.</p>
        </div>
      ) : mode === "compare" ? (
        <PhotoCompare photos={photos} onOpen={setViewing} />
      ) : (
        <>
          <label className="vault-filter">
            Angle
            <select
              value={angleFilter}
              onChange={(e) => setAngleFilter(e.target.value as PhotoAngle | "")}
            >
              <option value="">All angles</option>
              {PHOTO_ANGLES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          {byMilestone.length === 0 && (
            <p className="history-empty">No photos from this angle yet.</p>
          )}
          {byMilestone.map((g) => (
            <section key={g.milestone} className="photo-group">
              <h4>
                {g.milestone}
                <small>
                  {g.photos.length} photo{g.photos.length === 1 ? "" : "s"}
                </small>
              </h4>
              <div className="photo-grid">
                {g.photos.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="photo-card"
                    onClick={() => setViewing(p)}
                  >
                    <Photo photo={p} />
                    <span>
                      <strong>{p.angle}</strong>
                      <small>{longDate(p.takenOn)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <PhotoViewer
        photo={viewing}
        patientId={patientId}
        canDelete={isAdmin}
        onClose={() => setViewing(null)}
        onDeleted={() => {
          setViewing(null);
          onNotice("Photo deleted.");
        }}
      />
    </div>
  );
}

type Staged = { file: File; preview: string; angle: PhotoAngle };

function PhotoUpload({
  patientId,
  onDone,
}: {
  patientId: string;
  onDone: (count: number) => void;
}) {
  const upload = useUploadPhoto(patientId);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [milestone, setMilestone] = useState<PhotoMilestone>("Pre-operative");
  const [takenOn, setTakenOn] = useState(clinicToday());
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<{ done: number; failed: string | null } | null>(null);
  const [tooBig, setTooBig] = useState<string[]>([]);

  // Local previews are freed when the form closes.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const track = (url: string) => {
    previews.current.push(url);
    return url;
  };
  const add = (files: FileList | null) => {
    if (!files) return;
    const list = [...files];
    setTooBig(list.filter((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024).map((f) => f.name));
    setStaged((s) => [
      ...s,
      ...list
        .filter((f) => f.size <= MAX_UPLOAD_MB * 1024 * 1024)
        // Suggest the standard angles in order.
        .map((file, i) => ({
          file,
          preview: track(URL.createObjectURL(file)),
          angle: PHOTO_ANGLES[(s.length + i) % PHOTO_ANGLES.length]!,
        })),
    ]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProgress({ done: 0, failed: null });
    let done = 0;
    for (const s of staged) {
      try {
        await upload.mutateAsync({
          file: s.file,
          angle: s.angle,
          milestone,
          takenOn,
          ...(note.trim() && { note: note.trim() }),
        });
        done++;
        setProgress({ done, failed: null });
      } catch (err) {
        // Keep the ones that failed so they can be retried.
        setStaged((list) => list.slice(done));
        setProgress({ done, failed: `${s.file.name}: ${errorText(err)}` });
        return;
      }
    }
    onDone(done);
  };

  const busy = progress !== null && progress.failed === null;

  return (
    <form className="photo-upload" onSubmit={submit}>
      <div className="form-grid three">
        <label>
          Milestone
          <select
            value={milestone}
            onChange={(e) => setMilestone(e.target.value as PhotoMilestone)}
          >
            {PHOTO_MILESTONES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Taken on
          <input
            type="date"
            required
            max={clinicToday()}
            value={takenOn}
            onChange={(e) => setTakenOn(e.target.value)}
          />
        </label>
        <label>
          Note
          <input
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — lighting, wet/dry"
          />
        </label>
      </div>

      <label className="photo-drop">
        <Upload />
        <span>
          <strong>Choose photos</strong> or take them with the camera
          <small>JPEG, PNG or WebP · up to {MAX_UPLOAD_MB} MB each · full resolution is kept</small>
        </span>
        <input
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {tooBig.length > 0 && (
        <Banner tone="warning">
          Skipped (over {MAX_UPLOAD_MB} MB): {tooBig.join(", ")}
        </Banner>
      )}

      {staged.length > 0 && (
        <div className="staged-grid">
          {staged.map((s, i) => (
            <div key={s.preview} className="staged-card">
              <img src={s.preview} alt="" />
              <select
                aria-label={`Angle for ${s.file.name}`}
                value={s.angle}
                disabled={busy}
                onChange={(e) =>
                  setStaged((list) =>
                    list.map((x, j) =>
                      j === i ? { ...x, angle: e.target.value as PhotoAngle } : x,
                    ),
                  )
                }
              >
                {PHOTO_ANGLES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Remove ${s.file.name}`}
                disabled={busy}
                onClick={() => setStaged((list) => list.filter((_, j) => j !== i))}
              >
                <X />
              </button>
            </div>
          ))}
        </div>
      )}

      {progress?.failed && <Banner tone="error">{progress.failed}</Banner>}
      <div className="photo-upload-actions">
        <Button type="submit" disabled={staged.length === 0 || busy}>
          {busy ? (
            <>
              <LoaderCircle className="animate-spin" />
              Uploading {progress.done + 1} of {staged.length}…
            </>
          ) : (
            <>
              <Upload />
              Upload {staged.length || ""} photo{staged.length === 1 ? "" : "s"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

/** Same angle, two milestones side by side. */
function PhotoCompare({
  photos,
  onOpen,
}: {
  photos: PatientPhoto[];
  onOpen: (p: PatientPhoto) => void;
}) {
  const angles = PHOTO_ANGLES.filter((a) => photos.some((p) => p.angle === a));
  const [angle, setAngle] = useState<PhotoAngle>(() => {
    // Start with the angle photographed at the most milestones.
    const count = (a: PhotoAngle) =>
      new Set(photos.filter((p) => p.angle === a).map((p) => p.milestone)).size;
    return [...angles].sort((a, b) => count(b) - count(a))[0]!;
  });
  const ofAngle = photos.filter((p) => p.angle === angle);
  const [beforeId, setBeforeId] = useState<string>("");
  const [afterId, setAfterId] = useState<string>("");
  const before = ofAngle.find((p) => p.id === beforeId) ?? ofAngle[0];
  const after = ofAngle.find((p) => p.id === afterId) ?? ofAngle[ofAngle.length - 1];
  const label = (p: PatientPhoto) => `${p.milestone} · ${longDate(p.takenOn)}`;

  const options = ofAngle.map((p) => (
    <option key={p.id} value={p.id}>
      {label(p)}
    </option>
  ));

  return (
    <div className="photo-compare">
      <div className="form-grid three">
        <label>
          Angle
          <select
            value={angle}
            onChange={(e) => {
              setAngle(e.target.value as PhotoAngle);
              setBeforeId("");
              setAfterId("");
            }}
          >
            {angles.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Before
          <select value={before?.id ?? ""} onChange={(e) => setBeforeId(e.target.value)}>
            {options}
          </select>
        </label>
        <label>
          After
          <select value={after?.id ?? ""} onChange={(e) => setAfterId(e.target.value)}>
            {options}
          </select>
        </label>
      </div>
      {ofAngle.length < 2 && (
        <p className="field-note">
          Only one {angle.toLowerCase()} photo so far — add a later milestone to compare.
        </p>
      )}
      <div className="compare-pair">
        {[before, after].map(
          (p, i) =>
            p && (
              <figure key={`${i}-${p.id}`}>
                <button type="button" onClick={() => onOpen(p)}>
                  <Photo photo={p} />
                </button>
                <figcaption>
                  <strong>{i === 0 ? "Before" : "After"}</strong> {label(p)}
                </figcaption>
              </figure>
            ),
        )}
      </div>
    </div>
  );
}

function PhotoViewer({
  photo,
  patientId,
  canDelete,
  onClose,
  onDeleted,
}: {
  photo: PatientPhoto | null;
  patientId: string;
  canDelete: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useRemoveRecord("photos", patientId);
  const [confirming, setConfirming] = useState(false);
  return (
    <Dialog open={photo !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="photo-viewer">
        {photo && (
          <>
            <DialogHeader>
              <DialogTitle>
                {photo.angle} · {photo.milestone}
              </DialogTitle>
              <DialogDescription>
                Taken {longDate(photo.takenOn)} · uploaded by {photo.uploadedBy.name}
                {photo.note && ` · ${photo.note}`}
              </DialogDescription>
            </DialogHeader>
            <Photo photo={photo} className="photo-large" />
            {remove.isError && <Banner tone="error">{errorText(remove.error)}</Banner>}
            {canDelete && (
              <div className="photo-viewer-actions">
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 />
                  Delete photo
                </Button>
              </div>
            )}
            <ConfirmDialog
              open={confirming}
              title="Delete this photo?"
              description="It is removed from the patient's record permanently. Clinical photos are usually kept — only delete a wrong upload."
              action="Delete photo"
              isPending={remove.isPending}
              onCancel={() => setConfirming(false)}
              onConfirm={() =>
                remove.mutate(photo.id, {
                  onSuccess: () => {
                    setConfirming(false);
                    onDeleted();
                  },
                  onError: () => setConfirming(false),
                })
              }
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
