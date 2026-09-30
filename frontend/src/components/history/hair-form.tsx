import { useState, type FormEvent } from "react";
import {
  HairLossIllustration,
  type ConcernIllustration,
} from "@/components/hair-loss-illustration";
import type { Gender } from "@/components/patients/patients-api";
import {
  COMMON_TREATMENTS,
  DONOR_LAXITIES,
  DONOR_QUALITIES,
  HAIR_GRADES,
  useSaveHair,
  type Edited,
  type HairAssessment,
  type HairScale,
} from "./history-api";
import { clean, type Patch } from "./format";
import { FormSection, QuickPicks, Rows, SaveBar } from "./shared";

/** Norwood grades drawn by the existing hair-loss chart (sub-types share their stage). */
const NORWOOD_PICTURE: Record<string, ConcernIllustration> = {
  I: "norwood-1",
  II: "norwood-2",
  IIa: "norwood-2",
  III: "norwood-3",
  IIIa: "norwood-3",
  "III vertex": "norwood-3v",
  IV: "norwood-4",
  IVa: "norwood-4",
  V: "norwood-5",
  Va: "norwood-5",
  VI: "norwood-6",
  VII: "norwood-7",
};

const LUDWIG_TEXT: Record<string, string> = {
  I: "Mild thinning on the crown, frontal hairline preserved.",
  II: "Marked thinning and widening of the central parting.",
  III: "Extensive, near-total thinning over the top of the scalp.",
};

function blank(gender: Gender | undefined): HairAssessment {
  const scale: HairScale = gender === "Female" ? "Ludwig" : "Norwood";
  return { scale, grade: "", donor: {}, treatments: [], goals: {} };
}

function toForm(h: (HairAssessment & Edited) | undefined, gender: Gender | undefined) {
  if (!h) return blank(gender);
  const { updatedBy: _by, updatedAt: _at, ...rest } = h;
  return rest;
}

const num = (v: string) => (v === "" ? undefined : Number(v));

