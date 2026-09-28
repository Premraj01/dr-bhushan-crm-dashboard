import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { clinicDate, clinicTime } from '../common/dates';
import { BillingService } from './billing.service';

type InvoiceDocument = ReturnType<BillingService['invoiceDocument']>;

/** Brand colours, matching the dashboard theme. */
const C = {
  ink: '#16323a',
  muted: '#5b7478',
  line: '#dfe9e6',
  soft: '#f1f7f5',
  primary: '#124a52',
  accent: '#3a9d5d',
  accentSoft: '#e6f4ea',
  warning: '#b7791f',
  warningSoft: '#fdf3e1',
  danger: '#c0392b',
  dangerSoft: '#fbe9e7',
};

const PAGE = { width: 595.28, height: 841.89, margin: 44 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "29 Sep 2026" from YYYY-MM-DD. */
function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Clinic details printed on invoices; override with CLINIC_* in .env. */
function clinicProfile() {
  return {
    name: process.env.CLINIC_NAME ?? 'Dr. Bhushan’s Rejuvenation',
    tagline: process.env.CLINIC_TAGLINE ?? 'Hair & scalp restoration clinic',
    address: process.env.CLINIC_ADDRESS ?? 'Pune, Maharashtra',
    phone: process.env.CLINIC_PHONE,
    email: process.env.CLINIC_EMAIL,
    gstin: process.env.CLINIC_GSTIN,
  };
}

/** backend/assets, found from both src/ (tests) and dist/ (build). */
function assetsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'assets');
    if (existsSync(join(candidate, 'fonts', 'Inter-Regular.ttf')))
      return candidate;
    dir = dirname(dir);
  }
  throw new Error('Invoice assets (backend/assets) not found');
}

/** Builds the printable A4 invoice (logo, line items, totals, payments). */
@Injectable()
export class InvoicePdfService {
  constructor(private readonly billing: BillingService) {}

  render(invoiceId: string): Promise<Buffer> {
    const data = this.billing.invoiceDocument(invoiceId);
    const assets = assetsDir();
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE.margin,
      info: {
        Title: `Invoice ${data.invoice.id}`,
        Author: clinicProfile().name,
      },
    });
    doc.registerFont('regular', join(assets, 'fonts', 'Inter-Regular.ttf'));
    doc.registerFont('semibold', join(assets, 'fonts', 'Inter-SemiBold.ttf'));
    doc.registerFont('bold', join(assets, 'fonts', 'Inter-Bold.ttf'));

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    new InvoiceLayout(
      doc,
      data,
      join(assets, 'images', 'logo-mark.png'),
    ).draw();
    doc.end();
    return done;
  }
}

