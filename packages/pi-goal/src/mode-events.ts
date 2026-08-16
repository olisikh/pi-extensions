import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ActiveGoal } from "./persistence.js";

export const MODE_CHANGED_EVENT = "pi:mode-changed" as const;
export const GOAL_SOURCE = "pi-goal" as const;
export const GOAL_MODE_NAME = "goal" as const;

export type GoalModeEventState =
	| "off"
	| "active"
	| "waiting"
	| "queued"
	| "paused"
	| "blocked"
	| "usage_limited"
	| "budget_limited"
	| "complete";

export interface GoalModeChangedEvent {
	version: 1;
	source: typeof GOAL_SOURCE;
	mode: typeof GOAL_MODE_NAME;
	state: GoalModeEventState;
	active: boolean;
}

export function goalModeChangedEvent(goal: ActiveGoal | undefined): GoalModeChangedEvent {
	if (!goal) return offEvent();
	if (goal.status === "active" && goal.waiting) {
		return eventFor("waiting", true);
	}
	if (goal.status === "active") return eventFor("active", true);
	return eventFor(goal.status, false);
}

export function createGoalModePublisher(pi: Pick<ExtensionAPI, "events">) {
	let lastEvent: GoalModeChangedEvent | undefined;

	return {
		reset() {
			lastEvent = undefined;
		},
		publish(goal: ActiveGoal | undefined) {
			const nextEvent = goalModeChangedEvent(goal);
			this.publishState(nextEvent.state, nextEvent.active);
		},
		publishState(state: GoalModeEventState, active: boolean) {
			const nextEvent = eventFor(state, active);
			if (sameGoalModeEvent(lastEvent, nextEvent)) return;
			lastEvent = nextEvent;
			try {
				pi.events.emit(MODE_CHANGED_EVENT, nextEvent);
			} catch {
				// Mode signalling is best effort and must not interrupt Goal state changes.
			}
		},
	};
}

function offEvent(): GoalModeChangedEvent {
	return eventFor("off", false);
}

function eventFor(state: GoalModeEventState, active: boolean): GoalModeChangedEvent {
	return {
		version: 1,
		source: GOAL_SOURCE,
		mode: GOAL_MODE_NAME,
		state,
		active,
	};
}

function sameGoalModeEvent(previous: GoalModeChangedEvent | undefined, next: GoalModeChangedEvent) {
	return (
		previous?.version === next.version &&
		previous?.source === next.source &&
		previous?.mode === next.mode &&
		previous?.state === next.state &&
		previous?.active === next.active
	);
}
