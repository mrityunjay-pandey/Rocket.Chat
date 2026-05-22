import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { VirtualizerHandle } from 'virtua';

import { useScrollAnchor } from './useScrollAnchor';

type MockHandle = {
	scrollOffset: number;
	scrollSize: number;
	viewportSize: number;
	findItemIndex: jest.Mock;
	getItemOffset: jest.Mock;
	scrollTo: jest.Mock;
};

const makeHandle = (overrides: Partial<MockHandle> = {}): MockHandle => ({
	scrollOffset: 0,
	scrollSize: 1000,
	viewportSize: 300,
	findItemIndex: jest.fn((offset: number) => Math.floor(offset / 100)),
	getItemOffset: jest.fn((index: number) => index * 100),
	scrollTo: jest.fn(),
	...overrides,
});

const refTo = (handle: MockHandle): MutableRefObject<VirtualizerHandle | null> => ({ current: handle as unknown as VirtualizerHandle });

const installRaf = () => {
	let nextId = 1;
	const queue = new Map<number, FrameRequestCallback>();
	const originalRaf = globalThis.requestAnimationFrame;
	const originalCancel = globalThis.cancelAnimationFrame;
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
		const id = nextId++;
		queue.set(id, cb);
		return id;
	}) as typeof requestAnimationFrame;
	globalThis.cancelAnimationFrame = ((id: number) => {
		queue.delete(id);
	}) as typeof cancelAnimationFrame;
	return {
		flush: () => {
			const next = queue.entries().next().value;
			if (next) {
				const [id, cb] = next;
				queue.delete(id);
				cb(0);
			}
		},
		uninstall: () => {
			globalThis.requestAnimationFrame = originalRaf;
			globalThis.cancelAnimationFrame = originalCancel;
			queue.clear();
		},
	};
};

describe('useScrollAnchor', () => {
	let raf: ReturnType<typeof installRaf>;

	beforeEach(() => {
		raf = installRaf();
	});

	afterEach(() => {
		raf.uninstall();
	});

	it('restores the top-visible item when scrollSize changes', () => {
		const handle = makeHandle({ scrollOffset: 723.5 });
		// findItemIndex(723.5) = 7; getItemOffset(7) = 700 → captured subOffset = 23.5.

		const { result } = renderHook(() =>
			useScrollAnchor({ virtualizerRef: refTo(handle), isAtBottom: { current: false }, suppress: false }),
		);

		act(() => {
			result.current.updateTopAnchor();
		});
		act(() => raf.flush()); // baseline; sets `lastScrollSize`

		// Items above grew: item 7 now starts at 740, scrollSize bumped.
		handle.getItemOffset.mockImplementation((index: number) => (index === 7 ? 740 : index * 100));
		handle.scrollSize = 1100;
		act(() => raf.flush());

		expect(handle.scrollTo).toHaveBeenCalledWith(763.5); // 740 + 23.5
	});

	it('re-pins to the new bottom when isAtBottom is true', () => {
		const handle = makeHandle();
		renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), isAtBottom: { current: true }, suppress: false }));

		act(() => raf.flush()); // baseline
		handle.scrollSize = 1500; // items grew
		act(() => raf.flush());

		expect(handle.scrollTo).toHaveBeenCalledWith(1200); // 1500 - 300 viewport
	});

	it('respects the suppress flag and resumes when it flips back', () => {
		const handle = makeHandle();
		// Stable refs across rerenders so the hook's effect isn't torn down on prop change.
		const virtualizerRef = refTo(handle);
		const isAtBottom = { current: true };
		const { rerender } = renderHook(({ suppress }) => useScrollAnchor({ virtualizerRef, isAtBottom, suppress }), {
			initialProps: { suppress: true },
		});

		act(() => raf.flush()); // baseline
		handle.scrollSize = 1500;
		act(() => raf.flush()); // suppressed → no scrollTo

		expect(handle.scrollTo).not.toHaveBeenCalled();

		rerender({ suppress: false });
		handle.scrollSize = 1800;
		act(() => raf.flush()); // now allowed

		expect(handle.scrollTo).toHaveBeenCalledWith(1500); // 1800 - 300
	});

	it('cancels the requestAnimationFrame loop on unmount', () => {
		const handle = makeHandle();
		const { unmount } = renderHook(() =>
			useScrollAnchor({ virtualizerRef: refTo(handle), isAtBottom: { current: false }, suppress: false }),
		);

		act(() => raf.flush()); // baseline
		unmount();

		handle.scrollSize = 9999;
		act(() => raf.flush());

		expect(handle.scrollTo).not.toHaveBeenCalled();
	});
});
