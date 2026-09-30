import { SeedEntity } from '../common/entity';
import { Appointment } from '../appointments/appointment.entity';
import { ConcernOption, TreatmentOption } from '../catalog/catalog.entity';
import { InventoryItem } from '../inventory/inventory-item.entity';
import { Invoice } from '../invoices/invoice.entity';
import { Payment } from '../invoices/payment.entity';
import { TreatmentPlan } from '../plans/plan.entity';
import { Lead } from '../leads/lead.entity';
import { PatientHistory, Prescription } from '../history/history.entity';
import { Patient } from '../patients/patient.entity';
import { Treatment } from '../treatments/treatment.entity';
import { User } from '../users/user.entity';

// Mirrors the mock data the frontend prototype was designed with (Pune clinic, Sept 2026).
const ist = (local: string) => new Date(`${local}+05:30`).toISOString();

/**
 * Demo patients and their appointments, treatment records, invoices and payments load only
 * when SEED_DEMO_DATA=true (the e2e tests turn it on). Otherwise the clinic starts empty;
 * team logins, Settings (treatments, concerns, plans), leads and sample inventory are always seeded.
 */
// Read when each service starts (after .env is loaded), not when this file is imported.
const demo =
  <T>(items: T[]) =>
  (): T[] =>
    process.env.SEED_DEMO_DATA === 'true' ? items : [];

export const seedTeam: SeedEntity<User>[] = [
  {
    id: 'USR-1',
    name: 'Dr. Bhushan Patil',
    email: 'admin@drbhushan.clinic',
    role: 'SuperAdmin',
    title: 'Super Admin · Lead doctor',
    status: 'Active',
  },
  {
    id: 'USR-2',
    name: 'Dr. Sonal Desai',
    email: 'sonal@drbhushan.clinic',
    role: 'Doctor',
    title: 'Doctor',
    status: 'Active',
  },
  {
    id: 'USR-3',
    name: 'Priya More',
    email: 'priya@drbhushan.clinic',
    role: 'Receptionist',
    title: 'Receptionist',
    status: 'Active',
  },
  {
    id: 'USR-4',
    name: 'Ashwini Kale',
    email: 'ashwini@drbhushan.clinic',
    role: 'Receptionist',
    title: 'Receptionist',
    status: 'Invited',
  },
  {
    id: 'USR-5',
    name: 'Meera Jadhav',
    email: 'meera@drbhushan.clinic',
    role: 'Nurse',
    title: 'Nurse',
    status: 'Active',
  },
];

const demoPatients: SeedEntity<Patient>[] = [
  {
    id: 'PT-1084',
    createdAt: ist('2026-07-24T10:00:00'),
    name: 'Ananya Deshmukh',
    firstName: 'Ananya',
    lastName: 'Deshmukh',
    gender: 'Female',
    age: 32,
    phone: '+91 98230 78142',
    concern: 'Hair thinning',
    treatment: 'PRP · Session 3/6',
    lastVisit: '2026-09-26',
  },
  {
    id: 'PT-1083',
    createdAt: ist('2026-06-05T11:30:00'),
    name: 'Rohan Kulkarni',
    firstName: 'Rohan',
    lastName: 'Kulkarni',
    gender: 'Male',
    age: 41,
    phone: '+91 97654 30218',
    concern: 'Norwood IV',
    treatment: 'Transplant · 3,200 grafts',
    lastVisit: '2026-09-18',
  },
  {
    id: 'PT-1082',
    createdAt: ist('2026-08-20T16:00:00'),
    name: 'Meera Shah',
    firstName: 'Meera',
    lastName: 'Shah',
    gender: 'Female',
    age: 29,
    phone: '+91 98906 44109',
    concern: 'Postpartum loss',
    treatment: 'PRP · Session 1/4',
    lastVisit: '2026-09-17',
  },
  {
    id: 'PT-1081',
    createdAt: ist('2026-09-16T12:15:00'),
    name: 'Siddharth Jain',
    firstName: 'Siddharth',
    lastName: 'Jain',
    gender: 'Male',
    age: 36,
    phone: '+91 99701 52470',
    concern: 'Receding hairline',
    treatment: 'Consultation',
    lastVisit: '2026-09-16',
  },
  {
    id: 'PT-1080',
    createdAt: ist('2026-03-10T09:45:00'),
    name: 'Kavita Rao',
    firstName: 'Kavita',
    lastName: 'Rao',
    gender: 'Female',
    age: 45,
    phone: '+91 98221 90433',
    concern: 'Diffuse thinning',
    treatment: 'PRP · Session 5/6',
    lastVisit: '2026-09-15',
  },
  {
    id: 'PT-1079',
    createdAt: ist('2025-08-20T15:00:00'),
    name: 'Amit Vinod Joshi',
    firstName: 'Amit',
    middleName: 'Vinod',
    lastName: 'Joshi',
    gender: 'Male',
    dateOfBirth: '1988-02-14',
    phone: '+91 98500 41276',
    email: 'amit.joshi@example.com',
    address: 'Flat 6B, Sai Residency, Kothrud, Pune 411038',
    emergencyContact: {
      name: 'Neha Joshi',
      relationship: 'Spouse',
      phone: '+91 98500 41277',
    },
    concern: 'Norwood IV',
    treatment: 'FUE · 2,800 grafts (Sep 2025)',
    lastVisit: '2026-09-08',
    notes: '1-year review done — very happy with the frontal result.',
  },
];

