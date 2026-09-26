import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { hash } from 'bcryptjs';
import { CrudService } from '../common/crud.service';
import { seedTeam } from '../seed/seed-data';
import { InviteUserDto } from './dto/invite-user.dto';
import { PublicUser, Role, User } from './user.entity';

@Injectable()
export class UsersService extends CrudService<User> implements OnModuleInit {
  constructor(
    events: EventEmitter2,
    private readonly config: ConfigService,
  ) {
    super(events, 'user', 'USR-', seedTeam);
  }

  /** Creates (or refreshes) the administrator login from SEED_ADMIN_* env vars. */
  async onModuleInit() {
    const email = this.config
      .getOrThrow<string>('SEED_ADMIN_EMAIL')
      .toLowerCase();
    const passwordHash = await hash(
      this.config.getOrThrow<string>('SEED_ADMIN_PASSWORD'),
      10,
    );
    const admin = this.repo.findAll().find((u) => u.role === 'Admin');
    if (admin)
      this.repo.update(admin.id, { email, passwordHash, status: 'Active' });
  }

  findByEmail(email: string): User | undefined {
    const normalized = email.toLowerCase();
    return this.repo.findAll().find((u) => u.email === normalized);
  }

  async register(data: {
    name: string;
    email: string;
    password: string;
    role: Role;
  }) {
    this.assertEmailAvailable(data.email);
    return this.insert({
      name: data.name,
      email: data.email.toLowerCase(),
      role: data.role,
      title: data.role,
      status: 'Active',
      passwordHash: await hash(data.password, 10),
    });
  }

  invite(dto: InviteUserDto): User {
    this.assertEmailAvailable(dto.email);
    return this.insert({
      name: dto.name,
      email: dto.email.toLowerCase(),
      role: dto.role,
      title: dto.title ?? dto.role,
      status: 'Invited',
    });
  }

  toPublic({ passwordHash: _passwordHash, ...user }: User): PublicUser {
    return user;
  }

  // Never broadcast password hashes over the websocket.
  protected override publish(action: string, data: unknown) {
    const payload = isUser(data) ? this.toPublic(data) : data;
    super.publish(action, payload);
  }

  private assertEmailAvailable(email: string) {
    if (this.findByEmail(email))
      throw new ConflictException('Email is already registered');
  }
}

function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'email' in value;
}
