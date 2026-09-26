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

    it('stores FUE as a 1–2 day range and validates ranges', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/catalog/treatments')
        .set(authed())
        .expect(200);
      expect(
        (list.body as { name: string }[]).find(
          (t) => t.name === 'FUE hair transplant',
        ),
      ).toMatchObject({ duration: 1, durationMax: 2, durationUnit: 'days' });

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

  describe('treatment packages', () => {
    const create = (token: string, body: object, patientId = 'PT-1081') =>
      request(app.getHttpServer())
        .post(`/api/patients/${patientId}/packages`)
        .set({ Authorization: `Bearer ${token}` })
        .send(body);
    type Step = { kind: string; date: string };
    const steps = (res: { body: unknown }) =>
      (res.body as { schedule: Step[] }).schedule;
    const demo = async (role: string) =>
      (await request(app.getHttpServer()).post('/api/auth/demo').send({ role }))
        .body.accessToken as string;

    it('prices PRP sessions from Settings', async () => {
      const res = await create(token, { prpSessions: 4 }).expect(201);
      expect(res.body).toMatchObject({
        total: 4 * 4500,
        prpSessions: 4,
        status: 'Proposed',
      });
    });

    it('prices FUE per graft and adds 3 complimentary PRP sessions', async () => {
      const doctor = await demo('Doctor');
      const res = await create(doctor, {
        prpSessions: 2,
        transplant: { grafts: 2500 },
      }).expect(201);
      expect(res.body.total).toBe(2 * 4500 + 2500 * 20);
      expect(res.body.prpSessions).toBe(5);
      expect(res.body.createdBy).toMatchObject({ role: 'Doctor' });
      expect(res.body.lines).toContainEqual(
        expect.objectContaining({
          complimentary: true,
          quantity: 3,
          amount: 0,
        }),
      );

      const patient = await request(app.getHttpServer())
        .get('/api/patients/PT-1081')
        .set(authed())
        .expect(200);
      expect(patient.body.treatment).toBe('Package · FUE 2,500 grafts + 5 PRP');
    });

    it('schedules 3 PRP sessions 3 months apart from the start date', async () => {
      const res = await create(token, {
        prpSessions: 3,
        startDate: '2026-09-27',
      }).expect(201);
      expect(steps(res).map((s) => s.date)).toEqual([
        '2026-09-27',
        '2026-12-27',
        '2027-03-27',
      ]);
    });

    it('schedules the transplant, then its 3 free PRP sessions 3 months apart', async () => {
      const res = await create(token, {
        transplant: { grafts: 2000 },
        startDate: '2026-09-30',
      }).expect(201);
      expect(steps(res).map((s) => `${s.kind} ${s.date}`)).toEqual([
        'transplant 2026-09-30',
        'prp-free 2026-12-30',
        'prp-free 2027-03-30',
        'prp-free 2027-06-30',
      ]);
    });

    it('follows a custom order and clamps month ends', async () => {
      const res = await create(token, {
        prpSessions: 1,
        transplant: { grafts: 1500 },
        startDate: '2026-11-30',
        sequence: ['prp', 'transplant', 'prp-free', 'prp-free', 'prp-free'],
      }).expect(201);
      expect(steps(res).map((s) => `${s.kind} ${s.date}`)).toEqual([
        'prp 2026-11-30',
        'transplant 2027-02-28',
        'prp-free 2027-05-30',
        'prp-free 2027-08-30',
        'prp-free 2027-11-30',
      ]);
      await create(token, { prpSessions: 2, sequence: ['prp'] }).expect(400);
    });

    it('books every session in the appointment calendar and keeps it in sync', async () => {
      const res = await create(
        token,
        {
          transplant: { grafts: 2000 },
          startDate: '2026-09-30',
          sessionTime: '09:30',
          doctor: 'Dr. Sonal Desai',
        },
        'PT-1080',
      ).expect(201);
      const pkgId = (res.body as { id: string }).id;
      type Apt = {
        id: string;
        startsAt: string;
        type: string;
        durationMinutes: number;
        status: string;
        packageId?: string;
        doctor: string;
      };
      const listFor = async () =>
        (
          await request(app.getHttpServer())
            .get('/api/appointments?patientId=PT-1080')
            .set(authed())
            .expect(200)
        ).body as Apt[];

      const booked = (await listFor()).filter((a) => a.packageId === pkgId);
      expect(booked.map((a) => a.startsAt)).toEqual([
        '2026-09-30T04:00:00.000Z', // 09:30 IST
        '2026-12-30T04:00:00.000Z',
        '2027-03-30T04:00:00.000Z',
        '2027-06-30T04:00:00.000Z',
      ]);
      expect(booked[0]).toMatchObject({
        durationMinutes: 480,
        status: 'Scheduled',
        doctor: 'Dr. Sonal Desai',
      });
      expect(booked[1]).toMatchObject({ durationMinutes: 45 });
      expect(steps(res).every((s) => 'appointmentId' in s)).toBe(true);

      const month = await request(app.getHttpServer())
        .get('/api/appointments?month=2026-12')
        .set(authed())
        .expect(200);
      expect((month.body as Apt[]).some((a) => a.packageId === pkgId)).toBe(
        true,
      );

      await request(app.getHttpServer())
        .patch(`/api/packages/${pkgId}`)
        .set(authed())
        .send({ status: 'Accepted' })
        .expect(200);
      expect(
        (await listFor())
          .filter((a) => a.packageId === pkgId)
          .every((a) => a.status === 'Scheduled'),
      ).toBe(true);

      // A package session can't be deleted on its own…
      await request(app.getHttpServer())
        .delete(`/api/appointments/${booked[1].id}`)
        .set(authed())
        .expect(400);
      // …but cancelling the package clears its upcoming sessions from the calendar.
      await request(app.getHttpServer())
        .patch(`/api/packages/${pkgId}`)
        .set(authed())
        .send({ status: 'Cancelled' })
        .expect(200);
      expect(
        (await listFor()).filter((a) => a.packageId === pkgId),
      ).toHaveLength(0);
    });

    it('lets the per-graft price be overridden for one package', async () => {
      const res = await create(token, {
        transplant: { grafts: 3000, pricePerGraft: 25 },
      }).expect(201);
      expect(res.body.total).toBe(3000 * 25);
    });

    it('rejects empty packages and receptionists', async () => {
      await create(token, { prpSessions: 0 }).expect(400);
      await create(await demo('Reception'), { prpSessions: 2 }).expect(403);
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

    it('edits an appointment: reschedule, change doctor, status and patient', async () => {
      const created = await book({ ...slot, patientId: 'PT-1082' }).expect(201);
      const id = (created.body as { id: string }).id;
      const res = await request(app.getHttpServer())
        .patch(`/api/appointments/${id}`)
        .set(authed())
        .send({
          startsAt: '2026-10-07T15:00:00+05:30',
          doctor: 'Dr. Sonal Desai',
          status: 'Checked in',
          patientId: 'PT-1080',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        startsAt: '2026-10-07T09:30:00.000Z',
        doctor: 'Dr. Sonal Desai',
        status: 'Checked in',
        patientId: 'PT-1080',
        patientName: 'Kavita Rao',
      });
    });

    it('moves a rescheduled package session in the package schedule, and keeps its patient', async () => {
      const pkg = await request(app.getHttpServer())
        .post('/api/patients/PT-1084/packages')
        .set(authed())
        .send({ prpSessions: 2, startDate: '2026-10-01' })
        .expect(201);
      const { id: pkgId, schedule } = pkg.body as {
        id: string;
        schedule: { appointmentId: string; date: string }[];
      };
      const second = schedule[1];
      await request(app.getHttpServer())
        .patch(`/api/appointments/${second.appointmentId}`)
        .set(authed())
        .send({ startsAt: '2027-01-15T10:00:00+05:30' })
        .expect(200);
      const after = await request(app.getHttpServer())
        .get('/api/patients/PT-1084/packages')
        .set(authed())
        .expect(200);
      const updated = (
        after.body as { id: string; schedule: { date: string }[] }[]
      ).find((p) => p.id === pkgId)!;
      expect(updated.schedule.map((s) => s.date)).toEqual([
        '2026-10-01',
        '2027-01-15',
      ]);

      await request(app.getHttpServer())
        .patch(`/api/appointments/${second.appointmentId}`)
        .set(authed())
        .send({ patientId: 'PT-1082' })
        .expect(400);
    });

    it('only allows the four simplified statuses', async () => {
      const created = await book({ ...slot, patientId: 'PT-1081' }).expect(201);
      const id = (created.body as { id: string }).id;
      for (const status of [
        'Checked in',
        'Completed',
        'No show',
        'Scheduled',
      ]) {
        await request(app.getHttpServer())
          .patch(`/api/appointments/${id}`)
          .set(authed())
          .send({ status })
          .expect(200);
      }
      for (const status of ['Confirmed', 'Waiting', 'Cancelled', 'No-show']) {
        await request(app.getHttpServer())
          .patch(`/api/appointments/${id}`)
          .set(authed())
          .send({ status })
          .expect(400);
      }
    });

    it('rejects patientId and newPatient together', async () => {
      await book({
        ...slot,
        patientId: 'PT-1082',
        newPatient: { name: 'X', phone: '+91 90000 00001' },
      }).expect(400);
    });
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
});