const demoAppointments: SeedEntity<Appointment>[] = [
  {
    id: 'APT-501',
    patientId: 'PT-1084',
    patientName: 'Ananya Deshmukh',
    type: 'PRP Session 3',
    doctor: 'Dr. Bhushan Patil',
    startsAt: ist('2026-09-26T09:30:00'),
    durationMinutes: 45,
    status: 'Checked in',
  },
  {
    id: 'APT-502',
    patientName: 'Vikram Bhosale',
    type: 'Consultation',
    doctor: 'Dr. Bhushan Patil',
    startsAt: ist('2026-09-26T10:45:00'),
    durationMinutes: 30,
    status: 'Scheduled',
  },
  {
    id: 'APT-503',
    patientId: 'PT-1083',
    patientName: 'Rohan Kulkarni',
    type: 'Post-op review',
    doctor: 'Dr. Sonal Desai',
    startsAt: ist('2026-09-26T12:00:00'),
    durationMinutes: 30,
    status: 'Scheduled',
  },
  {
    id: 'APT-504',
    patientId: 'PT-1082',
    patientName: 'Meera Shah',
    type: 'PRP Session 1',
    doctor: 'Dr. Bhushan Patil',
    startsAt: ist('2026-09-26T14:30:00'),
    durationMinutes: 45,
    status: 'Checked in',
  },
  {
    id: 'APT-505',
    patientName: 'Amit Patil',
    type: 'Hair analysis',
    doctor: 'Dr. Sonal Desai',
    startsAt: ist('2026-09-26T16:00:00'),
    durationMinutes: 30,
    status: 'Scheduled',
  },
  // Upcoming visits (shown on the Patients cards and in the calendar).
  {
    id: 'APT-506',
    patientId: 'PT-1081',
    patientName: 'Siddharth Jain',
    type: 'Follow-up consultation',
    doctor: 'Dr. Bhushan Patil',
    startsAt: ist('2026-10-06T15:30:00'),
    durationMinutes: 30,
    status: 'Scheduled',
  },
  {
    id: 'APT-507',
    patientId: 'PT-1080',
    patientName: 'Kavita Rao',
    type: 'PRP Session 6',
    doctor: 'Dr. Sonal Desai',
    startsAt: ist('2026-10-13T12:00:00'),
    durationMinutes: 45,
    status: 'Scheduled',
  },
  {
    id: 'APT-508',
    patientId: 'PT-1084',
    patientName: 'Ananya Deshmukh',
    type: 'PRP Session 4',
    doctor: 'Dr. Bhushan Patil',
    startsAt: ist('2026-10-24T11:30:00'),
    durationMinutes: 45,
    status: 'Rescheduled',
    rescheduledAt: ist('2026-09-27T10:00:00'),
  },
  {
    id: 'APT-509',
    patientId: 'PT-1083',
    patientName: 'Rohan Kulkarni',
    type: 'Pre-op consultation',
    doctor: 'Dr. Bhushan Patil',
    startsAt: ist('2026-10-20T16:30:00'),
    durationMinutes: 30,
    status: 'Scheduled',
  },
];

