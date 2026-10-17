import {
  type ComponentDefinition,
  PARAM_SECTIONS,
  type ParamSection,
  type ParamSpec,
  type Params,
} from "../model/component.ts";

/** Inspector section titles (UIUX §7). */
export const SECTION_TITLE: Readonly<Record<ParamSection, string>> = {
  capacity: "Capacity",
  behaviour: "Behaviour",
  failure: "When things go wrong",
};

export type ParamSectionGroup = {
  section: ParamSection;
  title: string;
  params: readonly (readonly [key: string, spec: ParamSpec])[];
};

/** A component's params grouped into inspector sections, in a fixed order, skipping empty ones. */
export function paramSections(definition: ComponentDefinition): ParamSectionGroup[] {
  const entries = Object.entries(definition.params);
  return PARAM_SECTIONS.flatMap((section) => {
    const params = entries.filter(([, spec]) => spec.section === section);
    return params.length > 0 ? [{ section, title: SECTION_TITLE[section], params }] : [];
  });
}

/** A param with `enabledBy` only applies while its toggle is on. */
export function isParamEnabled(spec: ParamSpec, params: Params): boolean {
  return spec.enabledBy === undefined || params[spec.enabledBy] === true;
}

/** "1 component", "3 connections". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
