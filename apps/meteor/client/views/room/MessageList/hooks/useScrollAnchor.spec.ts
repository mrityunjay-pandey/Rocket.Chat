import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { VirtualizerHandle } from 'virtua';

import { decideRestore, useScrollAnchor } from './useScrollAnchor';

describe('useScrollAnchor', () => {
	describe('decideRestore', () => {
		// The "top anchor": top-visible item captured before a resize.
		// index = item index; subOffset = pixels into that item where the viewport top sits.
		const anchor = { index: 7, subOffset: 23.5 };

		it('returns null when no decision is needed (first tick, or scrollSize unchanged)', () => {
			// `handle` is a slice of virtua's VirtualizerHandle — all pixels:
			// scrollOffset (current scroll position), scrollSize (total content height), viewportSize (visible area).
			const handle = { scrollOffset: 723.5, scrollSize: 5000, viewportSize: 300 };
			expect(decideRestore(handle, null, anchor)).toBeNull(); // first tick
			expect(decideRestore(handle, 5000, anchor)).toBeNull(); // scrollSize unchanged
		});

		it('returns top-anchor when user is not at bottom and scrollSize changed', () => {
			// distFromBottom = 5000 - 723.5 - 300 = 3976.5, far from bottom.
			const handle = { scrollOffset: 723.5, scrollSize: 5100, viewportSize: 300 };
			expect(decideRestore(handle, 5000, anchor)).toEqual({ kind: 'top-anchor', index: 7, offset: 23.5 });
		});

		it('returns pin-bottom when user was exactly at bottom pre-resize', () => {
			// scrollOffset 700 + viewportSize 300 = 1000 = lastScrollSize, so at bottom.
			const handle = { scrollOffset: 700, scrollSize: 1500, viewportSize: 300 };
			expect(decideRestore(handle, 1000, anchor)).toEqual({ kind: 'pin-bottom', index: 0, offset: 1200 });
		});

		it('returns pin-bottom when scrolled past the apparent bottom (padding case)', () => {
			// scrollOffset 740 + viewportSize 300 = 1040 > lastScrollSize 1000, so at bottom.
			// .messages-list padding lets scrollOffset + viewportSize exceed scrollSize at the visual bottom.
			const handle = { scrollOffset: 740, scrollSize: 1500, viewportSize: 300 };
			expect(decideRestore(handle, 1000, anchor)).toEqual({ kind: 'pin-bottom', index: 0, offset: 1200 });
		});

		it('returns top-anchor when genuinely 10px above the bottom (no fuzzy threshold)', () => {
			// scrollOffset 690 + viewportSize 300 = 990 < lastScrollSize 1000, so not at bottom.
			const handle = { scrollOffset: 690, scrollSize: 1500, viewportSize: 300 };
			expect(decideRestore(handle, 1000, anchor)).toEqual({ kind: 'top-anchor', index: 7, offset: 23.5 });
		});

		it('clamps pin-bottom offset to 0 when scrollSize < viewportSize', () => {
			// New scrollSize 200 - viewportSize 300 = -100, clamp to 0.
			const handle = { scrollOffset: 700, scrollSize: 200, viewportSize: 300 };
			expect(decideRestore(handle, 1000, anchor)).toEqual({ kind: 'pin-bottom', index: 0, offset: 0 });
		});
	});

	describe('hook integration', () => {
		type MockHandle = {
			scrollOffset: number;
			scrollSize: number;
			viewportSize: number;
			findItemIndex: jest.Mock;
			getItemOffset: jest.Mock;
			scrollTo: jest.Mock;
			scrollToIndex: jest.Mock;
		};

		const makeHandle = (): MockHandle => ({
			scrollOffset: 700,
			scrollSize: 1000,
			viewportSize: 300,
			findItemIndex: jest.fn(),
			getItemOffset: jest.fn(),
			scrollTo: jest.fn(),
			scrollToIndex: jest.fn(),
		});

		const refTo = (h: MockHandle): MutableRefObject<VirtualizerHandle | null> => ({ current: h as unknown as VirtualizerHandle });

		// Step the rAF loop one tick at a time; the next rAF the tick re-schedules
		// stays queued for the following call.
		const tick = () => act(() => jest.advanceTimersToNextTimer(1));

		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it('drives the rAF loop and applies the decision on scrollSize change', () => {
			const handle = makeHandle();
			renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false }));

			tick(); // baseline
			handle.scrollSize = 1500;
			tick(); // detects change, user was at bottom, pin-bottom

			expect(handle.scrollTo).toHaveBeenCalledWith(1200); // 1500 - 300
		});

		it('captures the top-visible item via updateTopAnchor and uses it on top-anchor restore', () => {
			const handle: MockHandle = {
				scrollOffset: 723.5,
				scrollSize: 5000,
				viewportSize: 300,
				findItemIndex: jest.fn(() => 7),
				getItemOffset: jest.fn(() => 700),
				scrollTo: jest.fn(),
				scrollToIndex: jest.fn(),
			};
			const { result } = renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false }));

			act(() => {
				result.current.updateTopAnchor();
			});
			// subOffset captured = 723.5 - 700 = 23.5

			tick(); // baseline
			handle.scrollSize = 5100;
			tick(); // change, not at bottom, top-anchor uses captured (7, 23.5)

			expect(handle.scrollToIndex).toHaveBeenCalledWith(7, { align: 'start', offset: 23.5 });
		});

		it('skips the decision while suppress is true and resumes when it flips false', () => {
			const handle = makeHandle();
			const virtualizerRef = refTo(handle);
			const { rerender } = renderHook(({ suppress }) => useScrollAnchor({ virtualizerRef, suppress }), {
				initialProps: { suppress: true },
			});

			tick(); // baseline
			handle.scrollSize = 1500;
			tick(); // change observed, but suppressed

			expect(handle.scrollTo).not.toHaveBeenCalled();

			rerender({ suppress: false });
			handle.scrollOffset = 1200; // re-anchor at the new bottom
			handle.scrollSize = 1800;
			tick(); // change observed, suppress released, pin-bottom

			expect(handle.scrollTo).toHaveBeenCalledWith(1500); // 1800 - 300
		});

		it('cancels the rAF loop on unmount', () => {
			const handle = makeHandle();
			const { unmount } = renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false }));

			tick(); // baseline
			unmount();

			handle.scrollSize = 9999;
			// If cleanup ran, no pending timers; this is a no-op.
			// Otherwise the leaked tick fires and (scrollOffset 0, not at bottom) calls scrollToIndex.
			act(() => {
				jest.runOnlyPendingTimers();
			});

			expect(handle.scrollToIndex).not.toHaveBeenCalled();
		});
	});
});