export const seedLeads: SeedEntity<Lead>[] = [
  {
    id: 'LD-301',
    name: 'Nikhil Pawar',
    source: 'Instagram',
    interest: 'Hair transplant',
    value: 85000,
    nextAction: 'Call today',
    stage: 'New',
  },
  {
    id: 'LD-302',
    name: 'Priya Nair',
    source: 'WhatsApp',
    interest: 'PRP package',
    value: 18000,
    nextAction: 'WhatsApp · 4 PM',
    stage: 'Contacted',
  },
  {
    id: 'LD-303',
    name: 'Akash Mehta',
    source: 'Referral',
    interest: 'Hair transplant',
    value: 110000,
    nextAction: 'Consult · 27 Sep',
    stage: 'Consultation',
  },
  {
    id: 'LD-304',
    name: 'Shreya Gupta',
    source: 'Website',
    interest: 'PRP package',
    value: 24000,
    nextAction: 'Follow-up · 28 Sep',
    stage: 'Qualified',
  },
];

const demoTreatments: SeedEntity<Treatment>[] = [
  {
    id: 'TR-701',
    patientId: 'PT-1084',
    patientName: 'Ananya Deshmukh',
    type: 'PRP',
    plan: 'Session 3 of 6',
    sessionsCompleted: 3,
    sessionsTotal: 6,
    lastSessionAt: '2026-09-26',
    outcome: 'Improving',
    status: 'Active',
  },
  {
    id: 'TR-702',
    patientId: 'PT-1083',
    patientName: 'Rohan Kulkarni',
    type: 'Transplant',
    plan: '3,200 grafts · Norwood IV',
    grafts: 3200,
    lastSessionAt: '2026-09-12',
    outcome: 'Day 14 recovery',
    status: 'Recovery',
  },
  {
    id: 'TR-703',
    patientId: 'PT-1082',
    patientName: 'Meera Shah',
    type: 'PRP',
    plan: 'Session 1 of 4',
    sessionsCompleted: 1,
    sessionsTotal: 4,
    lastSessionAt: '2026-09-17',
    outcome: 'Baseline',
    status: 'Active',
  },
  {
    id: 'TR-704',
    patientName: 'Arjun Sethi',
    type: 'Transplant',
    plan: '2,450 grafts · Norwood III',
    grafts: 2450,
    lastSessionAt: '2026-09-04',
    outcome: 'Good density',
    status: 'Review due',
  },
  {
    id: 'TR-705',
    patientId: 'PT-1080',
    patientName: 'Kavita Rao',
    type: 'PRP',
    plan: 'Session 5 of 6',
    sessionsCompleted: 5,
    sessionsTotal: 6,
    lastSessionAt: '2026-09-15',
    outcome: 'Visible regrowth',
    status: 'Active',
  },
];

const demoInvoices: SeedEntity<Invoice>[] = [
  {
    id: 'INV-26091',
    patientId: 'PT-1083',
    patientName: 'Rohan Kulkarni',
    service: 'Hair transplant',
    issuedAt: '2026-09-25',
    amount: 105000,
    paid: 105000,
    status: 'Paid',
  },
  {
    id: 'INV-26090',
    patientId: 'PT-1082',
    patientName: 'Meera Shah',
    service: 'PRP package · 4',
    issuedAt: '2026-09-24',
    amount: 18000,
    paid: 18000,
    status: 'Paid',
  },
  {
    id: 'INV-26089',
    patientName: 'Amit Patil',
    service: 'Consultation',
    issuedAt: '2026-09-24',
    amount: 800,
    paid: 0,
    status: 'Pending',
  },
  {
    id: 'INV-26088',
    patientId: 'PT-1080',
    patientName: 'Kavita Rao',
    service: 'PRP session',
    issuedAt: '2026-09-23',
    amount: 4500,
    paid: 4500,
    status: 'Paid',
  },
  {
    id: 'INV-26087',
    patientId: 'PT-1081',
    patientName: 'Siddharth Jain',
    service: 'Hair analysis',
    issuedAt: '2026-09-22',
    amount: 1200,
    paid: 0,
    status: 'Overdue',
  },
];