/** Classification, donor area, past treatments and the patient's goals. */
export function HairForm({
  patientId,
  hair,
  gender,
  canEdit,
  onSaved,
}: {
  patientId: string;
  hair: (HairAssessment & Edited) | undefined;
  gender: Gender | undefined;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const save = useSaveHair(patientId);
  const [form, setForm] = useState(() => toForm(hair, gender));
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(hair, gender));
  const setDonor = (patch: Patch<HairAssessment["donor"]>) =>
    setForm((f) => ({ ...f, donor: { ...f.donor, ...patch } as HairAssessment["donor"] }));
  const setGoals = (patch: Patch<HairAssessment["goals"]>) =>
    setForm((f) => ({ ...f, goals: { ...f.goals, ...patch } as HairAssessment["goals"] }));
  const picture = form.scale === "Norwood" ? NORWOOD_PICTURE[form.grade] : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        scale: form.scale,
        grade: form.grade,
        donor: clean(form.donor),
        treatments: form.treatments.map(clean),
        goals: clean(form.goals),
      },
      {
        onSuccess: (data) => {
          setForm(toForm(data.hair, gender));
          onSaved();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="history-form">
      <fieldset className="form-lock" disabled={!canEdit || save.isPending}>
        <FormSection
          title="Hair loss classification"
          hint="Norwood scale for men, Ludwig scale for women."
        >
          <div className="hair-grade">
            <div className="form-grid">
              <label>
                Scale
                <select
                  value={form.scale}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, scale: e.target.value as HairScale, grade: "" }))
                  }
                >
                  <option>Norwood</option>
                  <option>Ludwig</option>
                </select>
              </label>
              <label>
                Grade
                <select
                  required
                  value={form.grade}
                  onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                >
                  <option value="">Select grade</option>
                  {HAIR_GRADES[form.scale].map((g) => (
                    <option key={g} value={g}>
                      {form.scale} {g}
                    </option>
                  ))}
                </select>
              </label>
              {form.scale === "Ludwig" && form.grade && (
                <p className="full field-note">{LUDWIG_TEXT[form.grade]}</p>
              )}
            </div>
            {picture && <HairLossIllustration kind={picture} className="hair-grade-picture" />}
          </div>
        </FormSection>

        <FormSection
          title="Donor area assessment"
          hint="Usually the back of the scalp — decides how many grafts can be harvested safely."
        >
          <div className="form-grid three">
            <label>
              Quality
              <select
                value={form.donor.quality ?? ""}
                onChange={(e) =>
                  setDonor({
                    quality: (e.target.value || undefined) as HairAssessment["donor"]["quality"],
                  })
                }
              >
                <option value="">Not assessed</option>
                {DONOR_QUALITIES.map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </label>
            <label>
              Density (FU / cm²)
              <input
                type="number"
                min={0}
                max={300}
                step={0.1}
                value={form.donor.density ?? ""}
                onChange={(e) => setDonor({ density: num(e.target.value) })}
                placeholder="e.g. 80"
              />
            </label>
            <label>
              Scalp laxity
              <select
                value={form.donor.laxity ?? ""}
                onChange={(e) =>
                  setDonor({
                    laxity: (e.target.value || undefined) as HairAssessment["donor"]["laxity"],
                  })
                }
              >
                <option value="">Not assessed</option>
                {DONOR_LAXITIES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="full">
              Donor notes
              <textarea
                maxLength={1000}
                value={form.donor.notes ?? ""}
                onChange={(e) => setDonor({ notes: e.target.value })}
                placeholder="Hair calibre, miniaturisation, previous scars"
              />
            </label>
          </div>
        </FormSection>

        <FormSection title="Treatment history" hint="What the patient has already tried.">
          <Rows
            items={form.treatments}
            onChange={(treatments) => setForm((f) => ({ ...f, treatments }))}
            blank={{ treatment: "" }}
            addLabel="Add treatment"
            empty="No previous treatments recorded."
            render={(t, update) => (
              <>
                <label>
                  Treatment
                  <input
                    required
                    maxLength={120}
                    list="treatment-options"
                    value={t.treatment}
                    onChange={(e) => update({ treatment: e.target.value })}
                  />
                </label>
                <label>
                  Period
                  <input
                    maxLength={60}
                    value={t.period ?? ""}
                    onChange={(e) => update({ period: e.target.value })}
                    placeholder="e.g. 2023 – 2024"
                  />
                </label>
                <label>
                  Outcome
                  <input
                    maxLength={300}
                    value={t.outcome ?? ""}
                    onChange={(e) => update({ outcome: e.target.value })}
                    placeholder="Result, side effects"
                  />
                </label>
              </>
            )}
          />
          <QuickPicks
            options={COMMON_TREATMENTS}
            taken={form.treatments.map((t) => t.treatment)}
            onPick={(treatment) =>
              setForm((f) => ({ ...f, treatments: [...f.treatments, { treatment }] }))
            }
          />
          <datalist id="treatment-options">
            {COMMON_TREATMENTS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </FormSection>

        <FormSection title="Patient goals & expectations">
          <div className="form-grid">
            <label className="full">
              Expected hairline design
              <textarea
                maxLength={1000}
                value={form.goals.hairline ?? ""}
                onChange={(e) => setGoals({ hairline: e.target.value })}
                placeholder="Shape, position, temple points"
              />
            </label>
            <label>
              Target graft count
              <input
                type="number"
                min={0}
                max={10000}
                step={50}
                value={form.goals.targetGrafts ?? ""}
                onChange={(e) => setGoals({ targetGrafts: num(e.target.value) })}
                placeholder="e.g. 2500"
              />
            </label>
            <label>
              Desired density
              <input
                maxLength={1000}
                value={form.goals.densityNotes ?? ""}
                onChange={(e) => setGoals({ densityNotes: e.target.value })}
                placeholder="e.g. 40–45 FU/cm² frontal"
              />
            </label>
            <label className="full">
              Expectations discussed
              <textarea
                maxLength={1000}
                value={form.goals.expectations ?? ""}
                onChange={(e) => setGoals({ expectations: e.target.value })}
                placeholder="What was agreed as realistic, number of sessions"
              />
            </label>
          </div>
        </FormSection>
      </fieldset>
      <SaveBar
        canEdit={canEdit}
        dirty={dirty}
        isPending={save.isPending}
        error={save.isError ? save.error : null}
        edited={hair}
        readOnlyNote="Only doctors and admins can edit the hair assessment."
      />
    </form>
  );
}
