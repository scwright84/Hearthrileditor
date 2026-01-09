import { EventEmitter } from "node:events";

type ProjectEvent = { message: string; data?: unknown };

const globalForEvents = globalThis as unknown as { projectEvents?: EventEmitter };

const emitter =
  globalForEvents.projectEvents ??
  new EventEmitter({ captureRejections: false });

if (process.env.NODE_ENV !== "production") {
  globalForEvents.projectEvents = emitter;
}

export function publishProjectEvent(projectId: string, payload: ProjectEvent) {
  emitter.emit(projectId, payload);
}

export function subscribeProjectEvents(
  projectId: string,
  handler: (payload: ProjectEvent) => void,
) {
  emitter.on(projectId, handler);
  return () => emitter.off(projectId, handler);
}
