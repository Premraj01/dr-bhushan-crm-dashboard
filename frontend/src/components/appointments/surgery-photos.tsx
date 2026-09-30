import { useState } from "react";
import { Camera, LoaderCircle, Upload } from "lucide-react";
import { Banner } from "@/components/crm-ui";
import { usePhotos, useUploadPhoto } from "@/components/history/history-api";
import { PhotoPicker, type StagedPhoto } from "@/components/history/photo-vault";
import { clinicToday } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/api";

/**
 * Surgery day, patient checked in: the doctor photographs the scalp before starting.
 * Photos go straight to the patient's history under "Surgery day".
 */
export function SurgeryPhotos({ patientId, type }: { patientId: string; type: string }) {
  const today = clinicToday();
  const { data: photos } = usePhotos(patientId);
  const upload = useUploadPhoto(patientId);
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  /** Index of the photo being uploaded. */
  const [uploading, setUploading] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const taken = (photos ?? []).filter(
    (p) => p.milestone === "Surgery day" && p.takenOn === today,
  ).length;

  const send = async () => {
    setFailed(null);
    setSaved(null);
    for (const [i, p] of staged.entries()) {
      setUploading(i);
      try {
        await upload.mutateAsync({
          file: p.file,
          angle: p.angle,
          milestone: "Surgery day",
          takenOn: today,
          note: `Before ${type}`,
        });
      } catch (err) {
        // Keep the ones that failed so they can be retried.
        setStaged(staged.slice(i));
        setUploading(null);
        setFailed(`${p.file.name}: ${errorText(err)}`);
        return;
      }
    }
    setUploading(null);
    setSaved(
      `${staged.length} photo${staged.length === 1 ? "" : "s"} saved to the patient’s history.`,
    );
    setStaged([]);
  };

  return (
    <section className="surgery-photos" aria-label="Surgery-day photos">
      <header>
        <div>
          <strong>
            <Camera />
            Surgery-day photos
          </strong>
          <small>
            Take them before starting · saved to history under “Surgery day”
            {taken > 0 && ` · ${taken} already taken today`}
          </small>
        </div>
      </header>
      <PhotoPicker
        staged={staged}
        onChange={(update) => {
          setSaved(null);
          setStaged(update);
        }}
        disabled={uploading !== null}
      />
      {failed && <Banner tone="error">{failed}</Banner>}
      {saved && <small className="surgery-photos-saved">{saved}</small>}
      {staged.length > 0 && (
        <div className="surgery-photos-actions">
          <Button type="button" size="sm" disabled={uploading !== null} onClick={() => void send()}>
            {uploading !== null ? (
              <>
                <LoaderCircle className="animate-spin" />
                Uploading {uploading + 1} of {staged.length}…
              </>
            ) : (
              <>
                <Upload />
                Upload {staged.length} photo{staged.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
