import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthUser, JwtPayload } from './auth-user';
import { DemoLoginDto } from './dto/demo-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { permissionsOf } from './permissions';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login({ email, password }: LoginDto) {
    const user = this.users.findByEmail(email);
    const valid =
      user?.passwordHash && (await compare(password, user.passwordHash));
    if (!user || !valid || user.status !== 'Active') {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user);
  }

  async register(dto: RegisterDto) {
    if (!this.config.get<boolean>('ALLOW_REGISTRATION')) {
      throw new ForbiddenException('Self-service registration is disabled');
    }
    const user = await this.users.register({ ...dto, role: 'Receptionist' });
    return this.issueToken(user);
  }

  /** Signs in as the first active seeded member with the given role — demo/dev only. */
  demoLogin({ role }: DemoLoginDto) {
    if (!this.config.get<boolean>('DEMO_LOGINS')) {
      throw new ForbiddenException('Demo logins are disabled');
    }
    const user = this.users
      .findAll()
      .find((u) => u.role === role && u.status === 'Active');
    if (!user)
      throw new UnauthorizedException(
        `No active ${role} account to sign in as`,
      );
    return this.issueToken(user);
  }

  /** Used by the websocket gateway, which authenticates outside Passport. */
  async verify(token: string): Promise<AuthUser> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    const user = this.users.findOne(payload.sub);
    if (user.status !== 'Active') throw new UnauthorizedException();
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private async issueToken(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: this.session(user),
    };
  }

  /** The signed-in user plus what their role may do, for the frontend to show or hide actions. */
  session(user: User) {
    return { ...this.users.toPublic(user), permissions: permissionsOf(user) };
  }
}
