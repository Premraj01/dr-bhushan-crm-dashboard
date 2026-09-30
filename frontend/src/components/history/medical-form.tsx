import { useState, type FormEvent } from "react";
import {
  BLEEDING_RISK_DRUGS,
  CLEARANCE_STATUSES,
  COMMON_ALLERGIES,
  COMMON_CONDITIONS,
  COMMON_MEDICATIONS,
  SEVERITIES,
  useSaveMedical,
  type Allergy,
  type Condition,
  type Edited,
  type MedicalHistory,
  type Medication,
  type PastSurgery,
  type PatientHistory,
} from "./history-api";
import { clean } from "./format";
import { dosing } from "./prescription-options";
import { FormSection, QuickPicks, Rows, SaveBar } from "./shared";
import { ValidatedForm } from "@/components/form/validated-form";
import { SelectInput } from "@/components/form/select-input";

const EMPTY: MedicalHistory = {
  noKnownAllergies: false,
  allergies: [],
  conditions: [],
  medications: [],
  surgeries: [],
  clearance: "Not required",
};

const isBleedingRisk = (name: string) =>
  BLEEDING_RISK_DRUGS.some((d) => d.toLowerCase() === name.trim().toLowerCase());

function toForm(m: (MedicalHistory & Edited) | undefined): MedicalHistory {
  if (!m) return EMPTY;
  const { updatedBy: _by, updatedAt: _at, ...rest } = m;
  return rest;
}