export const seedTreatmentOptions: SeedEntity<TreatmentOption>[] = [
  {
    id: 'TO-1',
    name: 'Consultation',
    category: 'Consultation',
    price: 800,
    pricingUnit: 'session',
    duration: 30,
    durationUnit: 'minutes',
    description: 'First visit with scalp assessment',
    active: true,
  },
  {
    id: 'TO-2',
    name: 'Hair analysis',
    category: 'Consultation',
    price: 1200,
    pricingUnit: 'session',
    duration: 30,
    durationUnit: 'minutes',
    description: 'Trichoscopy and density mapping',
    active: true,
  },
  {
    id: 'TO-3',
    name: 'PRP session',
    category: 'PRP',
    sessions: 1,
    price: 4500,
    pricingUnit: 'session',
    duration: 45,
    durationUnit: 'minutes',
    active: true,
  },
  {
    id: 'TO-6',
    name: 'FUE hair transplant',
    category: 'Transplant',
    sessions: 1,
    price: 20,
    pricingUnit: 'graft',
    duration: 1,
    durationMax: 3,
    durationUnit: 'days',
    surgical: true,
    description: 'Priced per graft',
    active: true,
  },
  {
    id: 'TO-7',
    name: 'Derma roller',
    category: 'Scalp therapy',
    sessions: 1,
    price: 1500,
    pricingUnit: 'session',
    duration: 20,
    durationUnit: 'minutes',
    description: 'Microneedling between PRP sessions',
    active: true,
  },
];

/** Settings → Treatment plans (see PlansService). */
export const seedTreatmentPlans: SeedEntity<TreatmentPlan>[] = [
  {
    id: 'TP-1',
    name: 'PRP with derma roller',
    description: 'PRP every 21 days with two roller sessions in between',
    items: [
      {
        repeat: 4,
        steps: [
          {
            treatmentId: 'TO-3',
            gap: { value: 7, unit: 'days' },
            windowDays: 2,
          },
          {
            treatmentId: 'TO-7',
            gap: { value: 7, unit: 'days' },
            windowDays: 2,
          },
          {
            treatmentId: 'TO-7',
            gap: { value: 7, unit: 'days' },
            windowDays: 2,
          },
        ],
      },
    ],
    active: true,
  },
  {
    id: 'TP-2',
    name: 'Hair transplant with PRP care',
    description: 'FUE, then 3 complimentary PRP sessions 2 months apart',
    items: [
      { treatmentId: 'TO-6', quantity: 2000, windowDays: 7 },
      {
        repeat: 3,
        steps: [
          {
            treatmentId: 'TO-3',
            gap: { value: 2, unit: 'months' },
            windowDays: 7,
            complimentary: true,
          },
        ],
      },
    ],
    active: true,
  },
  {
    id: 'TP-3',
    name: 'Monthly PRP course',
    description: 'Four PRP sessions a month apart',
    items: [
      {
        repeat: 4,
        steps: [
          {
            treatmentId: 'TO-3',
            gap: { value: 1, unit: 'months' },
            windowDays: 3,
          },
        ],
      },
    ],
    active: true,
  },
];

