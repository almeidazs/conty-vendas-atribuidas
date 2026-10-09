import type { Clock } from '../types/clock';

export const systemClock: Clock = { now: () => new Date() };
