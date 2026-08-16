import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PlanModeState } from "./state.js";

export const MODE_CHANGED_EVENT = "pi:mode-changed" as const;
export const PLAN_MODE_SOURCE = "pi-plan-mode" as const;
export const PLAN_MODE_NAME = "plan" as const;

export type PlanModeEventState = "off" | "active" | "ready" | "saved" | "implementing";

export interface PlanModeChangedEvent {
	version: 1;
	source: typeof PLAN_MODE_SOURCE;
	mode: typeof PLAN_MODE_NAME;
	state: PlanModeEventState;
	active: boolean;
}

export function planModeChangedEvent(state: PlanModeState): PlanModeChangedEvent {
	if (state.enabled) {
		const ready = state.awaitingAction || state.latestPlan !== undefined;
		return {
			version: 1,
			source: PLAN_MODE_SOURCE,
			mode: PLAN_MODE_NAME,
			state: ready ? "ready" : "active",
			active: true,
		};
	}

	if (state.savedPlan) {
		return {
			version: 1,
			source: PLAN_MODE_SOURCE,
			mode: PLAN_MODE_NAME,
			state: "saved",
			active: false,
		};
	}

	if (state.activeImplementation) {
		return {
			version: 1,
			source: PLAN_MODE_SOURCE,
			mode: PLAN_MODE_NAME,
			state: "implementing",
			active: false,
		};
	}

	return {
		version: 1,
		source: PLAN_MODE_SOURCE,
		mode: PLAN_MODE_NAME,
		state: "off",
		active: false,
	};
}

export function createPlanModePublisher(pi: Pick<ExtensionAPI, "events">) {
	let lastEvent: PlanModeChangedEvent | undefined;

	return {
		reset() {
			lastEvent = undefined;
		},
		publish(state: PlanModeState) {
			const nextEvent = planModeChangedEvent(state);
			if (samePlanModeEvent(lastEvent, nextEvent)) return;
			lastEvent = nextEvent;
			try {
				pi.events.emit(MODE_CHANGED_EVENT, nextEvent);
			} catch {
				// Mode signalling is best effort and must not interrupt Plan state changes.
			}
		},
	};
}

function samePlanModeEvent(previous: PlanModeChangedEvent | undefined, next: PlanModeChangedEvent) {
	return (
		previous?.version === next.version &&
		previous?.source === next.source &&
		previous?.mode === next.mode &&
		previous?.state === next.state &&
		previous?.active === next.active
	);
}
