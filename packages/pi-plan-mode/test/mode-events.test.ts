import assert from "node:assert/strict";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { createPlanModePublisher, planModeChangedEvent } from "../src/mode-events.js";
import planMode from "../src/plan-mode.js";

const offState = { enabled: false, awaitingAction: false };

test("Plan mode snapshots distinguish active, ready, saved, implementing, and off", () => {
	assert.deepEqual(planModeChangedEvent(offState), {
		version: 1,
		source: "pi-plan-mode",
		mode: "plan",
		state: "off",
		active: false,
	});
	assert.equal(planModeChangedEvent({ enabled: true, awaitingAction: false }).state, "active");
	assert.equal(planModeChangedEvent({ enabled: true, awaitingAction: true }).state, "ready");
	assert.equal(
		planModeChangedEvent({
			enabled: false,
			awaitingAction: false,
			savedPlan: { plan: "# plan", source: "plan_mode_complete" },
		}).state,
		"saved",
	);
	assert.equal(
		planModeChangedEvent({
			enabled: false,
			awaitingAction: false,
			activeImplementation: {
				id: "implementation",
				plan: "# plan",
				source: "plan_mode_complete",
				startedAt: 1,
			},
		}).state,
		"implementing",
	);
});

test("Plan mode publisher emits snapshots once and can be reset", () => {
	const mock = createMockPi();
	const events: unknown[] = [];
	mock.eventBus.on("pi:mode-changed", (event) => events.push(event));
	const publisher = createPlanModePublisher(mock.rawPi);

	publisher.publish(offState);
	publisher.publish(offState);
	publisher.publish({ enabled: true, awaitingAction: false });
	publisher.reset();
	publisher.publish({ enabled: true, awaitingAction: false });

	assert.equal(events.length, 3);
	assert.deepEqual(events[0], {
		version: 1,
		source: "pi-plan-mode",
		mode: "plan",
		state: "off",
		active: false,
	});
	assert.deepEqual(events[1], {
		version: 1,
		source: "pi-plan-mode",
		mode: "plan",
		state: "active",
		active: true,
	});
	assert.deepEqual(events[2], events[1]);
});

test("Plan mode publisher does not let a listener failure escape", () => {
	const mock = createMockPi();
	mock.eventBus.on("pi:mode-changed", () => {
		throw new Error("observer failure");
	});
	const publisher = createPlanModePublisher(mock.rawPi);

	assert.doesNotThrow(() => publisher.publish({ enabled: true, awaitingAction: false }));
});

test("Plan lifecycle emits initial, transition, and shutdown snapshots", async () => {
	const mock = createMockPi();
	const context = createMockContext();
	const events: Array<{ state: string; active: boolean }> = [];
	mock.eventBus.on("pi:mode-changed", (event) => {
		const snapshot = event as { state: string; active: boolean };
		events.push(snapshot);
	});
	planMode(mock.pi, { readSettings: async () => ({ kind: "missing" as const }) });

	await mock.events.get("session_start")?.[0]?.({ reason: "startup" }, context.ctx);
	await mock.commands.get("plan")?.handler("start", context.ctx);
	await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);

	assert.deepEqual(
		events.map(({ state, active }) => ({ state, active })),
		[
			{ state: "off", active: false },
			{ state: "active", active: true },
			{ state: "off", active: false },
		],
	);
});
