import type { Lesson } from "../lesson.ts";
import { caching } from "./caching.ts";
import { failures } from "./failures.ts";
import { firstSystem } from "./firstSystem.ts";
import { queues } from "./queues.ts";
import { traces } from "./traces.ts";

/** Every lesson, in the order they're best taken. */
export const LESSONS: readonly Lesson[] = [firstSystem, caching, queues, failures, traces];

export function findLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** The lesson after this one, if there is one. */
export function nextLesson(id: string): Lesson | undefined {
  return LESSONS[LESSONS.findIndex((l) => l.id === id) + 1];
}
