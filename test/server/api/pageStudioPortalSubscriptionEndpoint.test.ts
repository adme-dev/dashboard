import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireClientAuth: vi.fn(),
	listPortalPageStudioSubscriptions: vi.fn(),
}));

vi.mock("~~/server/utils/clientAuth", () => ({
	requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args),
}));
vi.mock("~~/server/utils/pageStudio/operations", () => ({
	listPortalPageStudioSubscriptions: (...args: unknown[]) =>
		mocks.listPortalPageStudioSubscriptions(...args),
}));
vi.mock("~~/server/utils/pageStudio/http", () => ({
	pageStudioHttpError: (error: unknown) => {
		throw error;
	},
}));

const testGlobal = globalThis as typeof globalThis & {
	eventHandler: <T>(handler: T) => T;
};
testGlobal.eventHandler = (handler) => handler;

describe("portal Page Studio subscription endpoint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireClientAuth.mockResolvedValue({
			id: "user-1",
			clientId: "client-1",
		});
		mocks.listPortalPageStudioSubscriptions.mockResolvedValue([
			{ planKey: "starter" },
		]);
	});

	it("uses the authenticated client scope", async () => {
		const { default: handler } = await import(
			"~~/server/api/portal/page-studio/subscriptions.get"
		);
		const event = { context: {} };
		await expect(handler(event as never)).resolves.toEqual({
			subscriptions: [{ planKey: "starter" }],
		});
		expect(mocks.requireClientAuth).toHaveBeenCalledWith(event);
		expect(mocks.listPortalPageStudioSubscriptions).toHaveBeenCalledWith(
			"client-1",
		);
	});

	it("does not query subscriptions when portal authentication fails", async () => {
		mocks.requireClientAuth.mockRejectedValue(
			Object.assign(new Error("denied"), { statusCode: 401 }),
		);
		const { default: handler } = await import(
			"~~/server/api/portal/page-studio/subscriptions.get"
		);
		await expect(handler({ context: {} } as never)).rejects.toMatchObject({
			statusCode: 401,
		});
		expect(mocks.listPortalPageStudioSubscriptions).not.toHaveBeenCalled();
	});
});