export const seedConcernOptions: SeedEntity<ConcernOption>[] = [
  { id: 'CO-1', name: 'Hair thinning', active: true },
  { id: 'CO-2', name: 'Receding hairline', active: true },
  { id: 'CO-3', name: 'Diffuse thinning', active: true },
  {
    id: 'CO-4',
    name: 'Postpartum loss',
    description: 'Telogen effluvium after pregnancy',
    active: true,
  },
  // Norwood scale (male pattern hair loss)
  {
    id: 'CO-5',
    name: 'Stage 1',
    description: 'No significant recession',
    illustration: 'norwood-1',
    active: true,
  },
  {
    id: 'CO-6',
    name: 'Stage 2',
    description: 'Slight temple recession',
    illustration: 'norwood-2',
    active: true,
  },
  {
    id: 'CO-7',
    name: 'Stage 3',
    description: 'Deep frontal recession',
    illustration: 'norwood-3',
    active: true,
  },
  {
    id: 'CO-8',
    name: 'Stage 3 Vertex',
    description: 'Recession plus crown thinning',
    illustration: 'norwood-3v',
    active: true,
  },
  {
    id: 'CO-9',
    name: 'Stage 4',
    description: 'Frontal loss with sparse bridge',
    illustration: 'norwood-4',
    active: true,
  },
  {
    id: 'CO-10',
    name: 'Stage 5',
    description: 'Bridge narrowing, larger crown',
    illustration: 'norwood-5',
    active: true,
  },
  {
    id: 'CO-11',
    name: 'Stage 6',
    description: 'Bridge lost, zones merged',
    illustration: 'norwood-6',
    active: true,
  },
  {
    id: 'CO-12',
    name: 'Stage 7',
    description: 'Only donor rim remains',
    illustration: 'norwood-7',
    active: true,
  },
  {
    id: 'CO-13',
    name: 'Alopecia areata',
    description: 'Patchy, round bald spots',
    illustration: 'alopecia-areata',
    active: true,
  },
];

// Payments behind the invoices seeded as Paid, so they show under Billing → Received.
const reception = { id: 'USR-3', name: 'Priya More' };
const demoPayments: SeedEntity<Payment>[] = [
  {
    id: 'PAY-1',
    invoiceId: 'INV-26091',
    patientId: 'PT-1083',
    patientName: 'Rohan Kulkarni',
    amount: 105000,
    method: 'Bank transfer',
    reference: 'NEFT-SBIN2609',
    receivedBy: reception,
    receivedAt: ist('2026-09-25T12:10:00'),
  },
  {
    id: 'PAY-2',
    invoiceId: 'INV-26090',
    patientId: 'PT-1082',
    patientName: 'Meera Shah',
    amount: 18000,
    method: 'UPI',
    reference: 'UPI-6620145',
    receivedBy: reception,
    receivedAt: ist('2026-09-24T15:40:00'),
  },
  {
    id: 'PAY-3',
    invoiceId: 'INV-26088',
    patientId: 'PT-1080',
    patientName: 'Kavita Rao',
    amount: 4500,
    method: 'Cash',
    receivedBy: reception,
    receivedAt: ist('2026-09-23T11:05:00'),
  },
];