/** Allergies, conditions, medications, past surgeries and clearance — checked before any procedure. */
export function MedicalForm({
  patientId,
  medical,
  prescribed,
  canEdit,
  onSaved,
  onOpenPrescriptions,
}: {
  patientId: string;
  medical: (MedicalHistory & Edited) | undefined;
  /** Active prescriptions from the clinic — shown read-only above the patient's own list. */
  prescribed: PatientHistory["prescribed"];
  canEdit: boolean;
  onSaved: () => void;
  onOpenPrescriptions: () => void;
}) {
  const save = useSaveMedical(patientId);
  const [form, setForm] = useState(() => toForm(medical));
  const set = <K extends keyof MedicalHistory>(k: K, v: MedicalHistory[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(medical));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: MedicalHistory = {
      noKnownAllergies: form.noKnownAllergies,
      allergies: form.noKnownAllergies ? [] : form.allergies.map(clean),
      conditions: form.conditions.map(clean),
      medications: form.medications.map(clean),
      surgeries: form.surgeries.map(clean),
      clearance: form.clearance,
      ...(form.clearanceNotes?.trim() && { clearanceNotes: form.clearanceNotes.trim() }),
      ...(form.notes?.trim() && { notes: form.notes.trim() }),
    };
    save.mutate(body, {
      onSuccess: (data) => {
        setForm(toForm(data.medical));
        onSaved();
      },
    });
  };

  return (
    <ValidatedForm onSubmit={submit} className="history-form">
      <fieldset className="form-lock" disabled={!canEdit || save.isPending}>
        <FormSection
          title="Allergies"
          hint="Drug and material allergies — local anaesthetics, latex, antibiotics."
        >
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.noKnownAllergies}
              onChange={(e) => set("noKnownAllergies", e.target.checked)}
            />
            No known drug allergies (NKDA) — confirmed with the patient
          </label>
          {!form.noKnownAllergies && (
            <>
              <Rows<Allergy>
                items={form.allergies}
                onChange={(v) => set("allergies", v)}
                blank={{ substance: "" }}
                addLabel="Add allergy"
                empty="No allergies recorded."
                render={(a, update) => (
                  <>
                    <label>
                      Substance
                      <input
                        required
                        maxLength={120}
                        list="allergy-options"
                        value={a.substance}
                        onChange={(e) => update({ substance: e.target.value })}
                      />
                    </label>
                    <label>
                      Reaction
                      <input
                        maxLength={200}
                        value={a.reaction ?? ""}
                        onChange={(e) => update({ reaction: e.target.value })}
                        placeholder="e.g. Hives, anaphylaxis"
                      />
                    </label>
                    <label>
                      Severity
                      <SelectInput
                        value={a.severity ?? ""}
                        onChange={(e) =>
                          update({ severity: (e.target.value || undefined) as Allergy["severity"] })
                        }
                      >
                        <option value="">Unknown</option>
                        {SEVERITIES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </SelectInput>
                    </label>
                  </>
                )}
              />
              <QuickPicks
                options={COMMON_ALLERGIES}
                taken={form.allergies.map((a) => a.substance)}
                onPick={(substance) => set("allergies", [...form.allergies, { substance }])}
              />
              <datalist id="allergy-options">
                {COMMON_ALLERGIES.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </>
          )}
        </FormSection>

        <FormSection
          title="Medical conditions"
          hint="Hypertension, diabetes, bleeding disorders, thyroid, autoimmune (e.g. alopecia areata) and infectious diseases."
        >
          <Rows<Condition>
            items={form.conditions}
            onChange={(v) => set("conditions", v)}
            blank={{ name: "", status: "Current" }}
            addLabel="Add condition"
            empty="No conditions recorded."
            render={(c, update) => (
              <>
                <label>
                  Condition
                  <input
                    required
                    maxLength={120}
                    list="condition-options"
                    value={c.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </label>
                <label>
                  Status
                  <SelectInput
                    value={c.status}
                    onChange={(e) => update({ status: e.target.value as Condition["status"] })}
                  >
                    <option>Current</option>
                    <option>Past</option>
                  </SelectInput>
                </label>
                <label>
                  Notes
                  <input
                    maxLength={300}
                    value={c.notes ?? ""}
                    onChange={(e) => update({ notes: e.target.value })}
                    placeholder="Control, treating doctor"
                  />
                </label>
              </>
            )}
          />
          <QuickPicks
            options={COMMON_CONDITIONS}
            taken={form.conditions.map((c) => c.name)}
            onPick={(name) => set("conditions", [...form.conditions, { name, status: "Current" }])}
          />
          <datalist id="condition-options">
            {COMMON_CONDITIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormSection>

        <FormSection
          title="Current medications & supplements"
          hint="Tick “Affects bleeding” for blood thinners and supplements that affect bleeding or healing."
        >
          {prescribed.length > 0 && (
            <div className="rx-current">
              <div>
                <strong>Prescribed by the clinic</strong>
                <button type="button" className="link-reset" onClick={onOpenPrescriptions}>
                  All prescriptions
                </button>
              </div>
              <ul>
                {prescribed.map((i) => (
                  <li key={`${i.prescriptionId}-${i.name}`}>
                    <span>
                      {i.name}
                      {i.affectsBleeding && <em> · affects bleeding</em>}
                    </span>
                    <small>{dosing(i)}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="field-note m-0">Medicines the patient takes from elsewhere:</p>
          <Rows<Medication>
            items={form.medications}
            onChange={(v) => set("medications", v)}
            blank={{ name: "", affectsBleeding: false }}
            addLabel="Add medication"
            empty="No medications recorded."
            render={(m, update) => (
              <>
                <label>
                  Medication / supplement
                  <input
                    required
                    maxLength={120}
                    list="medication-options"
                    value={m.name}
                    onChange={(e) =>
                      update({
                        name: e.target.value,
                        ...(isBleedingRisk(e.target.value) && { affectsBleeding: true }),
                      })
                    }
                  />
                </label>
                <label>
                  Dose
                  <input
                    maxLength={80}
                    value={m.dose ?? ""}
                    onChange={(e) => update({ dose: e.target.value })}
                    placeholder="e.g. 75 mg daily"
                  />
                </label>
                <label className="check-row inline">
                  <input
                    type="checkbox"
                    checked={m.affectsBleeding}
                    onChange={(e) => update({ affectsBleeding: e.target.checked })}
                  />
                  Affects bleeding
                </label>
              </>
            )}
          />
          <QuickPicks
            options={COMMON_MEDICATIONS}
            taken={form.medications.map((m) => m.name)}
            onPick={(name) =>
              set("medications", [
                ...form.medications,
                { name, affectsBleeding: isBleedingRisk(name) },
              ])
            }
          />
          <datalist id="medication-options">
            {COMMON_MEDICATIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </FormSection>

        <FormSection title="Previous surgeries">
          <Rows<PastSurgery>
            items={form.surgeries}
            onChange={(v) => set("surgeries", v)}
            blank={{ procedure: "" }}
            addLabel="Add surgery"
            empty="No previous surgeries recorded."
            render={(s, update) => (
              <>
                <label>
                  Procedure
                  <input
                    required
                    maxLength={160}
                    value={s.procedure}
                    onChange={(e) => update({ procedure: e.target.value })}
                  />
                </label>
                <label>
                  When
                  <input
                    maxLength={40}
                    value={s.when ?? ""}
                    onChange={(e) => update({ when: e.target.value })}
                    placeholder="e.g. 2019"
                  />
                </label>
                <label>
                  Notes
                  <input
                    maxLength={300}
                    value={s.notes ?? ""}
                    onChange={(e) => update({ notes: e.target.value })}
                    placeholder="Complications, anaesthesia"
                  />
                </label>
              </>
            )}
          />
        </FormSection>

        <FormSection
          title="Medical clearance"
          hint="From the primary physician or cardiologist. Upload the certificate under Consent & documents."
        >
          <div className="form-grid">
            <label>
              Clearance
              <SelectInput
                value={form.clearance}
                onChange={(e) => set("clearance", e.target.value as MedicalHistory["clearance"])}
              >
                {CLEARANCE_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </SelectInput>
            </label>
            <label className="full">
              Clearance notes
              <textarea
                maxLength={1000}
                value={form.clearanceNotes ?? ""}
                onChange={(e) => set("clearanceNotes", e.target.value)}
                placeholder="Who was asked, conditions attached (e.g. stop aspirin 7 days before)"
              />
            </label>
            <label className="full">
              Other medical notes
              <textarea
                maxLength={2000}
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
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
        edited={medical}
        readOnlyNote="Only doctors and admins can edit the medical history."
      />
    </ValidatedForm>
  );
}