class InvoiceLayout {
  private y = PAGE.margin;
  private readonly left = PAGE.margin;
  private readonly right = PAGE.width - PAGE.margin;

  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly data: InvoiceDocument,
    private readonly logoPath: string,
  ) {}

  draw() {
    this.accentBar();
    this.header();
    this.metaStrip();
    this.parties();
    this.items();
    this.totals();
    this.payments();
    this.installments();
    this.footer();
  }

  /* ---------- sections ---------- */

  private accentBar() {
    const { doc } = this;
    doc.rect(0, 0, PAGE.width * 0.72, 6).fill(C.primary);
    doc.rect(PAGE.width * 0.72, 0, PAGE.width * 0.28, 6).fill(C.accent);
    this.y = 40;
  }

  private header() {
    const { doc, left, right } = this;
    const clinic = clinicProfile();
    const top = this.y;
    doc.image(this.logoPath, left, top, { width: 54, height: 54 });

    const textX = left + 66;
    doc
      .font('bold')
      .fontSize(17)
      .fillColor(C.primary)
      .text(clinic.name, textX, top + 4, { width: 280 });
    doc
      .font('regular')
      .fontSize(8.5)
      .fillColor(C.muted)
      .text(clinic.tagline.toUpperCase(), textX, doc.y + 1, {
        width: 280,
        characterSpacing: 0.8,
      });
    const contact = [
      clinic.address,
      [clinic.phone, clinic.email].filter(Boolean).join('  ·  '),
      clinic.gstin && `GSTIN ${clinic.gstin}`,
    ].filter(Boolean);
    doc
      .fontSize(8.5)
      .fillColor(C.muted)
      .text(contact.join('\n'), textX, doc.y + 4, { width: 280 });
    const leftBottom = doc.y;

    // Title block on the right.
    doc
      .font('bold')
      .fontSize(26)
      .fillColor(C.ink)
      .text('Invoice', right - 200, top, { width: 200, align: 'right' });
    doc
      .font('semibold')
      .fontSize(10)
      .fillColor(C.muted)
      .text(`# ${this.data.invoice.id}`, right - 200, doc.y + 2, {
        width: 200,
        align: 'right',
      });
    const status = this.status();
    doc.font('bold').fontSize(8);
    const pillWidth = doc.widthOfString(status.label) + 22;
    const pillY = doc.y + 8;
    doc
      .roundedRect(right - pillWidth, pillY, pillWidth, 20, 10)
      .fill(status.bg);
    doc.fillColor(status.fg).text(status.label, right - pillWidth, pillY + 6, {
      width: pillWidth,
      align: 'center',
      characterSpacing: 0.6,
    });

    this.y = Math.max(leftBottom, pillY + 20) + 24;
  }

  private metaStrip() {
    const { doc, left } = this;
    const { invoice, appointment } = this.data;
    const balance = Math.max(0, invoice.amount - invoice.paid);
    const cells: [string, string][] = [
      ['Issued on', longDate(invoice.issuedAt)],
      [
        'Visit date',
        appointment ? longDate(clinicDate(appointment.startsAt)) : '—',
      ],
      ['Invoice total', money.format(invoice.amount)],
      ['Balance due', money.format(balance)],
    ];
    const height = 50;
    doc.roundedRect(left, this.y, CONTENT_WIDTH, height, 8).fill(C.soft);
    const cellWidth = CONTENT_WIDTH / cells.length;
    cells.forEach(([label, value], i) => {
      const x = left + i * cellWidth + 16;
      this.label(label, x, this.y + 11, cellWidth - 20);
      doc
        .font('semibold')
        .fontSize(11)
        .fillColor(i === 3 && balance > 0 ? C.danger : C.ink)
        .text(value, x, this.y + 25, { width: cellWidth - 20 });
    });
    this.y += height + 22;
  }

  private parties() {
    const { doc, left } = this;
    const { invoice, patient, appointment } = this.data;
    const colWidth = (CONTENT_WIDTH - 24) / 2;
    const top = this.y;

    this.label('Billed to', left, top, colWidth);
    doc
      .font('semibold')
      .fontSize(12)
      .fillColor(C.ink)
      .text(invoice.patientName, left, top + 14, { width: colWidth });
    const patientLines = [
      patient && `Patient ID ${patient.id}`,
      patient?.phone,
      patient?.email,
    ].filter(Boolean);
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(C.muted)
      .text(patientLines.join('\n') || 'Walk-in patient', left, doc.y + 3, {
        width: colWidth,
        lineGap: 2,
      });
    const leftBottom = doc.y;

    const x = left + colWidth + 24;
    this.label('Visit', x, top, colWidth);
    doc
      .font('semibold')
      .fontSize(12)
      .fillColor(C.ink)
      .text(appointment?.type ?? invoice.service, x, top + 14, {
        width: colWidth,
      });
    const visitLines = [
      appointment &&
        `${longDate(clinicDate(appointment.startsAt))} · ${clinicTime(appointment.startsAt)}`,
      appointment?.doctor && `Doctor: ${appointment.doctor}`,
      invoice.packageId && `Treatment package ${invoice.packageId}`,
    ].filter(Boolean);
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(C.muted)
      .text(visitLines.join('\n'), x, doc.y + 3, {
        width: colWidth,
        lineGap: 2,
      });

    this.y = Math.max(leftBottom, doc.y) + 24;
  }

  private items() {
    const { doc, left } = this;
    const cols = {
      no: { x: left + 12, w: 20 },
      desc: { x: left + 36, w: 250 },
      qty: { x: left + 290, w: 44 },
      rate: { x: left + 338, w: 80 },
      amount: { x: left + 422, w: CONTENT_WIDTH - 422 - 12 },
    };
    const head = () => {
      doc.roundedRect(left, this.y, CONTENT_WIDTH, 26, 6).fill(C.primary);
      doc.font('semibold').fontSize(8).fillColor('#ffffff');
      const y = this.y + 9;
      doc.text('#', cols.no.x, y, { width: cols.no.w });
      doc.text('DESCRIPTION', cols.desc.x, y, {
        width: cols.desc.w,
        characterSpacing: 0.6,
      });
      doc.text('QTY', cols.qty.x, y, { width: cols.qty.w, align: 'right' });
      doc.text('RATE', cols.rate.x, y, { width: cols.rate.w, align: 'right' });
      doc.text('AMOUNT', cols.amount.x, y, {
        width: cols.amount.w,
        align: 'right',
      });
      this.y += 26;
    };
    head();

    this.data.lines.forEach((line, i) => {
      const detail =
        line.kind === 'medicine'
          ? [
              'Medicine',
              line.batchNo && `Batch ${line.batchNo}`,
              line.itemId && `SKU ${line.itemId}`,
            ]
              .filter(Boolean)
              .join('  ·  ')
          : 'Treatment';
      doc.font('semibold').fontSize(10);
      const titleHeight = doc.heightOfString(line.description, {
        width: cols.desc.w,
      });
      const rowHeight = Math.max(38, titleHeight + 26);
      if (this.ensureSpace(rowHeight)) head();

      const y = this.y + 10;
      if (i % 2 === 1)
        doc.rect(left, this.y, CONTENT_WIDTH, rowHeight).fill('#fafcfb');
      doc
        .font('regular')
        .fontSize(9)
        .fillColor(C.muted)
        .text(String(i + 1), cols.no.x, y, { width: cols.no.w });
      doc
        .font('semibold')
        .fontSize(10)
        .fillColor(C.ink)
        .text(line.description, cols.desc.x, y, { width: cols.desc.w });
      doc
        .font('regular')
        .fontSize(8)
        .fillColor(C.muted)
        .text(detail, cols.desc.x, doc.y + 2, { width: cols.desc.w });
      doc.font('regular').fontSize(10).fillColor(C.ink);
      doc.text(String(line.quantity), cols.qty.x, y, {
        width: cols.qty.w,
        align: 'right',
      });
      doc.text(money.format(line.unitPrice), cols.rate.x, y, {
        width: cols.rate.w,
        align: 'right',
      });
      doc.font('semibold').text(money.format(line.amount), cols.amount.x, y, {
        width: cols.amount.w,
        align: 'right',
      });
      this.y += rowHeight;
      doc
        .moveTo(left, this.y)
        .lineTo(this.right, this.y)
        .lineWidth(0.6)
        .strokeColor(C.line)
        .stroke();
    });
    this.y += 16;
  }

  private totals() {
    const { doc } = this;
    const { invoice, lines } = this.data;
    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
    const roundOff = Math.round((invoice.amount - subtotal) * 100) / 100;
    const balance = Math.max(0, invoice.amount - invoice.paid);
    const rows: [string, string][] = [
      ['Subtotal', money.format(subtotal)],
      ...(Math.abs(roundOff) >= 0.01
        ? [
            [
              'Round off',
              `${roundOff > 0 ? '+' : '−'}${money.format(Math.abs(roundOff))}`,
            ] as [string, string],
          ]
        : []),
    ];
    const width = 230;
    const x = this.right - width;
    this.ensureSpace(rows.length * 18 + 110);

    // Amount in words sits beside the totals.
    this.label(
      'Amount in words',
      this.left,
      this.y,
      CONTENT_WIDTH - width - 30,
    );
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(C.ink)
      .text(`${rupeesInWords(invoice.amount)} only`, this.left, this.y + 14, {
        width: CONTENT_WIDTH - width - 30,
      });

    let y = this.y;
    for (const [label, value] of rows) {
      doc.font('regular').fontSize(9.5).fillColor(C.muted);
      doc.text(label, x, y, { width: width / 2 });
      doc
        .fillColor(C.ink)
        .text(value, x + width / 2, y, { width: width / 2, align: 'right' });
      y += 18;
    }
    y += 4;
    doc.roundedRect(x - 12, y, width + 12, 34, 6).fill(C.primary);
    doc
      .font('semibold')
      .fontSize(10)
      .fillColor('#ffffff')
      .text('Total', x, y + 11, { width: width / 2 });
    doc
      .font('bold')
      .fontSize(13)
      .text(money.format(invoice.amount), x + width / 2 - 12, y + 9, {
        width: width / 2,
        align: 'right',
      });
    y += 44;
    const after: [string, string, string][] = [
      ['Paid', money.format(invoice.paid), C.accent],
      ['Balance due', money.format(balance), balance > 0 ? C.danger : C.accent],
    ];
    for (const [label, value, color] of after) {
      doc.font('semibold').fontSize(10).fillColor(C.muted);
      doc.text(label, x, y, { width: width / 2 });
      doc
        .fillColor(color)
        .text(value, x + width / 2, y, { width: width / 2, align: 'right' });
      y += 19;
    }
    this.y = Math.max(y, doc.y) + 18;
  }

  private payments() {
    const { payments } = this.data;
    if (payments.length === 0) return;
    this.table(
      'Payments received',
      ['Date', 'Method', 'Reference', 'Amount'],
      payments.map((p) => [
        `${longDate(clinicDate(p.receivedAt))} · ${clinicTime(p.receivedAt)}`,
        p.method,
        p.reference ?? '—',
        money.format(p.amount),
      ]),
    );
  }

  private installments() {
    const { installments } = this.data;
    if (installments.length === 0) return;
    this.table(
      'EMI schedule',
      ['Installment', 'Due date', 'Status', 'Amount'],
      installments.map((i) => [
        `EMI ${i.number} of ${installments.length}`,
        longDate(i.dueDate),
        i.status,
        money.format(i.amount),
      ]),
    );
  }

  private footer() {
    const { doc, left } = this;
    const clinic = clinicProfile();
    const y = PAGE.height - PAGE.margin - 40;
    if (this.y > y - 10) {
      doc.addPage();
    }
    doc
      .moveTo(left, y)
      .lineTo(this.right, y)
      .lineWidth(0.6)
      .strokeColor(C.line)
      .stroke();
    doc
      .font('semibold')
      .fontSize(10)
      .fillColor(C.primary)
      .text(`Thank you for choosing ${clinic.name}.`, left, y + 10, {
        width: CONTENT_WIDTH,
        lineBreak: false,
      });
    doc
      .font('regular')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(
        `Computer-generated invoice — no signature required. Generated ${longDate(clinicDate())}, ${clinicTime(new Date())}.`,
        left,
        y + 26,
        { width: CONTENT_WIDTH, lineBreak: false },
      );
  }

  /* ---------- helpers ---------- */

  private status() {
    const { invoice } = this.data;
    if (invoice.status === 'Paid')
      return { label: 'PAID', fg: C.accent, bg: C.accentSoft };
    if (invoice.status === 'Partially paid')
      return { label: 'PARTIALLY PAID', fg: C.warning, bg: C.warningSoft };
    if (invoice.status === 'Cancelled')
      return { label: 'CANCELLED', fg: C.muted, bg: C.soft };
    return { label: 'PAYMENT DUE', fg: C.danger, bg: C.dangerSoft };
  }

  private label(text: string, x: number, y: number, width: number) {
    this.doc
      .font('semibold')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(text.toUpperCase(), x, y, { width, characterSpacing: 0.7 });
  }

  /** Starts a new page when `height` won't fit; true if it did. */
  private ensureSpace(height: number): boolean {
    if (this.y + height <= PAGE.height - PAGE.margin - 60) return false;
    this.doc.addPage();
    this.y = PAGE.margin;
    return true;
  }

  /** A small four-column table (payments, EMIs); the last column is right-aligned. */
  private table(title: string, headers: string[], rows: string[][]) {
    const { doc, left } = this;
    const widths = [170, 110, 130, CONTENT_WIDTH - 410];
    this.ensureSpace(40 + rows.length * 22);
    this.label(title, left, this.y, CONTENT_WIDTH);
    this.y += 16;
    const row = (cells: string[], header: boolean) => {
      let x = left;
      doc
        .font(header ? 'semibold' : 'regular')
        .fontSize(header ? 7.5 : 9)
        .fillColor(header ? C.muted : C.ink);
      cells.forEach((cell, i) => {
        const last = i === cells.length - 1;
        doc.text(
          header ? cell.toUpperCase() : cell,
          x + (i === 0 ? 10 : 0),
          this.y + 7,
          {
            width: widths[i] - (last ? 10 : 12),
            align: last ? 'right' : 'left',
            lineBreak: false,
            ellipsis: true,
          },
        );
        x += widths[i];
      });
      this.y += 22;
    };
    doc.roundedRect(left, this.y, CONTENT_WIDTH, 22, 5).fill(C.soft);
    row(headers, true);
    for (const cells of rows) {
      row(cells, false);
      doc
        .moveTo(left, this.y)
        .lineTo(this.right, this.y)
        .lineWidth(0.5)
        .strokeColor(C.line)
        .stroke();
    }
    this.y += 18;
  }
}

/* ---------- amount in words (Indian numbering) ---------- */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function belowHundred(n: number): string {
  return n < 20
    ? ONES[n]
    : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds && `${ONES[hundreds]} Hundred`, rest && belowHundred(rest)]
    .filter(Boolean)
    .join(' ');
}

/** 123456 → "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six". */
export function rupeesInWords(amount: number): string {
  let n = Math.round(amount);
  if (n === 0) return 'Rupees Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return `Rupees ${parts.join(' ')}`;
}
