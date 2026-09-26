import { Role } from '../users/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** Attached to `request.user` (HTTP) and `socket.data.user` (websockets). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
