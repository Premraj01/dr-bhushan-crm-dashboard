import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('CRM API (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@drbhushan.clinic', password: 'test-password' })
      .expect(200);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = () => ({ Authorization: `Bearer ${token}` });

  it('rejects unauthenticated requests and bad credentials', async () => {
    await request(app.getHttpServer()).get('/api/patients').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@drbhushan.clinic', password: 'wrong-password' })
      .expect(401);
  });

  it.each([
    ['Admin', 'Dr. Bhushan Patil'],
    ['Doctor', 'Dr. Sonal Desai'],
    ['Reception', 'Priya More'],
  ])('demo login signs in as %s', async (role, name) => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/demo')
      .send({ role })
      .expect(200);
    expect(res.body.user).toMatchObject({ role, name });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .expect(200);
  });

  it('registers a patient with name parts, date of birth, contacts and emergency contact', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/patients')
      .set(authed())
      .send({
        firstName: 'Aarav',
        middleName: 'Sunil',
        lastName: 'Patil',
        dateOfBirth: '1990-01-15',
        gender: 'Male',
        phone: '+91 90111 22334',
        email: 'aarav@example.com',
        address: '12 FC Road, Pune 411004',
        emergencyContact: {
          name: 'Sunita Patil',
          relationship: 'Mother',
          phone: '+91 90111 22335',
        },
      })
      .expect(201);
    expect(res.body).toMatchObject({
      name: 'Aarav Sunil Patil',
      gender: 'Male',
      treatment: 'Consultation',
      emergencyContact: { relationship: 'Mother' },
    });
    expect(res.body.age).toBeGreaterThanOrEqual(36);

    const updated = await request(app.getHttpServer())
      .patch(`/api/patients/${res.body.id}`)
      .set(authed())
      .send({ lastName: 'Patil-Deshmukh' })
      .expect(200);
    expect(updated.body.name).toBe('Aarav Sunil Patil-Deshmukh');

    // Last name is required with a first name; bad gender, future birth date and
    // an incomplete emergency contact are refused.
    for (const body of [
      { firstName: 'Solo', phone: '+91 90111 22336' },
      { name: 'X', gender: 'Unknown', phone: '+91 90111 22337' },
      { name: 'X', dateOfBirth: '2999-01-01', phone: '+91 90111 22338' },
      {
        name: 'X',
        phone: '+91 90111 22339',
        emergencyContact: { name: 'Y' },
      },
    ]) {
      await request(app.getHttpServer())
        .post('/api/patients')
        .set(authed())
        .send(body)
        .expect(400);
    }
  });

  it('only lets admins delete records', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/demo')
      .send({ role: 'Reception' })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/leads/LD-301')
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .expect(403);
  });

  describe('inventory', () => {
    const product = {
      itemId: 'TEST-SKU-1',
      name: 'Peptide hair serum 30 ml',
      company: 'Test Labs',
      type: 'Serum',
      stockQuantity: 12,
      reorderLevel: 5,
      costPrice: 350.5,
      sellingPrice: 499.99,
      batchNo: 'PS-2409',
      expiryDate: '2027-09-30',
    };

    it('adds a product keyed by its SKU and rejects duplicates', async () => {
      const server = app.getHttpServer();
      const res = await request(server)
        .post('/api/inventory')
        .set(authed())
        .send(product)
        .expect(201);
      expect(res.body).toMatchObject({ id: 'TEST-SKU-1', costPrice: 350.5 });
      expect(res.body.itemId).toBeUndefined();
      await request(server)
        .post('/api/inventory')
        .set(authed())
        .send({ ...product, itemId: 'test-sku-1' })
        .expect(409);
      await request(server)
        .post('/api/inventory')
        .set(authed())
        .send({ ...product, itemId: 'bad sku/1', costPrice: 1.234 })
        .expect(400);
      const list = await request(server)
        .get('/api/inventory?type=Serum')
        .set(authed())
        .expect(200);
      const ids = (list.body as { id: string }[]).map((i) => i.id);
      expect(ids).toContain('TEST-SKU-1');
    });

    it('adjusts stock without letting it go negative', async () => {
      const server = app.getHttpServer();
      const res = await request(server)
        .post('/api/inventory/TEST-SKU-1/stock')
        .set(authed())
        .send({ change: -4 })
        .expect(200);
      expect(res.body.stockQuantity).toBe(8);
      await request(server)
        .post('/api/inventory/TEST-SKU-1/stock')
        .set(authed())
        .send({ change: -9 })
        .expect(400);
      await request(server)
        .patch('/api/inventory/TEST-SKU-1')
        .set(authed())
        .send({ sellingPrice: 520, imageUrl: null })
        .expect(200);
    });

    it('lets any role manage stock but only admins delete', async () => {
      const server = app.getHttpServer();
      const reception = (
        await request(server).post('/api/auth/demo').send({ role: 'Reception' })
      ).body.accessToken as string;
      const asReception = { Authorization: `Bearer ${reception}` };
      await request(server)
        .post('/api/inventory/TEST-SKU-1/stock')
        .set(asReception)
        .send({ change: 10 })
        .expect(200);
      await request(server)
        .delete('/api/inventory/TEST-SKU-1')
        .set(asReception)
        .expect(403);
      await request(server)
        .delete('/api/inventory/TEST-SKU-1')
        .set(authed())
        .expect(204);
    });
  });

  describe('settings catalog', () => {
    const demoToken = async (role: string) =>
      (await request(app.getHttpServer()).post('/api/auth/demo').send({ role }))
        .body.accessToken as string;

    it('lets admins add, edit and remove treatments and concerns', async () => {
      const server = app.getHttpServer();
      const created = await request(server)
        .post('/api/catalog/treatments')
        .set(authed())
        .send({
          name: 'Mesotherapy',
          category: 'PRP',
          price: 3500,
          duration: 40,
          durationUnit: 'minutes',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        id: expect.stringMatching(/^TO-/),
        active: true,
      });

      await request(server)
        .patch(`/api/catalog/treatments/${created.body.id}`)
        .set(authed())
        .send({ active: false })
        .expect(200);

      const concern = await request(server)
        .post('/api/catalog/concerns')
        .set(authed())
        .send({ name: 'Scalp psoriasis' })
        .expect(201);
      await request(server)
        .delete(`/api/catalog/concerns/${concern.body.id}`)
        .set(authed())
        .expect(204);
    });

    it('seeds the Norwood stages and alopecia areata with illustrations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/catalog/concerns')
        .set(authed())
        .expect(200);
      const illustrated = (
        res.body as { name: string; illustration?: string }[]
      )
        .filter((c) => c.illustration)
        .map((c) => c.name);
      expect(illustrated).toEqual(
        expect.arrayContaining([
          'Stage 1',
          'Stage 2',
          'Stage 3',
          'Stage 3 Vertex',
          'Stage 4',
          'Stage 5',
          'Stage 6',
          'Stage 7',
          'Alopecia areata',
        ]),
      );
      await request(app.getHttpServer())
        .post('/api/catalog/concerns')
        .set(authed())
        .send({ name: 'Stage 8', illustration: 'norwood-8' })
        .expect(400);
    });

    it('stores FUE as a 1–3 day range and validates ranges', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/catalog/treatments')
        .set(authed())
        .expect(200);
      expect(
        (list.body as { name: string }[]).find(
          (t) => t.name === 'FUE hair transplant',
        ),
      ).toMatchObject({ duration: 1, durationMax: 3, durationUnit: 'days' });

      await request(app.getHttpServer())
        .post('/api/catalog/treatments')
        .set(authed())
        .send({
          name: 'Bad range',
          category: 'PRP',
          price: 1,
          duration: 3,
          durationMax: 2,
          durationUnit: 'days',
        })
        .expect(400);
    });

    it('rejects duplicate names regardless of case', async () => {
      await request(app.getHttpServer())
        .post('/api/catalog/concerns')
        .set(authed())
        .send({ name: '  hair THINNING ' })
        .expect(409);
    });

    it('is read-only for doctors and receptionists', async () => {
      const token = await demoToken('Doctor');
      const res = await request(app.getHttpServer())
        .get('/api/catalog/treatments')
        .set({ Authorization: `Bearer ${token}` })
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      await request(app.getHttpServer())
        .post('/api/catalog/concerns')
        .set({ Authorization: `Bearer ${token}` })
        .send({ name: 'Dandruff' })
        .expect(403);
    });
  });

  it('marks a visit missed after its day passes, and keeps it editable', async () => {
    const booked = await request(app.getHttpServer())
      .post('/api/appointments')
      .set(authed())
      .send({
        patientId: 'PT-1083',
        type: 'Consultation',
        doctor: 'Dr. Bhushan Patil',
        startsAt: '2026-09-01T11:00:00+05:30',
      })
      .expect(201);
    const id = (booked.body as { id: string }).id;
    const statusOf = async () =>
      (
        (
          await request(app.getHttpServer())
            .get(`/api/appointments/${id}`)
            .set(authed())
            .expect(200)
        ).body as { status: string }
      ).status;
    const listed = await request(app.getHttpServer())
      .get('/api/appointments?status=Missed')
      .set(authed())
      .expect(200);
    expect((listed.body as { id: string }[]).map((a) => a.id)).toContain(id);
    expect(await statusOf()).toBe('Missed');

    // The patient did come after all: check in from Missed
    await request(app.getHttpServer())
      .post(`/api/appointments/${id}/check-in`)
      .set(authed())
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/appointments/${id}/check-in`)
      .set(authed())
      .expect(200);
    // Or reschedule: a missed visit moves to Rescheduled
    await request(app.getHttpServer())
      .patch(`/api/appointments/${id}`)
      .set(authed())
      .send({ startsAt: '2027-01-05T11:00:00+05:30' })
      .expect(200);
    expect(await statusOf()).toBe('Rescheduled');
  });

  describe('treatment plans and packages', () => {
    const PRP = 'TO-3';
    const FUE = 'TO-6';
    const ROLLER = 'TO-7';
    const CONSULT = 'TO-1';
    const days = (value: number) => ({ value, unit: 'days' });
    const create = (body: object, patientId: string, auth = authed()) =>
      request(app.getHttpServer())
        .post(`/api/patients/${patientId}/packages`)
        .set(auth)
        .send(body);
    type Step = {
      index: number;
      description: string;
      state: string;
      dueDate: string;
      windowStart: string;
      windowEnd: string;
      estimated: boolean;
      amount: number;
      complimentary: boolean;
      surgery: boolean;
      cycle?: { n: number; of: number };
      appointmentId?: string;
      date?: string;
    };
    type Pkg = {
      id: string;
      name: string;
      status: string;
      total: number;
      steps: Step[];
      lines: {
        description: string;
        quantity: number;
        amount: number;
        complimentary: boolean;
      }[];
      progress: { done: number; total: number };
      next: number | null;
      createdBy: { role: string };
    };
    type Apt = {
      id: string;
      startsAt: string;
      days?: number;
      durationMinutes: number;
      status: string;
      packageId?: string | null;
      packageStep?: number | null;
    };
    const demo = async (role: string) =>
      (await request(app.getHttpServer()).post('/api/auth/demo').send({ role }))
        .body.accessToken as string;
    let phone = 91000;
    const newPatient = async (name: string) =>
      (
        (
          await request(app.getHttpServer())
            .post('/api/patients')
            .set(authed())
            .send({ name, phone: `+91 90000 ${phone++}` })
            .expect(201)
        ).body as { id: string }
      ).id;
    const pkgOf = async (patientId: string, id: string) =>
      (
        (
          await request(app.getHttpServer())
            .get(`/api/patients/${patientId}/packages`)
            .set(authed())
            .expect(200)
        ).body as Pkg[]
      ).find((p) => p.id === id)!;
    const bookStep = (pkgId: string, index: number, body: object) =>
      request(app.getHttpServer())
        .post(`/api/packages/${pkgId}/sessions/${index}/appointment`)
        .set(authed())
        .send({ doctor: 'Dr. Bhushan Patil', ...body });
    const bookVisit = (patientId: string, type: string, startsAt: string) =>
      request(app.getHttpServer())
        .post('/api/appointments')
        .set(authed())
        .send({ patientId, type, doctor: 'Dr. Bhushan Patil', startsAt })
        .expect(201);
    const appointment = async (id: string) =>
      (
        await request(app.getHttpServer())
          .get(`/api/appointments/${id}`)
          .set(authed())
          .expect(200)
      ).body as Apt;
    const appointmentsOn = async (query: string) =>
      (
        await request(app.getHttpServer())
          .get(`/api/appointments?${query}`)
          .set(authed())
          .expect(200)
      ).body as Apt[];
    const checkInAndComplete = async (id: string) => {
      await request(app.getHttpServer())
        .post(`/api/appointments/${id}/check-in`)
        .set(authed())
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/appointments/${id}/complete`)
        .set(authed())
        .expect(200);
    };
    const today = () =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(),
      );
    const plus = (date: string, n: number) => {
      const t = new Date(`${date}T00:00:00Z`);
      t.setUTCDate(t.getUTCDate() + n);
      return t.toISOString().slice(0, 10);
    };

    it('seeds plans, and lets any role create one with repeat blocks', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/treatment-plans')
        .set(authed())
        .expect(200);
      expect((list.body as { name: string }[]).map((p) => p.name)).toEqual(
        expect.arrayContaining([
          'PRP with derma roller',
          'Hair transplant with PRP care',
        ]),
      );
      const reception = { Authorization: `Bearer ${await demo('Reception')}` };
      const plan = {
        name: 'Roller cycle',
        items: [
          {
            repeat: 2,
            steps: [
              { treatmentId: PRP, gap: days(7) },
              { treatmentId: ROLLER, gap: days(7) },
            ],
          },
        ],
      };
      const created = await request(app.getHttpServer())
        .post('/api/treatment-plans')
        .set(reception)
        .send(plan)
        .expect(201);
      expect(created.body).toMatchObject({
        name: 'Roller cycle',
        active: true,
      });
      // windowDays defaults to 2
      expect(created.body.items[0].steps[0]).toMatchObject({ windowDays: 2 });
      await request(app.getHttpServer())
        .post('/api/treatment-plans')
        .set(authed())
        .send({ ...plan, name: 'roller CYCLE' })
        .expect(409);
      await request(app.getHttpServer())
        .post('/api/treatment-plans')
        .set(authed())
        .send({ name: 'Bad', items: [{ treatmentId: 'TO-404' }] })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/treatment-plans')
        .set(authed())
        .send({
          name: 'Too long',
          items: [
            {
              repeat: 21,
              steps: [
                { treatmentId: PRP },
                { treatmentId: ROLLER },
                { treatmentId: ROLLER },
              ],
            },
          ],
        })
        .expect(400);
      const id = (created.body as { id: string }).id;
      await request(app.getHttpServer())
        .patch(`/api/treatment-plans/${id}`)
        .set(reception)
        .send({ description: 'Short course' })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/api/treatment-plans/${id}`)
        .set(reception)
        .expect(204);
    });

    it('prices a package per step; the doctor can change or waive any cost', async () => {
      const patientId = await newPatient('Pricing Test');
      const doctor = { Authorization: `Bearer ${await demo('Doctor')}` };
      const res = await create(
        {
          planId: 'TP-2',
          items: [
            { treatmentId: FUE, quantity: 2500, unitPrice: 25 },
            {
              repeat: 3,
              steps: [
                {
                  treatmentId: PRP,
                  gap: { value: 2, unit: 'months' },
                  complimentary: true,
                },
              ],
            },
            { treatmentId: ROLLER, gap: days(7), unitPrice: 0 },
            { treatmentId: CONSULT, gap: days(7) },
          ],
        },
        patientId,
        doctor,
      ).expect(201);
      const pkg = res.body as Pkg;
      expect(pkg).toMatchObject({
        name: 'Hair transplant with PRP care',
        status: 'Accepted',
        total: 2500 * 25 + 800,
        createdBy: { role: 'Doctor' },
        progress: { done: 0, total: 6 },
        next: 0,
      });
      expect(pkg.steps.map((s) => [s.description, s.amount])).toEqual([
        ['FUE hair transplant · 2,500 grafts', 62500],
        ['PRP session', 0],
        ['PRP session', 0],
        ['PRP session', 0],
        ['Derma roller', 0],
        ['Consultation', 800],
      ]);
      // Only treatments tagged surgical in Settings are surgery (booked via Pending bookings)
      expect(pkg.steps.map((s) => s.surgery)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(pkg.lines).toContainEqual(
        expect.objectContaining({
          description: 'PRP session · complimentary',
          quantity: 3,
          amount: 0,
        }),
      );
      const patient = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}`)
        .set(authed())
        .expect(200);
      expect(patient.body.treatment).toBe(
        'Package · Hair transplant with PRP care',
      );

      // Grafts must be set; an empty plan is refused
      await create({ items: [{ treatmentId: FUE }] }, patientId).expect(400);
      await create({ items: [] }, patientId).expect(400);
      // A quote prices without saving
      const quote = await request(app.getHttpServer())
        .post('/api/packages/quote')
        .set(authed())
        .send({
          items: [{ treatmentId: PRP }, { treatmentId: ROLLER, gap: days(7) }],
        })
        .expect(201);
      expect(quote.body).toMatchObject({ name: 'Custom plan', total: 6000 });
    });

    it('works out due dates from the previous procedure day, in repeat blocks', async () => {
      const patientId = await newPatient('Schedule Test');
      const plan = (
        await request(app.getHttpServer())
          .get('/api/treatment-plans')
          .set(authed())
          .expect(200)
      ).body as { id: string; items: object[] }[];
      const tp1 = plan.find((p) => p.id === 'TP-1')!;
      const res = await create(
        { planId: 'TP-1', items: tp1.items, startDate: '2027-01-04' },
        patientId,
      ).expect(201);
      const pkg = res.body as Pkg;
      expect(pkg.steps).toHaveLength(12);
      expect(
        pkg.steps.slice(0, 4).map((s) => [s.description, s.dueDate]),
      ).toEqual([
        ['PRP session', '2027-01-04'],
        ['Derma roller', '2027-01-11'],
        ['Derma roller', '2027-01-18'],
        ['PRP session', '2027-01-25'],
      ]);
      expect(pkg.steps[0]).toMatchObject({
        estimated: false,
        windowStart: '2027-01-02',
        windowEnd: '2027-01-06',
        cycle: { n: 1, of: 4 },
      });
      expect(pkg.steps[3]).toMatchObject({
        estimated: true,
        cycle: { n: 2, of: 4 },
      });

      // PRP booked two days late: the rollers move with it
      const booked = await bookStep(pkg.id, 0, {
        startsAt: '2027-01-06T10:00:00+05:30',
      }).expect(201);
      expect(
        (booked.body as Pkg).steps.slice(0, 3).map((s) => [s.state, s.dueDate]),
      ).toEqual([
        ['booked', '2027-01-04'],
        ['to-book', '2027-01-13'],
        ['to-book', '2027-01-20'],
      ]);
    });

    it('moves the rest of the plan to the day a visit was actually done, and reminds when due', async () => {
      const patientId = await newPatient('Reminder Test');
      const start = plus(today(), -10);
      const res = await create(
        {
          items: [
            { treatmentId: PRP },
            { treatmentId: ROLLER, gap: days(7), windowDays: 1 },
            { treatmentId: ROLLER, gap: days(7) },
          ],
          startDate: start,
        },
        patientId,
      ).expect(201);
      const pkgId = (res.body as Pkg).id;
      type Due = {
        packageId: string;
        stepIndex: number;
        dueDate: string;
        overdueDays: number;
        treatment: string;
        phone?: string;
      };
      const due = async () =>
        (
          (
            await request(app.getHttpServer())
              .get('/api/packages/due')
              .set(authed())
              .expect(200)
          ).body as Due[]
        ).filter((d) => d.packageId === pkgId);

      // First visit is overdue → reminded
      expect(await due()).toEqual([
        expect.objectContaining({
          stepIndex: 0,
          dueDate: start,
          overdueDays: 8,
          treatment: 'PRP session',
        }),
      ]);

      // The patient comes 3 days late (booked for that day, checked in from Missed, completed)
      const done = plus(start, 3);
      const booked = await bookStep(pkgId, 0, {
        startsAt: `${done}T10:00:00+05:30`,
      }).expect(201);
      const prp = (booked.body as Pkg).steps[0].appointmentId!;
      // Booked for a day already gone → Missed, so it's still on the reminder list
      expect(await due()).toEqual([
        expect.objectContaining({ stepIndex: 0, missed: true }),
      ]);
      await checkInAndComplete(prp);

      const after = await pkgOf(patientId, pkgId);
      expect(after.steps[1]).toMatchObject({
        dueDate: plus(done, 7),
        estimated: false,
        state: 'to-book',
      });
      expect(after.steps[2]).toMatchObject({
        dueDate: plus(done, 14),
        estimated: true,
      });
      expect(await due()).toEqual([
        expect.objectContaining({
          stepIndex: 1,
          dueDate: plus(done, 7),
          treatment: 'Derma roller',
        }),
      ]);

      // A plain booking of the same treatment takes that step
      const roller = (
        await bookVisit(
          patientId,
          'Derma roller',
          `${plus(today(), 2)}T11:00:00+05:30`,
        )
      ).body as Apt;
      expect(roller).toMatchObject({ packageId: pkgId, packageStep: 1 });
      expect(await due()).toEqual([]);
      // Unrelated treatments don't link
      const consult = (
        await bookVisit(
          patientId,
          'Consultation',
          `${plus(today(), 2)}T12:00:00+05:30`,
        )
      ).body as Apt;
      expect(consult.packageId).toBeUndefined();
    });

    it('books a surgery over 1–3 days, blocking the theatre but not OPD', async () => {
      const a = await newPatient('Surgery A');
      const b = await newPatient('Surgery B');
      const first = await create(
        {
          items: [
            { treatmentId: FUE, quantity: 2200 },
            { treatmentId: PRP, gap: { value: 2, unit: 'months' } },
          ],
        },
        a,
      ).expect(201);
      const firstId = (first.body as Pkg).id;
      const booked = await bookStep(firstId, 0, {
        startsAt: '2027-05-10T09:00:00+05:30',
        days: 3,
      }).expect(201);
      const surgery = (booked.body as Pkg).steps[0];
      for (const day of ['2027-05-10', '2027-05-11', '2027-05-12']) {
        const onDay = (await appointmentsOn(`date=${day}`)).filter(
          (x) => x.id === surgery.appointmentId,
        );
        expect(onDay).toEqual([
          expect.objectContaining({ days: 3, durationMinutes: 480 }),
        ]);
      }
      // The PRP after it is due 2 months after the LAST surgery day
      expect((booked.body as Pkg).steps[1].dueDate).toBe('2027-07-12');
      await bookStep(firstId, 0, {
        startsAt: '2027-06-01T09:00:00+05:30',
      }).expect(409);
      await bookStep(firstId, 9, {
        startsAt: '2027-06-01T09:00:00+05:30',
      }).expect(400);

      const second = await create(
        { items: [{ treatmentId: FUE, quantity: 2000 }] },
        b,
      ).expect(201);
      const secondId = (second.body as Pkg).id;
      const clash = await bookStep(secondId, 0, {
        startsAt: '2027-05-11T09:00:00+05:30',
        days: 1,
      }).expect(409);
      expect((clash.body as { message: string }).message).toContain(
        '2027-05-11',
      );
      await bookStep(secondId, 0, {
        startsAt: '2027-05-20T09:00:00+05:30',
        days: 4,
      }).expect(400);
      // OPD on a surgery day is fine
      await bookVisit(b, 'Consultation', '2027-05-11T12:00:00+05:30');
      await bookStep(secondId, 0, {
        startsAt: '2027-05-13T09:00:00+05:30',
        days: 1,
      }).expect(201);
    });

    it('queues surgeries waiting for a slot — including missed ones', async () => {
      type Pending = {
        packageId: string;
        stepIndex: number;
        surgery: string;
        missed: boolean;
      };
      const queue = async () =>
        (
          await request(app.getHttpServer())
            .get('/api/packages/pending')
            .set(authed())
            .expect(200)
        ).body as Pending[];
      const patientId = await newPatient('Queue Test');
      const prpOnly = await create(
        { items: [{ treatmentId: PRP }] },
        patientId,
      ).expect(201);
      const surgery = await create(
        {
          items: [
            { treatmentId: PRP },
            { treatmentId: FUE, quantity: 1900, gap: days(30) },
          ],
        },
        patientId,
      ).expect(201);
      const prpId = (prpOnly.body as Pkg).id;
      const surgeryId = (surgery.body as Pkg).id;

      let q = await queue();
      expect(q.some((p) => p.packageId === prpId)).toBe(false);
      expect(q.find((p) => p.packageId === surgeryId)).toMatchObject({
        stepIndex: 1,
        surgery: 'FUE hair transplant · 1,900 grafts',
        missed: false,
      });

      // Booked for a day that has already passed → Missed → back in the queue, first
      const booked = await bookStep(surgeryId, 1, {
        startsAt: '2026-09-14T09:00:00+05:30',
        days: 1,
      }).expect(201);
      const surgeryAppt = (booked.body as Pkg).steps[1].appointmentId!;
      q = await queue();
      expect(q[0]).toMatchObject({ packageId: surgeryId, missed: true });
      expect((await appointment(surgeryAppt)).status).toBe('Missed');

      // Re-booking the missed surgery reschedules the same appointment
      const rebooked = await bookStep(surgeryId, 1, {
        startsAt: '2027-09-20T09:00:00+05:30',
        days: 1,
      }).expect(201);
      expect((rebooked.body as Pkg).steps[1]).toMatchObject({
        appointmentId: surgeryAppt,
        date: '2027-09-20',
        state: 'booked',
      });
      expect((await appointment(surgeryAppt)).status).toBe('Rescheduled');
      expect((await queue()).some((p) => p.packageId === surgeryId)).toBe(
        false,
      );
    });

    it('completes the package once every step is done', async () => {
      const patientId = await newPatient('Complete Test');
      const res = await create(
        {
          items: [
            { treatmentId: ROLLER },
            { treatmentId: ROLLER, gap: days(0) },
          ],
        },
        patientId,
      ).expect(201);
      const pkgId = (res.body as Pkg).id;
      const time = (t: string) => `${today()}T${t}:00+05:30`;
      const first = (await bookVisit(patientId, 'Derma roller', time('07:00')))
        .body as Apt;
      const second = (await bookVisit(patientId, 'derma ROLLER', time('07:30')))
        .body as Apt;
      expect([first.packageStep, second.packageStep]).toEqual([0, 1]);
      await checkInAndComplete(first.id);
      expect((await pkgOf(patientId, pkgId)).status).toBe('Accepted');
      await checkInAndComplete(second.id);
      expect(await pkgOf(patientId, pkgId)).toMatchObject({
        status: 'Completed',
        progress: { done: 2, total: 2 },
        next: null,
      });
    });

    it('reopens the package when a completed visit is revoked', async () => {
      const patientId = await newPatient('Reopen Test');
      const res = await create(
        { items: [{ treatmentId: ROLLER }] },
        patientId,
      ).expect(201);
      const pkgId = (res.body as Pkg).id;
      const visit = (
        await bookVisit(patientId, 'Derma roller', `${today()}T07:00:00+05:30`)
      ).body as Apt;
      await checkInAndComplete(visit.id);
      expect((await pkgOf(patientId, pkgId)).status).toBe('Completed');

      const reopened = (
        await request(app.getHttpServer())
          .delete(`/api/appointments/${visit.id}/complete`)
          .set(authed())
          .expect(200)
      ).body as Apt & { completedAt?: string | null };
      expect(reopened.status).toBe('Checked in');
      expect(reopened.completedAt).toBeNull();
      expect(await pkgOf(patientId, pkgId)).toMatchObject({
        status: 'Accepted',
        progress: { done: 0, total: 1 },
      });
      // Only a completed visit can be revoked.
      await request(app.getHttpServer())
        .delete(`/api/appointments/${visit.id}/complete`)
        .set(authed())
        .expect(400);
    });

    it('updates the graft count once the surgery has started, repricing its bill', async () => {
      const patientId = await newPatient('Graft Test');
      const res = await create(
        { items: [{ treatmentId: FUE, quantity: 2000 }] },
        patientId,
      ).expect(201);
      const pkgId = (res.body as Pkg).id;
      const setGrafts = (grafts: number) =>
        request(app.getHttpServer())
          .patch(`/api/packages/${pkgId}/sessions/0/grafts`)
          .set(authed())
          .send({ grafts });
      // The 1st of this month: the patient can be checked in (the visit shows as Missed
      // until then), and the dashboard counts it as this month's surgery.
      await bookStep(pkgId, 0, {
        startsAt: `${today().slice(0, 7)}-01T09:00:00+05:30`,
        days: 1,
      }).expect(201);
      await setGrafts(2400).expect(400); // not checked in yet
      const aptId = (await pkgOf(patientId, pkgId)).steps[0].appointmentId!;
      await request(app.getHttpServer())
        .post(`/api/appointments/${aptId}/check-in`)
        .set(authed())
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/appointments/${aptId}/payments`)
        .set(authed())
        .send({ amount: 10_000, method: 'Cash' })
        .expect(201);

      const pkg = (await setGrafts(2400).expect(200)).body as Pkg;
      expect(pkg.total).toBe(48_000);
      expect(pkg.steps[0]).toMatchObject({
        description: 'FUE hair transplant · 2,400 grafts',
        amount: 48_000,
      });
      expect(pkg.lines).toEqual([
        expect.objectContaining({ quantity: 2400, amount: 48_000 }),
      ]);
      const apt = (await appointment(aptId)) as Apt & { type: string };
      expect(apt.type).toBe('FUE hair transplant · 2,400 grafts');
      const bill = (
        await request(app.getHttpServer())
          .get(`/api/appointments/${aptId}/billing`)
          .set(authed())
          .expect(200)
      ).body as {
        total: number;
        paid: number;
        balance: number;
        status: string;
      };
      expect(bill).toMatchObject({
        total: 48_000,
        paid: 10_000,
        balance: 38_000,
        status: 'Partially paid',
      });

      // Can't go below what's already been received (400 grafts = ₹8,000).
      await setGrafts(400).expect(400);
      await setGrafts(10_001).expect(400);

      // Dashboard: this month's completed surgeries, with grafts only from the count
      // entered after surgery — never the package's 2,000-graft estimate.
      type Grafts = {
        surgeries: number;
        awaitingCount: number;
        total: number;
        average: number;
      };
      const grafts = async () =>
        (
          (
            await request(app.getHttpServer())
              .get('/api/dashboard/summary')
              .set(authed())
              .expect(200)
          ).body as { grafts: Grafts }
        ).grafts;
      const before = await grafts();
      await request(app.getHttpServer())
        .post(`/api/appointments/${aptId}/complete`)
        .set(authed())
        .expect(200);
      const after = await grafts();
      expect(after).toMatchObject({
        surgeries: before.surgeries + 1,
        awaitingCount: before.awaitingCount,
        total: before.total + 2400,
      });

      // A completed surgery without a post-surgery count isn't counted as grafts.
      const other = await newPatient('Graft Estimate Test');
      const estimate = (
        (
          await create(
            { items: [{ treatmentId: FUE, quantity: 3000 }] },
            other,
          ).expect(201)
        ).body as Pkg
      ).id;
      await bookStep(estimate, 0, {
        startsAt: `${today().slice(0, 7)}-02T09:00:00+05:30`,
        days: 1,
      }).expect(201);
      await checkInAndComplete(
        (await pkgOf(other, estimate)).steps[0].appointmentId!,
      );
      expect(await grafts()).toMatchObject({
        surgeries: after.surgeries + 1,
        awaitingCount: after.awaitingCount + 1,
        total: after.total,
        average: after.average,
      });
    });

    it('removes the package’s visits still to come when it is cancelled', async () => {
      const patientId = await newPatient('Cancel Test');
      const res = await create(
        {
          items: [
            { treatmentId: FUE, quantity: 1600 },
            { treatmentId: PRP, gap: days(60) },
          ],
        },
        patientId,
      ).expect(201);
      const pkgId = (res.body as Pkg).id;
      await bookStep(pkgId, 0, {
        startsAt: '2027-10-20T10:00:00+05:30',
        days: 1,
      }).expect(201);
      const prp = (
        await bookVisit(patientId, 'PRP session', '2027-12-20T10:00:00+05:30')
      ).body as Apt;
      expect(prp).toMatchObject({ packageId: pkgId, packageStep: 1 });
      expect(
        (await appointmentsOn(`patientId=${patientId}`)).filter(
          (x) => x.packageId === pkgId,
        ),
      ).toHaveLength(2);
      for (const status of ['Accepted', 'Proposed']) {
        await request(app.getHttpServer())
          .patch(`/api/packages/${pkgId}`)
          .set(authed())
          .send({ status })
          .expect(400);
      }
      await request(app.getHttpServer())
        .patch(`/api/packages/${pkgId}`)
        .set(authed())
        .send({ status: 'Cancelled' })
        .expect(200);
      expect(
        (await appointmentsOn(`patientId=${patientId}`)).filter(
          (x) => x.packageId === pkgId,
        ),
      ).toHaveLength(0);
      await bookStep(pkgId, 0, {
        startsAt: '2027-11-20T10:00:00+05:30',
      }).expect(400);
    });
  });

  describe('booking appointments', () => {
    const book = (body: object) =>
      request(app.getHttpServer())
        .post('/api/appointments')
        .set(authed())
        .send(body);
    const slot = {
      type: 'Consultation',
      doctor: 'Dr. Bhushan Patil',
      startsAt: '2026-10-05T10:00:00+05:30',
    };

    it('books an existing patient', async () => {
      const res = await book({ ...slot, patientId: 'PT-1082' }).expect(201);
      expect(res.body).toMatchObject({
        patientId: 'PT-1082',
        patientName: 'Meera Shah',
      });
    });

    it('registers a new patient with just name and phone', async () => {
      const res = await book({
        ...slot,
        newPatient: { name: 'Karan Joshi', phone: '+91 90110 22334' },
      }).expect(201);
      const patientId = (res.body as { patientId: string }).patientId;
      expect(patientId).toMatch(/^PT-/);
      const patient = await request(app.getHttpServer())
        .get(`/api/patients/${patientId}`)
        .set(authed())
        .expect(200);
      expect(patient.body).toMatchObject({
        name: 'Karan Joshi',
        phone: '+91 90110 22334',
      });
      expect(patient.body).not.toHaveProperty('lastVisit');
    });

    it('refuses a duplicate phone number however it is written', async () => {
      const before = (
        await request(app.getHttpServer())
          .get('/api/appointments')
          .set(authed())
      ).body as unknown[];
      const res = await book({
        ...slot,
        newPatient: { name: 'A. Deshmukh', phone: '9823078142' },
      }).expect(409);
      expect((res.body as { message: string }).message).toContain(
        'Ananya Deshmukh (PT-1084)',
      );
      const after = (
        await request(app.getHttpServer())
          .get('/api/appointments')
          .set(authed())
      ).body as unknown[];
      expect(after).toHaveLength(before.length);
    });

    it('edits an appointment: reschedule, change doctor and patient', async () => {
      const created = await book({ ...slot, patientId: 'PT-1082' }).expect(201);
      const id = (created.body as { id: string }).id;
      const res = await request(app.getHttpServer())
        .patch(`/api/appointments/${id}`)
        .set(authed())
        .send({
          startsAt: '2026-10-07T15:00:00+05:30',
          doctor: 'Dr. Sonal Desai',
          patientId: 'PT-1080',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        startsAt: '2026-10-07T09:30:00.000Z',
        doctor: 'Dr. Sonal Desai',
        status: 'Rescheduled', // moved to another date/time
        patientId: 'PT-1080',
        patientName: 'Kavita Rao',
      });
    });

    it('moves a rescheduled surgery in the package, and keeps its patient', async () => {
      const pkg = await request(app.getHttpServer())
        .post('/api/patients/PT-1084/packages')
        .set(authed())
        .send({ items: [{ treatmentId: 'TO-6', quantity: 1700 }] })
        .expect(201);
      const pkgId = (pkg.body as { id: string }).id;
      const booked = await request(app.getHttpServer())
        .post(`/api/packages/${pkgId}/sessions/0/appointment`)
        .set(authed())
        .send({
          startsAt: '2027-12-01T10:00:00+05:30',
          doctor: 'Dr. Bhushan Patil',
          days: 1,
        })
        .expect(201);
      const surgery = (booked.body as { steps: { appointmentId?: string }[] })
        .steps[0].appointmentId!;
      await request(app.getHttpServer())
        .patch(`/api/appointments/${surgery}`)
        .set(authed())
        .send({ startsAt: '2027-12-15T10:00:00+05:30' })
        .expect(200);
      const after = await request(app.getHttpServer())
        .get('/api/patients/PT-1084/packages')
        .set(authed())
        .expect(200);
      const updated = (
        after.body as { id: string; steps: { date?: string }[] }[]
      ).find((p) => p.id === pkgId)!;
      expect(updated.steps.map((s) => s.date)).toEqual(['2027-12-15']);
      await request(app.getHttpServer())
        .patch(`/api/appointments/${surgery}`)
        .set(authed())
        .send({ patientId: 'PT-1082' })
        .expect(400);
    });

    it('moves through Scheduled → Rescheduled → Checked in → Completed', async () => {
      const call = (
        method: 'post' | 'delete' | 'patch',
        path: string,
        body?: object,
      ) =>
        request(app.getHttpServer())
          [method](`/api/appointments/${path}`)
          .set(authed())
          .send(body);
      type Apt = { status: string };

      // Booked for tomorrow: Scheduled, and can't be checked in yet
      const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString();
      const created = await book({
        ...slot,
        patientId: 'PT-1081',
        startsAt: tomorrow,
      }).expect(201);
      const id = (created.body as { id: string }).id;
      expect((created.body as Apt).status).toBe('Scheduled');
      await call('post', `${id}/check-in`).expect(400);

      // Status can't be set by hand any more
      await call('patch', id, { status: 'Completed' }).expect(400);
      await call('post', `${id}/complete`).expect(400); // not checked in

      // Patient asks to move it to today → Rescheduled, then arrives → Checked in
      const nowIso = new Date().toISOString();
      expect(
        (
          (await call('patch', id, { startsAt: nowIso }).expect(200))
            .body as Apt
        ).status,
      ).toBe('Rescheduled');
      expect(
        ((await call('post', `${id}/check-in`).expect(200)).body as Apt).status,
      ).toBe('Checked in');
      const patient = await request(app.getHttpServer())
        .get('/api/patients/PT-1081')
        .set(authed())
        .expect(200);
      expect((patient.body as { lastVisit: string }).lastVisit).toBe(
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
          new Date(),
        ),
      );

      // Undo a mistaken check-in → back to Rescheduled; check in again; can't reschedule once checked in
      expect(
        ((await call('delete', `${id}/check-in`).expect(200)).body as Apt)
          .status,
      ).toBe('Rescheduled');
      await call('post', `${id}/check-in`).expect(200);
      await call('patch', id, { startsAt: tomorrow }).expect(400);

      // Visit done
      expect(
        ((await call('post', `${id}/complete`).expect(200)).body as Apt).status,
      ).toBe('Completed');
      await call('post', `${id}/complete`).expect(400);
      // Completed visits can't be edited any more
      await call('patch', id, { notes: 'Changed afterwards' }).expect(400);
      await call('patch', id, { doctor: 'Dr. Sonal Desai' }).expect(400);
      await call('post', `${id}/check-in`).expect(400);
    });

    it('marks a completed, unpaid visit as payment pending', async () => {
      const call = (method: 'get' | 'post' | 'delete', path: string) =>
        request(app.getHttpServer())[method](`/api/${path}`).set(authed());
      type Apt = { id: string; billStatus?: string | null };
      type Bill = { status: string; balance: number; invoiceId?: string };
      type Overview = { pending: { invoiceId: string; amount: number }[] };
      type Summary = {
        revenue: { unpaidVisits: { count: number; amount: number } };
      };
      const unpaid = async () =>
        ((await call('get', 'dashboard/summary').expect(200)).body as Summary)
          .revenue.unpaidVisits;

      const id = (
        (
          await book({
            ...slot,
            patientId: 'PT-1081',
            startsAt: new Date().toISOString(),
          }).expect(201)
        ).body as Apt
      ).id;
      await call('post', `appointments/${id}/check-in`).expect(200);
      const before = await unpaid();

      // Completing the ₹800 consultation opens its bill as Pending
      const done = (
        await call('post', `appointments/${id}/complete`).expect(200)
      ).body as Apt;
      expect(done.billStatus).toBe('Pending');
      const bill = (await call('get', `appointments/${id}/billing`).expect(200))
        .body as Bill;
      expect(bill).toMatchObject({ status: 'Pending', balance: 800 });
      const overview = (await call('get', 'billing/overview').expect(200))
        .body as Overview;
      expect(overview.pending).toContainEqual(
        expect.objectContaining({ invoiceId: bill.invoiceId, amount: 800 }),
      );
      expect(await unpaid()).toEqual({
        count: before.count + 1,
        amount: before.amount + 800,
      });

      // Undoing completion drops the untouched bill
      const reopened = (
        await call('delete', `appointments/${id}/complete`).expect(200)
      ).body as Apt;
      expect(reopened.billStatus ?? null).toBeNull();
      expect(
        (
          (await call('get', `appointments/${id}/billing`).expect(200))
            .body as Bill
        ).status,
      ).toBe('Not billed');

      // Complete again and pay in full → Paid, no longer pending
      await call('post', `appointments/${id}/complete`).expect(200);
      await request(app.getHttpServer())
        .post(`/api/appointments/${id}/payments`)
        .set(authed())
        .send({ amount: 800, method: 'Cash' })
        .expect(201);
      const list = (
        await call('get', `appointments?patientId=PT-1081`).expect(200)
      ).body as Apt[];
      expect(list.find((a) => a.id === id)?.billStatus).toBe('Paid');
      expect(await unpaid()).toEqual(before);
    });

    it('rejects patientId and newPatient together', async () => {
      await book({
        ...slot,
        patientId: 'PT-1082',
        newPatient: { name: 'X', phone: '+91 90000 00001' },
      }).expect(400);
    });
  });

  describe('billing from the calendar', () => {
    type Bill = {
      source: string;
      total: number;
      paid: number;
      balance: number;
      status: string;
      needsCharge: boolean;
      packageId?: string;
      payments: {
        amount: number;
        method: string;
        reference?: string;
        receivedBy: { name: string };
      }[];
    };
    const billOf = async (id: string) =>
      (
        await request(app.getHttpServer())
          .get(`/api/appointments/${id}/billing`)
          .set(authed())
          .expect(200)
      ).body as Bill;
    const pay = (id: string, body: object, auth = authed()) =>
      request(app.getHttpServer())
        .post(`/api/appointments/${id}/payments`)
        .set(auth)
        .send(body);
    const visit = async (type: string, patientId = 'PT-1082') =>
      (
        (
          await request(app.getHttpServer())
            .post('/api/appointments')
            .set(authed())
            .send({
              patientId,
              type,
              doctor: 'Dr. Bhushan Patil',
              startsAt: '2026-11-03T10:00:00+05:30',
            })
            .expect(201)
        ).body as { id: string }
      ).id;

    it('bills a visit at the Settings price and takes part payments until paid', async () => {
      const id = await visit('Consultation');
      expect(await billOf(id)).toMatchObject({
        source: 'visit',
        total: 800,
        paid: 0,
        balance: 800,
        status: 'Not billed',
        needsCharge: false,
      });

      const reception = (
        await request(app.getHttpServer())
          .post('/api/auth/demo')
          .send({ role: 'Reception' })
      ).body.accessToken as string;
      const part = await pay(
        id,
        { amount: 300, method: 'UPI', reference: 'UPI-8841' },
        { Authorization: `Bearer ${reception}` },
      ).expect(201);
      expect(part.body).toMatchObject({
        paid: 300,
        balance: 500,
        status: 'Partially paid',
      });
      expect((part.body as Bill).payments[0]).toMatchObject({
        amount: 300,
        method: 'UPI',
        reference: 'UPI-8841',
        receivedBy: { name: 'Priya More' },
      });

      await pay(id, { amount: 600, method: 'Cash' }).expect(400); // more than the balance
      await pay(id, { amount: 500, method: 'Other' }).expect(400); // unknown method
      const done = await pay(id, { amount: 500, method: 'Cash' }).expect(201);
      expect(done.body).toMatchObject({
        paid: 800,
        balance: 0,
        status: 'Paid',
      });
      await pay(id, { amount: 1, method: 'Cash' }).expect(400); // already paid
    });

    it('matches "PRP Session 3" to the PRP price, and asks for a charge when the price is unknown', async () => {
      const prp = await visit('PRP Session 3');
      expect((await billOf(prp)).total).toBe(4500);

      const review = await visit('Post-op review');
      expect(await billOf(review)).toMatchObject({
        total: 0,
        needsCharge: true,
      });
      await pay(review, { amount: 1500, method: 'Card' }).expect(400);
      const paid = await pay(review, {
        amount: 1500,
        method: 'Card',
        charge: 1500,
      }).expect(201);
      expect(paid.body).toMatchObject({
        total: 1500,
        status: 'Paid',
        needsCharge: false,
      });
    });

    it('splits a balance into EMIs and applies payments to them in order', async () => {
      type Inst = {
        number: number;
        dueDate: string;
        amount: number;
        paid: number;
        status: string;
      };
      type EmiBill = Bill & { plan: string; installments: Inst[] };
      const setEmi = (id: string, body: object) =>
        request(app.getHttpServer())
          .put(`/api/appointments/${id}/billing/emi`)
          .set(authed())
          .send(body);

      const pkg = await request(app.getHttpServer())
        .post('/api/patients/PT-1083/packages')
        .set(authed())
        .send({
          items: [
            { treatmentId: 'TO-6', quantity: 2000 },
            { treatmentId: 'TO-3', gap: { value: 2, unit: 'months' } },
          ],
        })
        .expect(201);
      const pkgId = (pkg.body as { id: string }).id;
      const booked = await request(app.getHttpServer())
        .post(`/api/packages/${pkgId}/sessions/0/appointment`)
        .set(authed())
        .send({
          startsAt: '2027-11-02T09:00:00+05:30',
          doctor: 'Dr. Bhushan Patil',
          days: 1,
        })
        .expect(201);
      const surgery = (booked.body as { steps: { appointmentId?: string }[] })
        .steps[0].appointmentId!;

      // Surgery bill ₹40,000 (2,000 grafts × ₹20): ₹10,000 down, then 3 EMIs of ₹10,000
      await pay(surgery, { amount: 10000, method: 'Cash' }).expect(201);
      const dates = ['2027-01-05', '2027-02-05', '2027-03-05'];
      const plan = (amounts: number[], dueDates = dates) => ({
        installments: amounts.map((amount, i) => ({
          amount,
          dueDate: dueDates[i],
        })),
      });
      await setEmi(surgery, plan([10000, 10000, 9000])).expect(400); // doesn't add up
      await setEmi(
        surgery,
        plan([10000, 10000, 10000], ['2027-02-05', '2027-01-05', '2027-03-05']),
      ).expect(400); // out of order
      await setEmi(
        surgery,
        plan([10000, 10000, 10000], ['2020-01-05', '2027-01-05', '2027-03-05']),
      ).expect(400); // past
      await setEmi(surgery, plan([30000])).expect(400); // needs at least 2
      const emi = (
        await setEmi(surgery, plan([10000, 10000, 10000])).expect(200)
      ).body as EmiBill;
      expect(emi.plan).toBe('emi');
      expect(
        emi.installments.map((i) => `${i.dueDate} ${i.amount} ${i.status}`),
      ).toEqual([
        '2027-01-05 10000 Due',
        '2027-02-05 10000 Upcoming',
        '2027-03-05 10000 Upcoming',
      ]);

      // ₹15,000 clears EMI 1 and part-pays EMI 2
      const after = (
        await pay(surgery, { amount: 15000, method: 'UPI' }).expect(201)
      ).body as EmiBill;
      expect(after.installments.map((i) => `${i.paid} ${i.status}`)).toEqual([
        '10000 Paid',
        '5000 Part paid',
        '0 Upcoming',
      ]);
      expect(after).toMatchObject({
        paid: 25000,
        balance: 15000,
        status: 'Partially paid',
      });

      // Re-plan what's left (₹15,000) as 2 EMIs, then go back to a single payment
      const replanned = (
        await setEmi(
          surgery,
          plan([7500, 7500], ['2027-04-05', '2027-05-05']),
        ).expect(200)
      ).body as EmiBill;
      expect(
        replanned.installments.map((i) => `${i.amount} ${i.paid} ${i.status}`),
      ).toEqual(['7500 0 Due', '7500 0 Upcoming']);
      const cleared = (
        await request(app.getHttpServer())
          .delete(`/api/appointments/${surgery}/billing/emi`)
          .set(authed())
          .expect(200)
      ).body as EmiBill;
      expect(cleared).toMatchObject({
        plan: 'full',
        installments: [],
        balance: 15000,
      });
    });

    it('asks for the charge before planning EMIs on an unpriced visit', async () => {
      const id = await visit('Post-op review', 'PT-1081');
      const body = {
        installments: [
          { dueDate: '2027-06-01', amount: 1000 },
          { dueDate: '2027-07-01', amount: 1000 },
        ],
      };
      await request(app.getHttpServer())
        .put(`/api/appointments/${id}/billing/emi`)
        .set(authed())
        .send(body)
        .expect(400);
      const ok = await request(app.getHttpServer())
        .put(`/api/appointments/${id}/billing/emi`)
        .set(authed())
        .send({ ...body, charge: 2000 })
        .expect(200);
      expect(ok.body).toMatchObject({
        total: 2000,
        plan: 'emi',
        status: 'Pending',
      });
    });

    it('gives the Billing page received, pending and upcoming payments', async () => {
      type Item = {
        invoiceId: string;
        amount: number;
        overdueDays: number;
        kind: string;
        emiNumber?: number;
        dueDate: string;
      };
      type Overview = {
        metrics: Record<string, number>;
        received: {
          invoiceId: string;
          amount: number;
          method: string;
          description: string;
          receivedAt: string;
        }[];
        pending: Item[];
        upcoming: Item[];
      };
      const overview = async () =>
        (
          await request(app.getHttpServer())
            .get('/api/billing/overview')
            .set(authed())
            .expect(200)
        ).body as Overview;

      let o = await overview();
      // Seeded: payments behind the paid invoices, and the unpaid ones as pending (INV-26087 overdue)
      expect(o.received.find((p) => p.invoiceId === 'INV-26091')).toMatchObject(
        { amount: 105000, method: 'Bank transfer' },
      );
      expect(o.pending.find((p) => p.invoiceId === 'INV-26089')).toMatchObject({
        amount: 800,
        kind: 'bill',
        overdueDays: 0,
      });
      expect(
        o.pending.find((p) => p.invoiceId === 'INV-26087')!.overdueDays,
      ).toBeGreaterThan(0);

      // Pay part of a seeded invoice from the Billing page (by invoice), then put the rest on EMIs
      const paid = await request(app.getHttpServer())
        .post('/api/invoices/INV-26087/payments')
        .set(authed())
        .send({ amount: 200, method: 'Cash' })
        .expect(201);
      expect(paid.body).toMatchObject({
        invoiceId: 'INV-26087',
        status: 'Partially paid',
        balance: 1000,
      });
      await request(app.getHttpServer())
        .put('/api/invoices/INV-26087/billing/emi')
        .set(authed())
        .send({
          installments: [
            { dueDate: '2027-01-10', amount: 500 },
            { dueDate: '2027-02-10', amount: 500 },
          ],
        })
        .expect(200);

      o = await overview();
      // Future EMIs are upcoming, not pending; the untouched invoice is still pending
      expect(o.pending.some((p) => p.invoiceId === 'INV-26087')).toBe(false);
      expect(o.pending.some((p) => p.invoiceId === 'INV-26089')).toBe(true);
      expect(
        o.upcoming
          .filter((u) => u.invoiceId === 'INV-26087')
          .map((u) => `${u.emiNumber} ${u.dueDate} ${u.amount}`),
      ).toEqual(['1 2027-01-10 500', '2 2027-02-10 500']);
      expect(o.received[0]).toMatchObject({
        invoiceId: 'INV-26087',
        amount: 200,
      }); // newest first
      expect(o.metrics.receivedToday).toBeGreaterThanOrEqual(200);
    });

    it('bills each package visit on its own: its step price, ₹0 when free or waived', async () => {
      const patient = await request(app.getHttpServer())
        .post('/api/patients')
        .set(authed())
        .send({ name: 'Billing Plan', phone: '+91 90000 55501' })
        .expect(201);
      const patientId = (patient.body as { id: string }).id;
      const pkg = await request(app.getHttpServer())
        .post(`/api/patients/${patientId}/packages`)
        .set(authed())
        .send({
          items: [
            { treatmentId: 'TO-6', quantity: 2000 },
            { treatmentId: 'TO-3', gap: { value: 2, unit: 'months' } },
            {
              treatmentId: 'TO-3',
              gap: { value: 2, unit: 'months' },
              complimentary: true,
            },
            {
              treatmentId: 'TO-7',
              gap: { value: 7, unit: 'days' },
              unitPrice: 0,
            },
          ],
        })
        .expect(201);
      const pkgId = (pkg.body as { id: string }).id;
      const booked = await request(app.getHttpServer())
        .post(`/api/packages/${pkgId}/sessions/0/appointment`)
        .set(authed())
        .send({
          startsAt: '2027-02-12T09:00:00+05:30',
          doctor: 'Dr. Bhushan Patil',
          days: 1,
        })
        .expect(201);
      const surgery = (booked.body as { steps: { appointmentId?: string }[] })
        .steps[0].appointmentId!;
      const book = async (type: string, startsAt: string) =>
        (
          (
            await request(app.getHttpServer())
              .post('/api/appointments')
              .set(authed())
              .send({ patientId, type, doctor: 'Dr. Bhushan Patil', startsAt })
              .expect(201)
          ).body as { id: string }
        ).id;

      const paidPrp = await book('PRP session', '2027-04-12T10:00:00+05:30');
      const freePrp = await book('PRP session', '2027-06-12T10:00:00+05:30');
      const roller = await book('Derma roller', '2027-06-19T10:00:00+05:30');

      expect(await billOf(surgery)).toMatchObject({
        source: 'package',
        packageId: pkgId,
        total: 40000,
        balance: 40000,
      });
      expect(await billOf(paidPrp)).toMatchObject({
        source: 'package',
        total: 4500,
      });
      const prpPaid = await pay(paidPrp, {
        amount: 4500,
        method: 'UPI',
      }).expect(201);
      expect(prpPaid.body).toMatchObject({ status: 'Paid', balance: 0 });
      expect(await billOf(surgery)).toMatchObject({ paid: 0, balance: 40000 });

      for (const id of [freePrp, roller]) {
        expect(await billOf(id)).toMatchObject({
          total: 0,
          complimentary: true,
          needsCharge: false,
        });
        await pay(id, { amount: 100, method: 'Cash' }).expect(400);
      }
    });
  });

  it('builds the dashboard from live records', async () => {
    type Summary = {
      today: string;
      patients: { total: number; newThisMonth: number };
      appointmentsToday: { total: number; scheduled: number };
      revenue: { thisMonth: number; today: number; billedThisMonth: number };
      prpSessions: { thisMonth: number };
      treatmentMix: {
        total: number;
        prp: number;
        transplant: number;
        consultation: number;
        other: number;
      };
    };
    const summary = async () =>
      (
        await request(app.getHttpServer())
          .get('/api/dashboard/summary')
          .set(authed())
          .expect(200)
      ).body as Summary;
    const before = await summary();
    const mix = before.treatmentMix;
    expect(mix.prp + mix.transplant + mix.consultation + mix.other).toBe(
      mix.total,
    );

    // A new patient booked for a PRP session later today…
    const booked = await request(app.getHttpServer())
      .post('/api/appointments')
      .set(authed())
      .send({
        newPatient: { name: 'Dashboard Check', phone: '+91 90000 55555' },
        type: 'PRP session',
        doctor: 'Dr. Bhushan Patil',
        startsAt: `${before.today}T18:30:00+05:30`,
      })
      .expect(201);
    const id = (booked.body as { id: string }).id;
    let after = await summary();
    expect(after.patients.total).toBe(before.patients.total + 1);
    expect(after.patients.newThisMonth).toBe(before.patients.newThisMonth + 1);
    expect(after.appointmentsToday.total).toBe(
      before.appointmentsToday.total + 1,
    );
    expect(after.appointmentsToday.scheduled).toBe(
      before.appointmentsToday.scheduled + 1,
    );
    expect(after.prpSessions.thisMonth).toBe(before.prpSessions.thisMonth + 1);
    expect(after.treatmentMix.prp).toBe(before.treatmentMix.prp + 1);

    // …who pays for it
    await request(app.getHttpServer())
      .post(`/api/appointments/${id}/payments`)
      .set(authed())
      .send({ amount: 4500, method: 'Cash' })
      .expect(201);
    after = await summary();
    expect(after.revenue.thisMonth).toBe(before.revenue.thisMonth + 4500);
    expect(after.revenue.today).toBe(before.revenue.today + 4500);
    expect(after.revenue.billedThisMonth).toBe(
      before.revenue.billedThisMonth + 4500,
    );

    // Check-in and completion show up in today's counts
    await request(app.getHttpServer())
      .post(`/api/appointments/${id}/check-in`)
      .set(authed())
      .expect(200);
    after = await summary();
    expect(after.appointmentsToday.scheduled).toBe(
      before.appointmentsToday.scheduled,
    );
    await request(app.getHttpServer())
      .post(`/api/appointments/${id}/complete`)
      .set(authed())
      .expect(200);
    after = await summary();
    expect(after.prpSessions.thisMonth).toBe(before.prpSessions.thisMonth + 1);
  });

  it('has no patient status field any more', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/patients/PT-1084')
      .set(authed())
      .expect(200);
    expect(res.body).not.toHaveProperty('status');
    await request(app.getHttpServer())
      .patch('/api/patients/PT-1084')
      .set(authed())
      .send({ status: 'Active' })
      .expect(400);
  });

  it('lists and searches seeded patients', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/patients?search=meera')
      .set(authed())
      .expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ id: 'PT-1082', name: 'Meera Shah' }),
    ]);
  });

  it('validates input and strips unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/api/patients')
      .set(authed())
      .send({
        name: 'Test',
        age: 30,
        phone: '+91 90000 00000',
        concern: 'Thinning',
        role: 'Admin',
      })
      .expect(400);
  });

  it('filters appointments by clinic-local date', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/appointments?date=2026-09-26')
      .set(authed())
      .expect(200);
    const list = res.body as {
      id: string;
      startsAt: string;
      packageId?: string;
    }[];
    // Seeded day; package tests may add sessions for "today" as well.
    expect(list.filter((a) => !a.packageId).map((a) => a.id)).toEqual([
      'APT-501',
      'APT-502',
      'APT-503',
      'APT-504',
      'APT-505',
    ]);
    // 09:30 IST on the 26th is 04:00Z; nothing from neighbouring days leaks in.
    expect(list.every((a) => a.startsAt.startsWith('2026-09-2'))).toBe(true);
  });

  it('never exposes password hashes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set(authed())
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  describe('realtime', () => {
    const connect = (auth: object) =>
      io(`${baseUrl}/realtime`, {
        auth,
        transports: ['websocket'],
        reconnection: false,
      });

    it('refuses sockets without a valid token', async () => {
      const socket = connect({ token: 'invalid' });
      const error = await new Promise<Error>((resolve) =>
        socket.on('connect_error', resolve),
      );
      expect(error.message).toBe('Unauthorized');
      socket.close();
    });

    it('broadcasts record changes and payment notifications', async () => {
      const socket: Socket = connect({ token });
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const created = new Promise<{ name: string }>((resolve) =>
        socket.once('patient.created', resolve),
      );
      await request(app.getHttpServer())
        .post('/api/patients')
        .set(authed())
        .send({
          name: 'Vikram Bhosale',
          age: 38,
          phone: '+91 98000 11111',
          concern: 'Crown thinning',
        })
        .expect(201);
      await expect(created).resolves.toMatchObject({ name: 'Vikram Bhosale' });

      const notification = new Promise<{ title: string }>((resolve) =>
        socket.once('notification', resolve),
      );
      await request(app.getHttpServer())
        .patch('/api/invoices/INV-26089')
        .set(authed())
        .send({ status: 'Paid' })
        .expect(200);
      await expect(notification).resolves.toMatchObject({
        title: 'Payment received',
      });

      socket.close();
    });
  });

  describe('medicines at completion and invoice PDF', () => {
    type Line = { kind: string; description: string; amount: number };
    type Bill = {
      invoiceId?: string;
      items: Line[];
      total: number;
      balance: number;
      contact: { phone?: string };
    };
    const server = () => app.getHttpServer();
    const stock = async (sku: string) =>
      (
        await request(server())
          .get(`/api/inventory/${sku}`)
          .set(authed())
          .expect(200)
      ).body.stockQuantity as number;
    const bill = async (id: string) =>
      (
        await request(server())
          .get(`/api/appointments/${id}/billing`)
          .set(authed())
          .expect(200)
      ).body as Bill;
    const checkedIn = async () => {
      const res = await request(server())
        .post('/api/appointments')
        .set(authed())
        .send({
          patientId: 'PT-1081',
          type: 'Consultation',
          doctor: 'Dr. Bhushan Patil',
          startsAt: new Date().toISOString(),
        })
        .expect(201);
      const id = res.body.id as string;
      await request(server())
        .post(`/api/appointments/${id}/check-in`)
        .set(authed())
        .expect(200);
      return id;
    };
    const complete = (id: string, medicines?: object[]) =>
      request(server())
        .post(`/api/appointments/${id}/complete`)
        .set(authed())
        .send(medicines ? { medicines } : {});

    const FINASTERIDE = '8901234560028'; // ₹95, 8 in stock
    const MINOXIDIL = '8901234560011'; // ₹650
    const EXPIRED_CREAM = '8901234560097'; // expired 2026-09-20

    it('refuses the whole completion when a medicine is short or expired', async () => {
      const id = await checkedIn();
      const before = await stock(MINOXIDIL);
      await complete(id, [
        { itemId: MINOXIDIL, quantity: 1 },
        { itemId: FINASTERIDE, quantity: 999 },
      ]).expect(400);
      await complete(id, [{ itemId: EXPIRED_CREAM, quantity: 1 }]).expect(400);
      await complete(id, [{ itemId: 'NO-SUCH-SKU', quantity: 1 }]).expect(404);
      expect(await stock(MINOXIDIL)).toBe(before);
      await complete(id).expect(200); // still checked in, so it can complete
    });

    it('takes medicines out of stock and bills them with the visit', async () => {
      const id = await checkedIn();
      const fin = await stock(FINASTERIDE);
      const mnx = await stock(MINOXIDIL);
      const done = await complete(id, [
        { itemId: FINASTERIDE, quantity: 1 },
        { itemId: MINOXIDIL, quantity: 1 },
        { itemId: FINASTERIDE, quantity: 1 },
      ]).expect(200);
      expect(done.body.medicines).toEqual([
        expect.objectContaining({
          itemId: FINASTERIDE,
          quantity: 2,
          unitPrice: 95,
        }),
        expect.objectContaining({
          itemId: MINOXIDIL,
          quantity: 1,
          unitPrice: 650,
        }),
      ]);
      expect(await stock(FINASTERIDE)).toBe(fin - 2);
      expect(await stock(MINOXIDIL)).toBe(mnx - 1);

      const b = await bill(id);
      expect(b.items.map((l) => [l.kind, l.amount])).toEqual([
        ['service', 800],
        ['medicine', 190],
        ['medicine', 650],
      ]);
      expect(b.total).toBe(1640);
      expect(b.contact.phone).toBe('+91 99701 52470');

      // Undoing completion puts the medicines back and drops the unpaid bill.
      const reopened = await request(server())
        .delete(`/api/appointments/${id}/complete`)
        .set(authed())
        .expect(200);
      expect(reopened.body.medicines).toBeNull();
      expect(await stock(FINASTERIDE)).toBe(fin);
      expect(await stock(MINOXIDIL)).toBe(mnx);
      expect((await bill(id)).items).toHaveLength(1);
    });

    it('renders the invoice as a PDF once paid, and keeps paid medicines', async () => {
      const id = await checkedIn();
      await complete(id, [{ itemId: FINASTERIDE, quantity: 1 }]).expect(200);
      const b = await bill(id);
      await request(server())
        .post(`/api/appointments/${id}/payments`)
        .set(authed())
        .send({ amount: b.balance, method: 'UPI', reference: 'UPI-4471' })
        .expect(201);

      const pdf = await request(server())
        .get(`/api/invoices/${b.invoiceId}/pdf`)
        .set(authed())
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      const body = pdf.body as Buffer;
      expect(body.subarray(0, 5).toString()).toBe('%PDF-');
      if (process.env.INVOICE_PDF_OUT)
        (await import('node:fs')).writeFileSync(
          process.env.INVOICE_PDF_OUT,
          body,
        );
      await request(server())
        .get('/api/invoices/INV-0/pdf')
        .set(authed())
        .expect(404);

      await request(server())
        .delete(`/api/appointments/${id}/complete`)
        .set(authed())
        .expect(400);
    });
  });
  describe('patient history', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    const asRole = async (role: string) => ({
      Authorization: `Bearer ${
        (
          await request(app.getHttpServer())
            .post('/api/auth/demo')
            .send({ role })
        ).body.accessToken
      }`,
    });
    const medical = {
      noKnownAllergies: false,
      allergies: [
        { substance: 'Lidocaine', reaction: 'Hives', severity: 'Severe' },
      ],
      conditions: [{ name: 'Diabetes', status: 'Current' }],
      medications: [{ name: 'Warfarin', dose: '5 mg', affectsBleeding: true }],
      surgeries: [],
      clearance: 'Pending',
    };

    it('records the medical baseline and hair assessment (clinicians only)', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/patients/PT-1081/history/medical')
        .set(authed())
        .send(medical)
        .expect(200);
      expect(res.body.medical).toMatchObject({
        allergies: [{ substance: 'Lidocaine' }],
        updatedBy: { name: 'Dr. Bhushan Patil' },
      });

      await request(app.getHttpServer())
        .put('/api/patients/PT-1081/history/medical')
        .set(await asRole('Reception'))
        .send(medical)
        .expect(403);
      await request(app.getHttpServer())
        .put('/api/patients/PT-1081/history/medical')
        .set(authed())
        .send({ ...medical, noKnownAllergies: true })
        .expect(400);

      const hair = {
        scale: 'Norwood',
        grade: 'III vertex',
        donor: { quality: 'Good', density: 80, laxity: 'High' },
        treatments: [{ treatment: 'PRP therapy' }],
        goals: { targetGrafts: 2500 },
      };
      await request(app.getHttpServer())
        .put('/api/patients/PT-1081/history/hair')
        .set(await asRole('Doctor'))
        .send(hair)
        .expect(200);
      await request(app.getHttpServer())
        .put('/api/patients/PT-1081/history/hair')
        .set(authed())
        .send({ ...hair, scale: 'Ludwig' })
        .expect(400);

      const all = await request(app.getHttpServer())
        .get('/api/patients/PT-1081/history')
        .set(await asRole('Reception'))
        .expect(200);
      expect(all.body.hair).toMatchObject({ grade: 'III vertex' });
      expect(all.body.medical.medications[0].affectsBleeding).toBe(true);
    });

    it('stores photos by angle and milestone and checks the real file type', async () => {
      const up = await request(app.getHttpServer())
        .post('/api/patients/PT-1081/photos')
        .set(authed())
        .field('angle', 'Frontal hairline')
        .field('milestone', 'Pre-operative')
        .field('takenOn', '2026-09-16')
        .attach('file', png, {
          filename: 'front.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(up.body).toMatchObject({
        angle: 'Frontal hairline',
        file: { mimeType: 'image/png' },
      });

      const file = await request(app.getHttpServer())
        .get(`/api/photos/${up.body.id}/file`)
        .set(authed())
        .expect(200);
      expect(file.headers['content-type']).toBe('image/png');

      // An HTML page renamed to .jpg is refused.
      await request(app.getHttpServer())
        .post('/api/patients/PT-1081/photos')
        .set(authed())
        .field('angle', 'Crown')
        .field('milestone', '1 month')
        .field('takenOn', '2026-09-16')
        .attach('file', Buffer.from('<html><script>x</script></html>'), {
          filename: 'x.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);

      const list = await request(app.getHttpServer())
        .get('/api/patients/PT-1081/photos')
        .set(authed())
        .expect(200);
      expect(list.body).toHaveLength(1);

      await request(app.getHttpServer())
        .delete(`/api/photos/${up.body.id}`)
        .set(await asRole('Reception'))
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/photos/${up.body.id}`)
        .set(authed())
        .expect(204);
    });

    it('keeps signed consents and lets a consent be withdrawn', async () => {
      const pdf = Buffer.from('%PDF-1.4\n%%EOF');
      const doc = await request(app.getHttpServer())
        .post('/api/patients/PT-1081/documents')
        .set(await asRole('Reception'))
        .field('kind', 'Photo consent')
        .field('title', 'Before/after photo consent')
        .field('signedAt', '2026-09-16T10:30:00+05:30')
        .field('format', 'Physical (scanned)')
        .field('photoUse', 'Education only')
        .attach('file', pdf, {
          filename: 'consent.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      expect(doc.body).toMatchObject({
        photoUse: 'Education only',
        signedAt: '2026-09-16T05:00:00.000Z',
      });

      const revoked = await request(app.getHttpServer())
        .post(`/api/documents/${doc.body.id}/revoke`)
        .set(authed())
        .expect(200);
      expect(revoked.body.revokedAt).toBeDefined();
      await request(app.getHttpServer())
        .post(`/api/documents/${doc.body.id}/revoke`)
        .set(authed())
        .expect(400);

      // A photo consent must say what the photos may be used for.
      await request(app.getHttpServer())
        .post('/api/patients/PT-1081/documents')
        .set(authed())
        .field('kind', 'Photo consent')
        .field('title', 'x')
        .field('signedAt', '2026-09-16T10:30:00+05:30')
        .field('format', 'Digital')
        .attach('file', pdf, {
          filename: 'c.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    });

    it('summarises every patient for the History page', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/history')
        .set(authed())
        .expect(200);
      const rohan = (res.body as { patientId: string }[]).find(
        (r) => r.patientId === 'PT-1083',
      );
      expect(rohan).toMatchObject({
        medicalRecorded: true,
        hairGrade: 'Norwood IV',
        allergies: ['Penicillin'],
        bleedingRisk: ['Aspirin'],
        clearance: 'Pending',
        surgeryConsent: 'Signed',
        photoUse: 'Education only',
        photos: 6,
      });
    });

    it('seeds demo photos and signed forms that can be downloaded', async () => {
      const photos = await request(app.getHttpServer())
        .get('/api/patients/PT-1079/photos')
        .set(authed())
        .expect(200);
      expect(photos.body.length).toBeGreaterThanOrEqual(20);
      expect(photos.body[0]).toMatchObject({ milestone: 'Pre-operative' });
      const img = await request(app.getHttpServer())
        .get(`/api/photos/${photos.body[0].id}/file`)
        .set(authed())
        .expect(200);
      expect(img.headers['content-type']).toBe('image/jpeg');

      const docs = await request(app.getHttpServer())
        .get('/api/patients/PT-1084/documents')
        .set(authed())
        .expect(200);
      const consent = (
        docs.body as { id: string; kind: string; revokedAt?: string }[]
      ).find((d) => d.kind === 'Photo consent');
      expect(consent?.revokedAt).toBeDefined();
      const pdf = await request(app.getHttpServer())
        .get(`/api/documents/${consent!.id}/file`)
        .set(authed())
        .expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
    });

    it("lists only the patient's invoices for the financial records", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/invoices?patientId=PT-1084')
        .set(authed())
        .expect(200);
      expect(
        (res.body as { patientId?: string }[]).every(
          (i) => i.patientId === 'PT-1084',
        ),
      ).toBe(true);
    });
  });
});
