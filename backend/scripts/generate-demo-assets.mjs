#!/usr/bin/env node
/**
 * Builds the demo patient-history files in assets/demo/: illustrated "clinical photos"
 * (SVG → JPEG via ImageMagick) and sample consent / clearance PDFs (pdfkit), plus
 * manifest.json, which the seed loads when SEED_DEMO_DATA=true.
 *
 *   node scripts/generate-demo-assets.mjs      (needs `magick` on PATH)
 *
 * Output is deterministic, so re-running only changes files when this script changes.
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets', 'demo');
const fonts = join(root, 'assets', 'fonts');

/* ---------- people ---------- */

const STAFF = {
  bhushan: { id: 'USR-1', name: 'Dr. Bhushan Patil' },
  sonal: { id: 'USR-2', name: 'Dr. Sonal Desai' },
  priya: { id: 'USR-3', name: 'Priya More' },
};

/* ---------- photos ---------- */

const W = 1200;
const H = 900;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Stage parameters: density of the frontal zone, mid-scalp bridge and crown (0–1),
 * temple recession (0–1), central diffuse thinning for female pattern loss (0–1),
 * frontal hair length (1 = full), and fresh grafts / shaved donor on day 1.
 */
const NORWOOD_IV = {
  'Initial assessment': { front: 0.07, mid: 0.6, crown: 0.12, temple: 1 },
  'Day 1 post-op': { front: 0.07, mid: 0.6, crown: 0.12, temple: 1, grafts: true },
  '1 month': { front: 0.16, mid: 0.55, crown: 0.14, temple: 0.65, short: 0.3 },
  '3 months': { front: 0.38, mid: 0.65, crown: 0.22, temple: 0.4, short: 0.55 },
  '6 months': { front: 0.7, mid: 0.78, crown: 0.28, temple: 0.15, short: 0.85 },
  '1 year': { front: 0.92, mid: 0.88, crown: 0.34, temple: 0.04 },
};
const LUDWIG_II = {
  'Initial assessment': { diffuse: 0.68 },
  '1 month': { diffuse: 0.62 },
  Other: { diffuse: 0.46 },
};

const LOOKS = {
  'PT-1079': { skin: '#d6a47e', hair: '#231811', length: 1 },
  'PT-1083': { skin: '#c8926c', hair: '#1c1510', length: 1, grey: 0.12 },
  'PT-1084': { skin: '#e3b695', hair: '#3a2416', length: 1.9 },
};

/** Hair density (0–1) at normalised head coordinates for a view and stage. */
function density(view, u, v, p) {
  const front = p.front ?? 1;
  const mid = p.mid ?? 1;
  const crown = p.crown ?? 1;
  const temple = p.temple ?? 0;
  const du = Math.abs(u - 0.5);
  let d = 1;
  if (view === 'top' || view === 'wet') {
    if (v < 0.1) return 0; // forehead
    if (du > 0.2 && v < 0.1 + 0.22 * temple * smooth(0.2, 0.38, du)) return 0;
    if (v < 0.4) d = front + (1 - front) * smooth(0.3, 0.45, du);
    else if (v < 0.55) d = mid;
    const c = Math.hypot(u - 0.5, (v - 0.72) * 1.1);
    if (c < 0.17) d = Math.min(d, crown + (1 - crown) * smooth(0.1, 0.17, c));
  } else if (view === 'crown') {
    const c = Math.hypot(u - 0.5, v - 0.52);
    if (v < 0.18) d = mid;
    if (c < 0.3) d = Math.min(d, crown + (1 - crown) * smooth(0.2, 0.3, c));
  } else if (view === 'front') {
    const line = 0.36 - temple * 0.17 * smooth(0.12, 0.32, du);
    if (v > line) return du > 0.4 && v < 0.62 ? 1 : 0; // face, sideburns
    if (v > 0.1) d = front + (1 - front) * smooth(0.32, 0.46, du);
    else d = mid;
  } else if (view === 'left' || view === 'right') {
    const x = view === 'left' ? u : 1 - u; // 0 = face side
    if (v > 0.42 && x < 0.62) return 0;
    if (v > 0.8) return 0;
    if (x < 0.2 && v > 0.12) return 0;
    if (x < 0.3 && v > 0.26 && temple > 0.5) return 0;
    if (x < 0.52 && v < 0.4) d = front;
    else if (x < 0.66 && v < 0.24) d = mid;
    const c = Math.hypot(x - 0.74, v - 0.2);
    if (c < 0.13) d = Math.min(d, crown + (1 - crown) * smooth(0.08, 0.13, c));
  } else if (view === 'back') {
    if (v > 0.84) return 0;
    const c = Math.hypot(u - 0.5, v - 0.1);
    if (c < 0.16) d = crown + (1 - crown) * smooth(0.1, 0.16, c);
  }
  if (p.diffuse && v > 0.14 && v < 0.8 && view !== 'back') {
    d *= 1 - p.diffuse * Math.max(0, 1 - du / 0.2);
  }
  return d;
}

