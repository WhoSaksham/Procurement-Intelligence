import { create } from 'zustand';
import { ApiError, isUnreachable } from './client';

/** Whether the API is down, as learned from any failed request; cleared when it answers again. */
export const useBackend = create<{ down: boolean; setDown: (down: boolean) => void }>()((set) => ({
  down: false,
  setDown: (down) => set({ down }),
}));

/** Record a failed request: an unreachable API or a server error means the backend is down. */
export function reportFailure(e: unknown): void {
  if (isUnreachable(e) || (e instanceof ApiError && e.status >= 500)) useBackend.getState().setDown(true);
}
