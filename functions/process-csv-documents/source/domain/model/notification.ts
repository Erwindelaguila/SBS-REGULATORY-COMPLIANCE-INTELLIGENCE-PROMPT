export interface Notification<T = unknown> {
  type: string;
  sessionId: string;
  data: T;
}
