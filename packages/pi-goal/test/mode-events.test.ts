import assert from "node:assert/strict";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { createGoalModePublisher, goalModeChangedEvent } from "../src/mode-events.js";
import type { ActiveGoal } from "../src/persistence.js";
import { registerGoal } from "./support/goal-fixture.js";

function goal(status: ActiveGoal["status"], waiting = false): ActiveGoal {
	return {
		id: "goal-id",
		text: "test goal",
		status,
		startedAt: 1,
		updatedAt: 1,
		iteration: 0,
		tokensUsed: 0,
		timeUsedSeconds: 0,
		baselineTokens: 0,
		automaticModelTurns: 0,
		toolFreeRepeatCount: 0,
		...(waiting ? { waiting: { reason: "external event" } } : {}),
	};
}

test("Goal mode snapshots expose semantic active and stopped states", () => {
	assert.deepEqual(goalModeChangedEvent(undefined), {
		version: 1,
		source: "pi-goal",
		mode: "goal",
		state: "off",
		active: false,
	});
	assert.equal(goalModeChangedEvent(goal("active")).state, "active");
	assert.equal(goalModeChangedEvent(goal("active", true)).state, "waiting");
	for (const state of [
		"queued",
		"paused",
		"blocked",
		"usage_limited",
		"budget_limited",
		"complete",
	] as const) {
		assert.deepEqual(goalModeChangedEvent(goal(state)), {
			version: 1,
			source: "pi-goal",
			mode: "goal",
			state,
			active: false,
		});
	}
});

test("Goal mode publisher emits snapshots once and can be reset", () => {
	const mock = createMockPi();
	const events: unknown[] = [];
	mock.eventBus.on("pi:mode-changed", (event) => events.push(event));
	const publisher = createGoalModePublisher(mock.rawPi);

	publisher.publish(undefined);
	publisher.publish(undefined);
	publisher.publish(goal("active"));
	publisher.reset();
	publisher.publish(goal("active"));

	assert.equal(events.length, 3);
	assert.deepEqual(events[0], {
		version: 1,
		source: "pi-goal",
		mode: "goal",
		state: "off",
		active: false,
	});
	assert.deepEqual(events[1], {
		version: 1,
		source: "pi-goal",
		mode: "goal",
		state: "active",
		active: true,
	});
	assert.deepEqual(events[2], events[1]);
});

test("Goal mode publisher does not let a listener failure escape", () => {
	const mock = createMockPi();
	mock.eventBus.on("pi:mode-changed", () => {
		throw new Error("observer failure");
	});
	const publisher = createGoalModePublisher(mock.rawPi);

	assert.doesNotThrow(() => publisher.publish(goal("active")));
});

test("Goal lifecycle emits a restored active snapshot and shutdown off", async () => {
	const branch = [
		{
			type: "custom",
			customType: "goal-state",
			data: {
				goal: {
					...goal("active"),
					tokenBudget: 10,
					tokensUsed: 0,
				},
			},
		},
	];
	const mock = createMockPi();
	const context = createMockContext({
		sessionManager: { getBranch: () => branch, getEntries: () => branch },
	});
	const states: string[] = [];
	mock.eventBus.on("pi:mode-changed", (event) => states.push((event as { state: string }).state));
	registerGoal(mock.pi);

	await mock.events.get("session_start")?.[0]?.({ reason: "resume" }, context.ctx);
	await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);

	assert.deepEqual(states, ["active", "off"]);
});