// Products stocked at the clinic; ids are SKUs / barcodes. Images are served by the
// frontend from public/products/.
const seedInventoryItems: SeedEntity<InventoryItem>[] = [
  {
    id: '8901234560011',
    name: 'Minoxidil 5% topical solution 60 ml',
    company: 'Dr. Reddy’s',
    type: 'Solution',
    stockQuantity: 42,
    reorderLevel: 15,
    costPrice: 480,
    sellingPrice: 650,
    batchNo: 'MX5-2406',
    expiryDate: '2027-06-30',
    imageUrl: '/products/minoxidil-solution.svg',
  },
  {
    id: '8901234560028',
    name: 'Finasteride 1 mg (10 tablets)',
    company: 'Cipla',
    type: 'Tablet',
    stockQuantity: 8,
    reorderLevel: 20,
    costPrice: 62.5,
    sellingPrice: 95,
    batchNo: 'FN1-2403',
    expiryDate: '2027-02-28',
    imageUrl: '/products/finasteride-tablets.svg',
  },
  {
    id: '8901234560035',
    name: 'Biotin + multivitamin capsules (30)',
    company: 'Sun Pharma',
    type: 'Capsule',
    stockQuantity: 60,
    reorderLevel: 20,
    costPrice: 310,
    sellingPrice: 425,
    batchNo: 'BTN-2311',
    expiryDate: '2026-11-15',
    imageUrl: '/products/biotin-capsules.svg',
  },
  {
    id: '8901234560042',
    name: 'Ketoconazole 2% anti-dandruff shampoo 100 ml',
    company: 'Glenmark',
    type: 'Shampoo',
    stockQuantity: 0,
    reorderLevel: 10,
    costPrice: 245,
    sellingPrice: 340,
    batchNo: 'KTZ-2402',
    expiryDate: '2027-09-30',
    imageUrl: '/products/ketoconazole-shampoo.svg',
  },
  {
    id: '8901234560059',
    name: 'Onion & rosemary hair oil 200 ml',
    company: 'Mamaearth',
    type: 'Oil',
    stockQuantity: 25,
    reorderLevel: 10,
    costPrice: 299,
    sellingPrice: 399,
    batchNo: 'ONR-2405',
    expiryDate: '2028-04-30',
    imageUrl: '/products/onion-hair-oil.svg',
  },
  {
    id: '8901234560066',
    name: 'Argan oil repair conditioner 200 ml',
    company: 'L’Oréal Professionnel',
    type: 'Conditioner',
    stockQuantity: 18,
    reorderLevel: 8,
    costPrice: 410,
    sellingPrice: 560,
    batchNo: 'ARG-2407',
    expiryDate: '2028-01-31',
    imageUrl: '/products/argan-conditioner.svg',
  },
  {
    id: '8901234560073',
    name: 'Peptide hair growth serum 30 ml',
    company: 'Minimalist',
    type: 'Serum',
    stockQuantity: 14,
    reorderLevel: 10,
    costPrice: 520,
    sellingPrice: 699,
    batchNo: 'PHS-2404',
    expiryDate: '2027-04-30',
    imageUrl: '/products/peptide-serum.svg',
  },
  {
    id: '8901234560080',
    name: 'Redensyl 3% scalp lotion 100 ml',
    company: 'Bioderma',
    type: 'Lotion',
    stockQuantity: 5,
    reorderLevel: 6,
    costPrice: 690,
    sellingPrice: 899,
    batchNo: 'RDS-2402',
    expiryDate: '2026-12-10',
    imageUrl: '/products/redensyl-lotion.svg',
  },
  {
    id: '8901234560097',
    name: 'Scalp repair cream 50 g',
    company: 'Himalaya',
    type: 'Cream',
    stockQuantity: 30,
    reorderLevel: 10,
    costPrice: 165,
    sellingPrice: 240,
    batchNo: 'SRC-2401',
    expiryDate: '2026-09-20',
    imageUrl: '/products/scalp-repair-cream.svg',
  },
  {
    id: '8901234560103',
    name: 'Adapalene 0.1% gel 15 g',
    company: 'Galderma',
    type: 'Gel',
    stockQuantity: 22,
    reorderLevel: 8,
    costPrice: 118.75,
    sellingPrice: 165,
    batchNo: 'ADP-2405',
    expiryDate: '2027-08-31',
    imageUrl: '/products/adapalene-gel.svg',
  },
  {
    id: '8901234560110',
    name: 'Hair growth root spray 100 ml',
    company: 'Kerastase',
    type: 'Spray',
    stockQuantity: 9,
    reorderLevel: 5,
    costPrice: 1450,
    sellingPrice: 1890,
    batchNo: 'HGS-2406',
    expiryDate: '2027-10-31',
    imageUrl: '/products/hair-growth-spray.svg',
  },
  {
    id: '8901234560127',
    name: 'Hair vitamin gummies (60)',
    company: 'Power Gummies',
    type: 'Supplement',
    stockQuantity: 36,
    reorderLevel: 12,
    costPrice: 540,
    sellingPrice: 799,
    batchNo: 'HVG-2408',
    expiryDate: '2027-03-31',
    imageUrl: '/products/hair-vitamin-gummies.svg',
  },
];

const doctor = { id: 'USR-1', name: 'Dr. Bhushan Patil' };

