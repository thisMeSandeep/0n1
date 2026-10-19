import { library } from "../library/index.ts";
import { selectionStore, uiStore } from "../store/index.ts";
import { toast } from "../ui/Toast.tsx";
import { findLesson } from "./lessons/firstSystem.ts";

/** Start a lesson in a fresh system of its own, so its numbers come out as it says. */
export async function startTutorial(lessonId: string): Promise<void> {
  const lesson = findLesson(lessonId);
  const first = lesson?.steps[0];
  if (!lesson || !first) return;
  try {
    const doc = await library.createAndOpen(lesson.systemName);
    selectionStore.getState().clear();
    const ui = uiStore.getState();
    ui.setWelcomeOpen(false);
    ui.setTutorial({ lesson: lesson.id, step: first.id, systemId: doc.id });
  } catch (error) {
    console.error("0n1: couldn't start the tutorial", error);
    toast({ title: "Couldn't start the tutorial" });
  }
}
