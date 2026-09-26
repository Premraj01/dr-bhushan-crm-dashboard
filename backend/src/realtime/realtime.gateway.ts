import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type WsResponse,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import type { AuthUser } from '../auth/auth-user';
import { AuthService } from '../auth/auth.service';
import { REALTIME_BROADCAST, type RealtimeMessage } from './realtime.events';

type ClinicSocket = Socket<never, never, never, { user: AuthUser }>;

/**
 * Live updates for the CRM dashboard on the `/realtime` namespace.
 *
 * Clients authenticate with the same JWT as the REST API:
 *   io('/realtime', { auth: { token } })
 *
 * Server → client events: `<entity>.created|updated|deleted` for patients, appointments,
 * leads, treatments, invoices, packages, users and the Settings catalog (`catalog.treatment.*`,
 * `catalog.concern.*`), plus `notification` and `presence`.
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Namespace;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly auth: AuthService) {}

  /** Reject unauthenticated sockets during the handshake so they never receive broadcasts. */
  afterInit(server: Namespace) {
    server.use((socket, next) => {
      const token = extractToken(socket);
      if (!token) return next(new Error('Unauthorized'));
      this.auth
        .verify(token)
        .then((user) => {
          (socket as ClinicSocket).data.user = user;
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });
    server.on('connection', (socket: ClinicSocket) => {
      this.logger.debug(`${socket.data.user.email} connected (${socket.id})`);
      this.broadcastPresence();
    });
  }

  handleDisconnect() {
    this.broadcastPresence();
  }

  @SubscribeMessage('ping')
  ping(): WsResponse<{ at: string }> {
    return { event: 'pong', data: { at: new Date().toISOString() } };
  }

  @OnEvent(REALTIME_BROADCAST)
  broadcast({ event, data }: RealtimeMessage) {
    this.server.emit(event, data);
  }

  private broadcastPresence() {
    this.server.emit('presence', { online: this.server.sockets.size });
  }
}

function extractToken(socket: Socket): string | undefined {
  const fromAuth: unknown = socket.handshake.auth?.['token'];
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
  const header = socket.handshake.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