const demoHistories: SeedEntity<PatientHistory>[] = [
  {
    id: 'PT-1079',
    patientId: 'PT-1079',
    medical: {
      noKnownAllergies: false,
      allergies: [
        { substance: 'Sulfa drugs', reaction: 'Rash', severity: 'Mild' },
      ],
      conditions: [
        {
          name: 'Hypertension',
          status: 'Current',
          notes: 'Amlodipine 5 mg, well controlled',
        },
      ],
      medications: [
        { name: 'Amlodipine', dose: '5 mg daily', affectsBleeding: false },
        {
          name: 'Finasteride',
          dose: '1 mg daily',
          affectsBleeding: false,
          notes: 'Started after surgery to protect the crown',
        },
      ],
      surgeries: [{ procedure: 'Hernia repair', when: '2016' }],
      clearance: 'Received',
      clearanceNotes:
        'Fitness certificate from Dr. Rajesh Kulkarni (physician), 28 Aug 2025.',
      updatedBy: doctor,
      updatedAt: ist('2025-08-28T18:00:00'),
    },
    hair: {
      scale: 'Norwood',
      grade: 'IV',
      donor: {
        quality: 'Excellent',
        density: 86,
        laxity: 'Moderate',
        notes: 'Thick calibre, no miniaturisation in the safe donor zone.',
      },
      treatments: [
        {
          treatment: 'Minoxidil',
          period: '2021 – 2023',
          outcome: 'Held the crown, no frontal regrowth',
        },
        { treatment: 'PRP therapy', period: '3 sessions, 2024' },
      ],
      goals: {
        hairline: 'Mature, slightly irregular hairline at 8 cm above the brow',
        targetGrafts: 2800,
        densityNotes: 'Frontal third first; crown managed medically.',
        expectations:
          'Explained shock loss at 1 month and final result at 12 months.',
      },
      updatedBy: doctor,
      updatedAt: ist('2025-09-01T10:30:00'),
    },
  },
  {
    id: 'PT-1083',
    patientId: 'PT-1083',
    medical: {
      noKnownAllergies: false,
      allergies: [
        {
          substance: 'Penicillin',
          reaction: 'Skin rash',
          severity: 'Moderate',
        },
      ],
      conditions: [
        {
          name: 'Hypertension',
          status: 'Current',
          notes: 'Controlled on medication',
        },
      ],
      medications: [
        { name: 'Telmisartan', dose: '40 mg daily', affectsBleeding: false },
        {
          name: 'Aspirin',
          dose: '75 mg daily',
          affectsBleeding: true,
          notes: 'Stop 7 days before surgery if cardiologist agrees',
        },
      ],
      surgeries: [{ procedure: 'Appendectomy', when: '2012' }],
      clearance: 'Pending',
      clearanceNotes: 'Cardiologist clearance requested for aspirin pause.',
      updatedBy: doctor,
      updatedAt: ist('2026-09-18T11:20:00'),
    },
    hair: {
      scale: 'Norwood',
      grade: 'IV',
      donor: { quality: 'Good', density: 78, laxity: 'Moderate' },
      treatments: [
        {
          treatment: 'Minoxidil 5%',
          period: '2023 – 2024',
          outcome: 'Slowed loss, stopped due to scalp irritation',
        },
        {
          treatment: 'PRP therapy',
          period: '4 sessions, 2025',
          outcome: 'Mild improvement in crown',
        },
      ],
      goals: {
        hairline:
          'Natural, age-appropriate hairline with mild temporal recession',
        targetGrafts: 3200,
        densityNotes: 'Priority on frontal third; crown later if donor allows.',
      },
      updatedBy: doctor,
      updatedAt: ist('2026-09-18T11:25:00'),
    },
  },
  {
    id: 'PT-1084',
    patientId: 'PT-1084',
    medical: {
      noKnownAllergies: true,
      allergies: [],
      conditions: [
        { name: 'Thyroid disorder', status: 'Current', notes: 'Hypothyroid' },
      ],
      medications: [
        { name: 'Levothyroxine', dose: '50 mcg daily', affectsBleeding: false },
      ],
      surgeries: [],
      clearance: 'Not required',
      updatedBy: doctor,
      updatedAt: ist('2026-07-24T10:30:00'),
    },
    hair: {
      scale: 'Ludwig',
      grade: 'II',
      donor: { quality: 'Good', density: 82 },
      treatments: [
        {
          treatment: 'Biotin supplements',
          period: '6 months',
          outcome: 'No visible change',
        },
      ],
      goals: { expectations: 'Thicker parting line; no surgery for now.' },
      updatedBy: doctor,
      updatedAt: ist('2026-07-24T10:35:00'),
    },
  },
];

