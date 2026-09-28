import { SeedEntity } from '../common/entity';
import { Appointment } from '../appointments/appointment.entity';
import { ConcernOption, TreatmentOption } from '../catalog/catalog.entity';
import { Invoice } from '../invoices/invoice.entity';
import { Payment } from '../invoices/payment.entity';
import { TreatmentPlan } from '../plans/plan.entity';
import { Lead } from '../leads/lead.entity';
import { Patient } from '../patients/patient.entity';
import { Treatment } from '../treatments/treatment.entity';
import { User } from '../users/user.entity';

// Mirrors the mock data the frontend prototype was designed with (Pune clinic, Sept 2026).
const ist = (local: string) => new Date(`${local}+05:30`).toISOString();

/**
 * Demo patients and their appointments, treatment records, invoices and payments load only
 * when SEED_DEMO_DATA=true (the e2e tests turn it on). Otherwise the clinic starts empty;
 * team logins, Settings (treatments, concerns, plans) and leads are always seeded.
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
    role: 'Admin',
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
    role: 'Reception',
    title: 'Reception',
    status: 'Active',
  },
  {
    id: 'USR-4',
    name: 'Ashwini Kale',
    email: 'ashwini@drbhushan.clinic',
    role: 'Reception',
    title: 'Reception',
    status: 'Invited',
  },
];

const demoPatients: SeedEntity<Patient>[] = [
  {
    id: 'PT-1084',
    createdAt: ist('2026-07-24T10:00:00'),
    name: 'Ananya Deshmukh',
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
    age: 45,
    phone: '+91 98221 90433',
    concern: 'Diffuse thinning',
    treatment: 'PRP · Session 5/6',
    lastVisit: '2026-09-15',
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
    type: 'Initial consultation',
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

export const seedPatients = demo(demoPatients);
export const seedAppointments = demo(demoAppointments);
export const seedTreatments = demo(demoTreatments);
export const seedInvoices = demo(demoInvoices);
export const seedPayments = demo(demoPayments);