function head(view) {
  switch (view) {
    case 'crown':
      return { cx: 600, cy: 470, rx: 400, ry: 400 };
    case 'front':
      return { cx: 600, cy: 520, rx: 290, ry: 370 };
    case 'left':
    case 'right':
      return { cx: 600, cy: 470, rx: 320, ry: 360 };
    case 'back':
      return { cx: 600, cy: 440, rx: 300, ry: 350 };
    default:
      return { cx: 600, cy: 440, rx: 290, ry: 350 };
  }
}

const VIEW = {
  'Frontal hairline': 'front',
  'Top / vertex': 'top',
  Crown: 'crown',
  'Left profile': 'left',
  'Right profile': 'right',
  'Back (donor area)': 'back',
  'Wet hair': 'wet',
};

function photoSvg({ patientId, angle, milestone, takenOn }, params, seed) {
  const view = VIEW[angle];
  const look = LOOKS[patientId];
  const r = rng(seed);
  const { cx, cy, rx, ry } = head(view);
  const x0 = cx - rx;
  const y0 = cy - ry;
  const parts = [];

  // Neck, ears and face features, under the hair.
  if (view === 'front' || view === 'left' || view === 'right' || view === 'back') {
    parts.push(`<rect x="${cx - 120}" y="${cy + ry - 80}" width="240" height="${H}" fill="${look.skin}"/>`);
  }
  // Scalp with simple shading (the rasteriser doesn't do gradients).
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#b07f5e"/>`);
  parts.push(`<ellipse cx="${cx - rx * 0.06}" cy="${cy - ry * 0.06}" rx="${rx * 0.9}" ry="${ry * 0.9}" fill="${look.skin}"/>`);
  parts.push(`<ellipse cx="${cx - rx * 0.2}" cy="${cy - ry * 0.25}" rx="${rx * 0.35}" ry="${ry * 0.25}" fill="#ffffff" opacity="0.12"/>`);
  if (view === 'front') {
    for (const s of [-1, 1]) {
      parts.push(`<ellipse cx="${cx + s * (rx + 8)}" cy="${cy + 40}" rx="34" ry="70" fill="${look.skin}"/>`);
      parts.push(`<path d="M${cx + s * 50} ${cy + 20} q${s * 60} -26 ${s * 130} -4" stroke="${look.hair}" stroke-width="12" fill="none" stroke-linecap="round"/>`);
      parts.push(`<ellipse cx="${cx + s * 110}" cy="${cy + 60}" rx="30" ry="13" fill="#fff"/><circle cx="${cx + s * 110}" cy="${cy + 60}" r="10" fill="#3b2a20"/>`);
    }
    parts.push(`<path d="M${cx} ${cy + 70} l-22 120 q22 14 44 0" stroke="#a8795a" stroke-width="5" fill="none"/>`);
    parts.push(`<path d="M${cx - 70} ${cy + 250} q70 30 140 0" stroke="#9c5d4d" stroke-width="7" fill="none" stroke-linecap="round"/>`);
  }
  if (view === 'left' || view === 'right') {
    const s = view === 'left' ? -1 : 1; // direction the face points
    parts.push(`<path d="M${cx + s * (rx - 10)} ${cy + 20} l${s * 70} 110 l${-s * 60} 26 z" fill="${look.skin}"/>`);
    parts.push(`<ellipse cx="${cx - s * 10}" cy="${cy + 40}" rx="42" ry="72" fill="#b98463"/><ellipse cx="${cx - s * 10}" cy="${cy + 40}" rx="26" ry="52" fill="${look.skin}"/>`);
    parts.push(`<path d="M${cx + s * 170} ${cy - 20} q${s * 60} -18 ${s * 110} 4" stroke="${look.hair}" stroke-width="11" fill="none" stroke-linecap="round"/>`);
    parts.push(`<ellipse cx="${cx + s * 230}" cy="${cy + 14}" rx="20" ry="10" fill="#3b2a20"/>`);
  }

  // Hair strands on a jittered grid.
  const step = view === 'crown' ? 8 : 9;
  const strands = [];
  const dots = [];
  const whorl =
    view === 'crown' ? [cx, cy + 0.04 * ry] : [cx, y0 + 0.72 * 2 * ry];
  for (let y = y0; y < y0 + 2 * ry; y += step) {
    for (let x = x0; x < x0 + 2 * rx; x += step) {
      const px = x + (r() - 0.5) * step;
      const py = y + (r() - 0.5) * step;
      if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 > 1) continue;
      const u = (px - x0) / (2 * rx);
      const v = (py - y0) / (2 * ry);
      let d = density(view === 'wet' ? 'top' : view, u, v, params);
      if (view === 'wet') d *= 0.8;
      // Day 1: shaved FUE donor band with extraction sites.
      const donorBand = params.grafts && view === 'back' && v > 0.42 && v < 0.78;
      if (donorBand && r() < 0.22) dots.push([px, py, 2.6]);
      if (r() > d) continue;
      let dx;
      let dy;
      if (view === 'top' || view === 'crown' || view === 'wet') {
        const a = Math.atan2(py - whorl[1], px - whorl[0]) + 0.5;
        dx = Math.cos(a);
        dy = Math.sin(a);
      } else if (view === 'front') {
        dx = (u - 0.5) * 0.9;
        dy = 1;
      } else if (view === 'back') {
        dx = (u - 0.5) * 0.4;
        dy = 1;
      } else {
        dx = view === 'left' ? 0.8 : -0.8;
        dy = 0.7;
      }
      const n = Math.hypot(dx, dy);
      const inFront = view === 'front' ? v > 0.1 : view === 'left' || view === 'right' ? true : v < 0.45;
      let len = (14 + r() * 10) * look.length * (view === 'crown' ? 1.1 : 1);
      if (params.short && inFront) len *= params.short;
      if (donorBand) len = 3;
      const colour = look.grey && r() < look.grey ? '#8d8a86' : look.hair;
      strands.push(
        `<path d="M${px.toFixed(1)} ${py.toFixed(1)} l${((dx / n) * len).toFixed(1)} ${((dy / n) * len).toFixed(1)}" stroke="${colour}"/>`,
      );
    }
  }
  // Day 1: fresh grafts across the recipient area.
  if (params.grafts && view !== 'back') {
    for (let y = y0; y < y0 + 2 * ry; y += 11) {
      for (let x = x0; x < x0 + 2 * rx; x += 11) {
        const px = x + (r() - 0.5) * 8;
        const py = y + (r() - 0.5) * 8;
        if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 > 0.97) continue;
        const u = (px - x0) / (2 * rx);
        const v = (py - y0) / (2 * ry);
        const recipient = density(view, u, v, NORWOOD_IV['1 year']) - density(view, u, v, params);
        if (recipient > 0.3 && r() < 0.85) dots.push([px, py, 2.2]);
      }
    }
  }
  const wet = view === 'wet';
  const label = `SAMPLE PHOTO · ${angle} · ${milestone} · ${new Date(`${takenOn}T00:00:00Z`).toUTCString().slice(5, 16)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#c4d2d6"/>
  <rect y="${H / 2}" width="${W}" height="${H / 2}" fill="#b3c4ca"/>
  ${parts.join('\n  ')}
  <g stroke-width="${wet ? 3 : 2.1}" stroke-linecap="round" fill="none" opacity="${wet ? 0.95 : 0.9}">
  ${strands.join('')}
  </g>
  <g fill="#8e2f2a" opacity="0.85">${dots.map(([x, y, s]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s}"/>`).join('')}</g>
  ${wet ? `<ellipse cx="${cx - 60}" cy="${cy - 120}" rx="${rx * 0.5}" ry="${ry * 0.25}" fill="#fff" opacity="0.12"/>` : ''}
  <rect x="0" y="${H - 56}" width="${W}" height="56" fill="#0f2a30" opacity="0.78"/>
  <text x="24" y="${H - 20}" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#ffffff">${label}</text>
  <text x="${W - 24}" y="40" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#0f2a30" opacity="0.6">Dr. Bhushan’s Rejuvenation · demo data</text>
