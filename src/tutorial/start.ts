import { findBlueprint } from "../blueprints/catalog.ts";
import { library } from "../library/index.ts";
import { selectionStore, uiStore } from "../store/index.ts";
import { toast } from "../ui/Toast.tsx";
import { findLesson } from "./lessons/index.ts";

/**
 * Start a lesson in a system of its own (a fresh copy of its blueprint, or
 * a new blank system), so its numbers come out as it says.
 */
export async function startTutorial(lessonId: string): Promise<void> {
  const lesson = findLesson(lessonId);
  const first = lesson?.steps[0];
  if (!lesson || !first) return;
  try {
    const blueprint = "blueprint" in lesson.start ? findBlueprint(lesson.start.blueprint) : null;
    const doc = blueprint
      ? await library.createFromBlueprint(blueprint)
      : await library.createAndOpen("blank" in lesson.start ? lesson.start.blank : lesson.title);
    selectionStore.getState().clear();
    const ui = uiStore.getState();
    ui.setWelcomeOpen(false);
    ui.setTutorialsOpen(false);
    ui.setTutorial({ lesson: lesson.id, step: first.id, systemId: doc.id, systemName: doc.name });
  } catch (error) {
    console.error("0n1: couldn't start the tutorial", error);
    toast({ title: "Couldn't start the tutorial" });
  }
}
