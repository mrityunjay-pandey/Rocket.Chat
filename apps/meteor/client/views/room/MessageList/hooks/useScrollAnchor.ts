import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { VirtualizerHandle } from 'virtua';

type UseScrollAnchorProps = {
	virtualizerRef: MutableRefObject<VirtualizerHandle | null>;
	// When true, another scroll program owns the position — we step aside.
	suppress: boolean;
};

type RestoreAction = {
	kind: 'pin-bottom' | 'top-anchor';
	index: number;
	offset: number;
};

export const decideRestore = (
	handle: Pick<VirtualizerHandle, 'scrollOffset' | 'scrollSize' | 'viewportSize'>,
	lastScrollSize: number | null,
	topAnchor: { index: number; subOffset: number },
): RestoreAction | null => {
	if (lastScrollSize === null || lastScrollSize === handle.scrollSize) {
		return null;
	}
	// Compute at-bottom from scroll math; an `isAtBottom` ref would be stale here
	// because scroll events don't fire during a pure resize.
	const wasAtBottom = handle.scrollOffset + handle.viewportSize >= lastScrollSize;
	if (wasAtBottom) {
		return { kind: 'pin-bottom', index: 0, offset: Math.max(0, handle.scrollSize - handle.viewportSize) };
	}
	return { kind: 'top-anchor', index: topAnchor.index, offset: topAnchor.subOffset };
};

/**
 * Virtua-aware replacement for the browser's CSS Scroll Anchoring. Polls
 * `handle.scrollSize` each frame; when it changes, restores the user's visible
 * position via `handle.scrollToIndex()` — virtua re-measures internally, so we
 * don't have to wait for offsets to settle.
 *
 * Callers must invoke `updateTopAnchor` from `onScroll`; it returns the top item's
 * index so the caller can reuse it.
 */
export const useScrollAnchor = ({ virtualizerRef, suppress }: UseScrollAnchorProps) => {
	const topAnchorRef = useRef<{ index: number; subOffset: number }>({ index: 0, subOffset: 0 });
	const suppressRef = useRef(suppress);
	suppressRef.current = suppress;

	useEffect(() => {
		let lastScrollSize: number | null = null;

		const tick = () => {
			const handle = virtualizerRef.current;
			if (handle) {
				if (!suppressRef.current) {
					const action = decideRestore(handle, lastScrollSize, topAnchorRef.current);
					if (action) {
						if (action.kind === 'pin-bottom') {
							handle.scrollTo(action.offset);
						} else {
							handle.scrollToIndex(action.index, { align: 'start', offset: action.offset });
						}
					}
				}
				lastScrollSize = handle.scrollSize;
			}
			rafId = requestAnimationFrame(tick);
		};

		let rafId = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(rafId);
	}, [virtualizerRef]);

	const updateTopAnchor = (): number => {
		const handle = virtualizerRef.current;
		if (!handle) {
			return 0;
		}
		const index = handle.findItemIndex(handle.scrollOffset);
		if (index < 0) {
			return 0;
		}
		topAnchorRef.current = {
			index,
			subOffset: handle.scrollOffset - handle.getItemOffset(index),
		};
		return index;
	};

	return { updateTopAnchor };
};
