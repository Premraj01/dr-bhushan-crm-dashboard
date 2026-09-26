/** Internal event-bus channel; payloads are forwarded verbatim to websocket clients. */
export const REALTIME_BROADCAST = 'realtime.broadcast';

export interface RealtimeMessage<T = unknown> {
  /** Name clients subscribe to, e.g. `appointment.updated` or `notification`. */
  event: string;
  data: T;
}

export interface ClinicNotification {
  tone: 'success' | 'warning' | 'error' | 'neutral';
  title: string;
  message: string;
  at: string;
}