export const seedPatients = demo(demoPatients);
export const seedHistories = demo(demoHistories);

const demoPrescriptions: SeedEntity<Prescription>[] = [
  {
    id: 'RX-1',
    patientId: 'PT-1079',
    visit: 'FUE surgery — discharge',
    prescribedBy: 'Dr. Bhushan Patil',
    prescribedAt: ist('2025-09-08T18:30:00'),
    createdAt: ist('2025-09-08T18:30:00'),
    items: [
      {
        name: 'Cefuroxime 500 mg',
        dose: '1 tablet',
        frequency: 'Twice daily (BD)',
        durationDays: 5,
        instructions: 'After food',
        affectsBleeding: false,
      },
      {
        name: 'Prednisolone 20 mg',
        dose: '1 tablet',
        frequency: 'Once daily (OD)',
        durationDays: 3,
        instructions: 'Morning, after breakfast — for forehead swelling',
        affectsBleeding: false,
      },
      {
        name: 'Paracetamol 650 mg',
        dose: '1 tablet',
        frequency: 'As needed (SOS)',
        durationDays: 5,
        instructions: 'For pain; max 3 a day. Avoid ibuprofen and aspirin.',
        affectsBleeding: false,
      },
      {
        name: 'Saline spray',
        dose: '4–5 sprays',
        frequency: 'Every 2 hours',
        durationDays: 3,
        instructions: 'On the grafts while awake',
        affectsBleeding: false,
      },
    ],
    notes: 'Sleep at 45° for 3 nights. First wash at clinic on day 1.',
  },
  {
    id: 'RX-2',
    patientId: 'PT-1079',
    visit: '1-month review',
    prescribedBy: 'Dr. Bhushan Patil',
    prescribedAt: ist('2025-10-08T12:10:00'),
    createdAt: ist('2025-10-08T12:10:00'),
    items: [
      {
        name: 'Finasteride 1 mg',
        dose: '1 tablet',
        frequency: 'Once daily (OD)',
        instructions: 'Long term, to protect the crown and native hair',
        affectsBleeding: false,
      },
      {
        name: 'Minoxidil 5% solution',
        dose: '1 ml',
        frequency: 'Twice daily (BD)',
        durationDays: 180,
        instructions: 'Apply to the whole top of the scalp on dry hair',
        affectsBleeding: false,
      },
    ],
  },
  {
    id: 'RX-3',
    patientId: 'PT-1084',
    visit: 'PRP Session 1',
    prescribedBy: 'Dr. Sonal Desai',
    prescribedAt: ist('2026-07-24T11:00:00'),
    createdAt: ist('2026-07-24T11:00:00'),
    items: [
      {
        name: 'Minoxidil 2% solution',
        dose: '1 ml',
        frequency: 'Twice daily (BD)',
        durationDays: 180,
        instructions: 'Along the parting line; wash hands after',
        affectsBleeding: false,
      },
      {
        name: 'Biotin 10 mg',
        dose: '1 tablet',
        frequency: 'Once daily (OD)',
        durationDays: 60,
        affectsBleeding: false,
      },
      {
        name: 'Ketoconazole 2% anti-dandruff shampoo 100 ml',
        itemId: '8901234560042',
        dose: 'Lather 5 minutes',
        frequency: 'Twice a week',
        durationDays: 60,
        dispensed: 1,
        affectsBleeding: false,
      },
    ],
  },
];

export const seedPrescriptions = demo(demoPrescriptions);
export const seedAppointments = demo(demoAppointments);
export const seedTreatments = demo(demoTreatments);
export const seedInvoices = demo(demoInvoices);
export const seedPayments = demo(demoPayments);
export const seedInventory = () => seedInventoryItems;