</svg>`;
}

const ALL_ANGLES = Object.keys(VIEW);
const photoPlan = [
  // Amit Joshi — FUE 2,800 grafts, Sept 2025: the full before-and-after journey.
  ...[
    ['Initial assessment', '2025-09-01', ALL_ANGLES, 'Baseline set before FUE; dry hair, clinic lighting'],
    ['Day 1 post-op', '2025-09-09', ['Frontal hairline', 'Top / vertex', 'Back (donor area)'], 'First wash done at clinic'],
    ['1 month', '2025-10-08', ['Frontal hairline', 'Top / vertex'], 'Expected shedding of transplanted hair'],
    ['3 months', '2025-12-08', ['Frontal hairline', 'Top / vertex', 'Crown'], undefined],
    ['6 months', '2026-03-09', ['Frontal hairline', 'Top / vertex', 'Left profile'], undefined],
    ['1 year', '2026-09-08', ALL_ANGLES, 'Final result review'],
  ].flatMap(([milestone, takenOn, angles, note]) =>
    angles.map((angle) => ({
      patientId: 'PT-1079',
      angle,
      milestone,
      takenOn,
      ...(note && { note }),
      params: NORWOOD_IV[milestone],
      uploadedBy: milestone === '1 year' || milestone === 'Initial assessment' ? STAFF.bhushan : STAFF.priya,
    })),
  ),
  // Rohan Kulkarni — Norwood IV, surgery being planned.
  ...['Frontal hairline', 'Top / vertex', 'Crown', 'Left profile', 'Right profile', 'Back (donor area)'].map(
    (angle) => ({
      patientId: 'PT-1083',
      angle,
      milestone: 'Initial assessment',
      takenOn: '2026-09-18',
      params: { ...NORWOOD_IV['Initial assessment'], mid: 0.5 },
      uploadedBy: STAFF.bhushan,
    }),
  ),
  // Ananya Deshmukh — Ludwig II on PRP.
  { patientId: 'PT-1084', angle: 'Top / vertex', milestone: 'Initial assessment', takenOn: '2026-07-24', note: 'Baseline before PRP course', params: LUDWIG_II['Initial assessment'], uploadedBy: STAFF.sonal },
  { patientId: 'PT-1084', angle: 'Frontal hairline', milestone: 'Initial assessment', takenOn: '2026-07-24', note: 'Baseline before PRP course', params: LUDWIG_II['Initial assessment'], uploadedBy: STAFF.sonal },
  { patientId: 'PT-1084', angle: 'Top / vertex', milestone: '1 month', takenOn: '2026-08-24', params: LUDWIG_II['1 month'], uploadedBy: STAFF.sonal },
  { patientId: 'PT-1084', angle: 'Top / vertex', milestone: 'Other', takenOn: '2026-09-26', note: 'After PRP session 3', params: LUDWIG_II.Other, uploadedBy: STAFF.priya },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- documents ---------- */

const CLINIC = {
  name: 'Dr. Bhushan’s Rejuvenation',
  address: 'Baner Road, Pune, Maharashtra 411045',
};

function pdf(file, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'Sample document', Author: CLINIC.name } });
    doc.registerFont('regular', join(fonts, 'Inter-Regular.ttf'));
    doc.registerFont('semibold', join(fonts, 'Inter-SemiBold.ttf'));
    doc.registerFont('bold', join(fonts, 'Inter-Bold.ttf'));
    const stream = createWriteStream(file);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    // Watermark: this is demo data.
    doc.save().rotate(-35, { origin: [300, 420] }).font('bold').fontSize(90).fillColor('#124a52').opacity(0.06).text('SAMPLE', 60, 380).restore();
    doc.opacity(1);
    doc.x = 56;
    doc.y = 56;
    draw(doc);
    doc.end();
  });
}

function letterhead(doc, title, subtitle) {
  doc.font('bold').fontSize(15).fillColor('#124a52').text(CLINIC.name);
  doc.font('regular').fontSize(9).fillColor('#5b7478').text(CLINIC.address);
  doc.moveDown(0.4).strokeColor('#dfe9e6').lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke();
  doc.moveDown(1).font('bold').fontSize(17).fillColor('#16323a').text(title);
  if (subtitle) doc.font('regular').fontSize(10).fillColor('#5b7478').text(subtitle);
  doc.moveDown(0.8);
}

function field(doc, label, value) {
  doc.font('semibold').fontSize(10).fillColor('#16323a').text(`${label}: `, { continued: true }).font('regular').text(value);
}

function para(doc, text) {
  doc.font('regular').fontSize(10).fillColor('#16323a').text(text, { align: 'justify', lineGap: 2 }).moveDown(0.5);
}

function bullets(doc, items) {
  for (const item of items) doc.font('regular').fontSize(10).fillColor('#16323a').text(`•  ${item}`, { indent: 8, lineGap: 2 });
  doc.moveDown(0.6);
}

/** A hand-drawn-looking signature over a line, with the printed name and time. */
function signature(doc, x, who, when, seed) {
  const y = doc.y + 34;
  const r = rng(seed);
  doc.save().strokeColor('#1d3f8a').lineWidth(1.4).moveTo(x, y);
  let px = x;
  for (let i = 0; i < 9; i++) {
    const nx = px + 12 + r() * 10;
    doc.bezierCurveTo(px + 4, y - 18 - r() * 12, nx - 4, y + 10 + r() * 8, nx, y - 2);
    px = nx;
  }
  doc.stroke().restore();
  doc.strokeColor('#16323a').lineWidth(0.6).moveTo(x, y + 12).lineTo(x + 200, y + 12).stroke();
  doc.font('semibold').fontSize(9).fillColor('#16323a').text(who, x, y + 16, { width: 220 });
  doc.font('regular').fontSize(8).fillColor('#5b7478').text(when, x, doc.y, { width: 220 });
}

function signatures(doc, patient, doctor, when, seed) {
  const top = doc.y;
  signature(doc, 56, `${patient} (patient)`, when, seed);
  const after = doc.y;
  doc.y = top;
  signature(doc, 320, `${doctor} (doctor)`, when, seed + 1);
  doc.y = Math.max(after, doc.y) + 10;
  doc.x = 56;
}

const istLabel = (iso) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST';

const surgeryConsent = (patient, age, grafts, doctor, when, seed) => (doc) => {
  letterhead(doc, 'Informed consent — hair transplant surgery (FUE)', 'Please read carefully. Ask the doctor about anything that is unclear before signing.');
  field(doc, 'Patient', `${patient}, ${age} years`);
  field(doc, 'Procedure', `Follicular unit extraction (FUE), approx. ${grafts} grafts`);
  field(doc, 'Surgeon', doctor);
  doc.moveDown(0.8);
  para(doc, 'I understand that hair transplantation is a minor surgical procedure performed under local anaesthesia. Follicular units are removed from the donor area (back and sides of the scalp) and implanted in the thinning areas.');
  doc.font('bold').fontSize(11).text('Risks and possible complications').moveDown(0.3);
  bullets(doc, [
    'Pain, swelling of the forehead and eyes for a few days, bleeding and infection.',
    'Temporary numbness of the scalp; shock loss of existing hair in the recipient area.',
    'Folliculitis, cysts, visible scarring in the donor area, or poor graft survival.',
    'Allergic reaction to local anaesthetic (lidocaine) or other medicines.',
    'Further hair loss in untreated areas may continue; more sessions may be needed.',
  ]);
  doc.font('bold').fontSize(11).text('Expected outcome').moveDown(0.3);
  para(doc, 'Transplanted hair usually sheds in 2–4 weeks and starts to regrow at 3–4 months. Most of the result is visible at 8–12 months. The final density depends on donor quality, graft survival and my own healing; no specific result is guaranteed.');
  para(doc, 'I have disclosed my allergies, medical conditions and all medicines and supplements, including blood thinners. I agree to follow the pre- and post-operative instructions.');
  signatures(doc, patient, doctor, `Signed ${istLabel(when)}`, seed);
};

const photoConsent = (patient, use, when, seed) => (doc) => {
  letterhead(doc, 'Consent to use of clinical photographs', 'Before & after photographs');
  field(doc, 'Patient', patient);
  field(doc, 'Permitted use', use);
  doc.moveDown(0.8);
  para(doc, 'I agree that the clinic may take photographs of my scalp and hair before, during and after treatment. These photographs are part of my medical record in every case.');
  para(doc, use === 'Marketing & education'
    ? 'I also allow the clinic to use these photographs, with my face and identifying features hidden, on its website, social media and printed material, and for medical education and conferences.'
    : 'I allow the clinic to use these photographs, with my face and identifying features hidden, for medical education and training only — not for advertising or social media.');
  para(doc, 'I may withdraw this consent at any time by telling the clinic in writing. Photographs already published cannot always be recalled.');
  signatures(doc, patient, 'Dr. Bhushan Patil', `Signed ${istLabel(when)}`, seed);
};

const prpConsent = (patient, when, seed) => (doc) => {
  letterhead(doc, 'Consent for PRP (platelet-rich plasma) therapy', 'Course of 6 sessions, 4 weeks apart');
  field(doc, 'Patient', patient);
  doc.moveDown(0.8);
  para(doc, 'A small amount of my blood will be drawn, processed to concentrate the platelets and injected into the scalp. Results vary and are usually seen after 3–4 sessions; maintenance sessions may be needed.');
  bullets(doc, ['Pain or tenderness at injection sites for 1–2 days.', 'Bruising, mild swelling or headache.', 'Rarely, infection at an injection site.']);
  signatures(doc, patient, 'Dr. Sonal Desai', `Signed ${istLabel(when)}`, seed);
};

const clearanceLetter = (patient, when) => (doc) => {
  doc.font('bold').fontSize(15).fillColor('#3a5a9b').text('Kulkarni Family Clinic');
  doc.font('regular').fontSize(9).fillColor('#5b7478').text('Dr. Rajesh Kulkarni, MD (Medicine) · Reg. No. MMC 2004/03/1187 · Aundh, Pune');
  doc.moveDown(0.4).strokeColor('#dfe9e6').moveTo(56, doc.y).lineTo(539, doc.y).stroke().moveDown(1.2);
  doc.font('regular').fontSize(10).fillColor('#16323a').text(`Date: ${istLabel(when).split(',')[0]}`).moveDown(1);
  doc.font('bold').fontSize(14).text('Medical fitness certificate for minor surgery').moveDown(0.8);
  para(doc, `This is to certify that I have examined ${patient}. He has well-controlled hypertension on amlodipine 5 mg daily. Blood pressure today 128/82 mmHg. ECG normal sinus rhythm. CBC, blood sugar and coagulation profile (PT/INR) within normal limits.`);
  para(doc, 'He is medically fit to undergo hair transplant surgery under local anaesthesia. Continue amlodipine on the day of surgery. Avoid adrenaline-heavy infiltration where possible and monitor blood pressure during the procedure.');
  doc.moveDown(1);
  signature(doc, 56, 'Dr. Rajesh Kulkarni, MD', istLabel(when), 77);
};

const documentPlan = [
  { patientId: 'PT-1079', kind: 'Medical clearance', title: 'Physician fitness certificate — Dr. Rajesh Kulkarni', signedAt: '2025-08-28T17:30:00+05:30', format: 'Physical (scanned)', notes: 'BP controlled; continue amlodipine on the day.', uploadedBy: STAFF.priya, draw: clearanceLetter('Amit Joshi', '2025-08-28T17:30:00+05:30') },
  { patientId: 'PT-1079', kind: 'Surgery consent', title: 'Informed consent — hair transplant surgery', signedAt: '2025-09-01T11:10:00+05:30', format: 'Physical (scanned)', notes: 'Witness: Priya More (reception)', uploadedBy: STAFF.priya, draw: surgeryConsent('Amit Joshi', 37, '2,800', 'Dr. Bhushan Patil', '2025-09-01T11:10:00+05:30', 11) },
  { patientId: 'PT-1079', kind: 'Photo consent', title: 'Before & after photo consent', signedAt: '2025-09-01T11:15:00+05:30', format: 'Physical (scanned)', photoUse: 'Marketing & education', uploadedBy: STAFF.priya, draw: photoConsent('Amit Joshi', 'Marketing & education', '2025-09-01T11:15:00+05:30', 21) },
  { patientId: 'PT-1083', kind: 'Surgery consent', title: 'Informed consent — hair transplant surgery', signedAt: '2026-09-18T12:05:00+05:30', format: 'Digital', notes: 'Signed on the clinic tablet after consultation.', uploadedBy: STAFF.bhushan, draw: surgeryConsent('Rohan Kulkarni', 41, '3,200', 'Dr. Bhushan Patil', '2026-09-18T12:05:00+05:30', 31) },
  { patientId: 'PT-1083', kind: 'Photo consent', title: 'Before & after photo consent', signedAt: '2026-09-18T12:08:00+05:30', format: 'Digital', photoUse: 'Education only', uploadedBy: STAFF.bhushan, draw: photoConsent('Rohan Kulkarni', 'Education only', '2026-09-18T12:08:00+05:30', 41) },
  { patientId: 'PT-1084', kind: 'Other', title: 'PRP therapy consent', signedAt: '2026-07-24T10:20:00+05:30', format: 'Physical (scanned)', uploadedBy: STAFF.sonal, draw: prpConsent('Ananya Deshmukh', '2026-07-24T10:20:00+05:30', 51) },
  { patientId: 'PT-1084', kind: 'Photo consent', title: 'Before & after photo consent', signedAt: '2026-07-24T10:25:00+05:30', format: 'Physical (scanned)', photoUse: 'Education only', notes: 'Patient asked to stop using her photos (phone call, 26 Sep).', uploadedBy: STAFF.sonal, revokedAt: '2026-09-26T16:40:00+05:30', revokedBy: STAFF.priya, draw: photoConsent('Ananya Deshmukh', 'Education only', '2026-07-24T10:25:00+05:30', 61) },
];

/* ---------- build ---------- */

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'photos'), { recursive: true });
mkdirSync(join(out, 'documents'), { recursive: true });

const photos = photoPlan.map(({ params, ...p }, i) => {
  const file = `photos/${p.patientId}-${slug(p.milestone)}-${slug(p.angle)}.jpg`;
  const svg = photoSvg(p, params, 1000 + i * 7 + (p.patientId === 'PT-1083' ? 500 : 0));
  const res = spawnSync('magick', ['svg:-', '-quality', '78', '-strip', join(out, file)], { input: svg });
  if (res.status !== 0) throw new Error(`magick failed for ${file}: ${res.stderr}`);
  return { ...p, file };
});

const documents = [];
for (const { draw, ...d } of documentPlan) {
  const file = `documents/${d.patientId}-${slug(d.title)}.pdf`;
  await pdf(join(out, file), draw);
  documents.push({ ...d, signedAt: new Date(d.signedAt).toISOString(), ...(d.revokedAt && { revokedAt: new Date(d.revokedAt).toISOString() }), file });
}

writeFileSync(join(out, 'manifest.json'), `${JSON.stringify({ photos, documents }, null, 2)}\n`);
console.log(`Wrote ${photos.length} photos and ${documents.length} documents to ${out}`);
