import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { VirtualizerHandle } from 'virtua';

import { useScrollAnchor } from './useScrollAnchor';

describe('useScrollAnchor', () => {
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

		const makeHandle = (over: Partial<MockHandle> = {}): MockHandle => ({
			scrollOffset: 700,
			scrollSize: 1000,
			viewportSize: 300,
			findItemIndex: jest.fn(() => 7),
			getItemOffset: jest.fn(() => 700),
			scrollTo: jest.fn(),
			scrollToIndex: jest.fn(),
			...over,
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

		it('captures at-bottom on a settled frame and pins to bottom on a scrollSize change', () => {
			const handle = makeHandle({ scrollOffset: 700, scrollSize: 1000, viewportSize: 300 });
			renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false }));

			tick(); // first frame: no baseline yet
			tick(); // settled -> capture at-bottom (700 + 300 >= 1000 - 4)
			handle.scrollSize = 1500;
			tick(); // scrollSize changed -> pin-bottom via scrollToIndex(last, 'end')

			expect(handle.scrollToIndex).toHaveBeenCalledWith(7, { align: 'end' });
		});

		it('pins to bottom on a viewport-height change even when scrollSize is unchanged', () => {
			// A pure height resize changes viewportSize but not scrollSize; the restore must
			// still fire, or the newest message drifts below the fold.
			const handle = makeHandle({ scrollOffset: 700, scrollSize: 1000, viewportSize: 300 });
			renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false }));

			tick(); // baseline
			tick(); // settled -> capture at-bottom
			handle.viewportSize = 200; // window got shorter; scrollSize stays 1000
			tick(); // viewportSize changed -> pin-bottom

			expect(handle.scrollToIndex).toHaveBeenCalledWith(7, { align: 'end' });
		});

		it('pins to bottom on a change when pinToBottom is set, even if not at bottom', () => {
			// e.g. just sent a message (shouldJumpToBottom): a late-loading video grows while
			// the user is being scrolled to the bottom; we must follow it down, not top-anchor.
			const handle = makeHandle({ scrollOffset: 200, scrollSize: 1000, viewportSize: 300 });
			renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false, pinToBottom: true }));

			tick(); // baseline
			tick(); // settled, NOT at bottom -> wasAtBottom false
			handle.scrollSize = 1500;
			tick(); // changed -> pinToBottom forces pin-bottom despite wasAtBottom false

			expect(handle.scrollToIndex).toHaveBeenCalledWith(7, { align: 'end' });
		});

		it('captures not-at-bottom on a settled frame and restores the top anchor on a change', () => {
			const handle = makeHandle({ scrollOffset: 723.5, scrollSize: 5000, viewportSize: 300, getItemOffset: jest.fn(() => 700) });
			const { result } = renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false }));

			act(() => {
				result.current.updateTopAnchor(); // capture the top anchor: index 7, subOffset 23.5
			});

			tick(); // baseline
			tick(); // settled -> capture not-at-bottom (723.5 + 300 < 5000 - 4)
			handle.scrollSize = 5100;
			tick(); // changed -> top-anchor

			expect(handle.scrollToIndex).toHaveBeenCalledWith(7, { align: 'start', offset: 23.5 });
		});

		it('freezes at-bottom through a change instead of recomputing from mid-change geometry', () => {
			// The regression. A resize re-wraps content and grows scrollSize before scrollTop
			// follows, so live geometry reads "not at bottom" exactly when it changes. The
			// captured (settled) at-bottom must be held through the change so we still pin.
			const handle = makeHandle({ scrollOffset: 200, scrollSize: 1000, viewportSize: 300 });
			renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false }));

			tick(); // baseline
			tick(); // settled, NOT at bottom -> capture false
			handle.scrollOffset = 700; // user scrolls to the bottom
			tick(); // settled at bottom -> capture true

			handle.scrollSize = 1500; // content grows; live now reads 700 + 300 < 1500 ("not at bottom")
			tick(); // changed -> no recapture -> still pins because at-bottom was frozen true

			expect(handle.scrollToIndex).toHaveBeenCalledWith(7, { align: 'end' });
		});

		it('skips the decision while suppress is true and resumes when it flips false', () => {
			const handle = makeHandle({ scrollOffset: 700, scrollSize: 1000, viewportSize: 300 });
			const virtualizerRef = refTo(handle);
			const { rerender } = renderHook(({ suppress }) => useScrollAnchor({ virtualizerRef, suppress }), {
				initialProps: { suppress: true },
			});

			tick(); // baseline
			tick(); // settled -> capture at-bottom
			handle.scrollSize = 1500;
			tick(); // changed, but suppressed

			expect(handle.scrollToIndex).not.toHaveBeenCalled();

			rerender({ suppress: false });
			handle.scrollSize = 1800;
			tick(); // changed, suppress released -> pin-bottom

			expect(handle.scrollToIndex).toHaveBeenCalledWith(7, { align: 'end' });
		});

		it('cancels the rAF loop on unmount', () => {
			const handle = makeHandle();
			const { unmount } = renderHook(() => useScrollAnchor({ virtualizerRef: refTo(handle), suppress: false }));

			tick(); // baseline
			unmount();

			handle.scrollSize = 9999;
			act(() => {
				jest.runOnlyPendingTimers();
			});

			expect(handle.scrollTo).not.toHaveBeenCalled();
			expect(handle.scrollToIndex).not.toHaveBeenCalled();
		});
	});
});
