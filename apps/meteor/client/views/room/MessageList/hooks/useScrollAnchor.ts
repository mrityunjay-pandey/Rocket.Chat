import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { VirtualizerHandle } from 'virtua';

type UseScrollAnchorProps = {
	virtualizerRef: MutableRefObject<VirtualizerHandle | null>;
	isAtBottom: MutableRefObject<boolean>;
	// When true, another scroll program owns the position — we step aside.
	suppress: boolean;
};

/**
 * Virtua-aware replacement for the browser's CSS Scroll Anchoring. Polls
 * `handle.scrollSize` each frame; when it changes, restores the user's visible position
 * via `handle.scrollTo()` — to the new bottom if `isAtBottom`, otherwise to the
 * previously top-visible item.
 *
 * Callers must invoke `updateTopAnchor` from `onScroll`; it returns the top item's
 * index so the caller can reuse it. See `lib/SCROLL_ANCHORING.md` for full rationale.
 */
export const useScrollAnchor = ({ virtualizerRef, isAtBottom, suppress }: UseScrollAnchorProps) => {
	const topAnchorRef = useRef<{ index: number; subOffset: number }>({ index: 0, subOffset: 0 });
	const suppressRef = useRef(suppress);
	suppressRef.current = suppress;

	useEffect(() => {
		let rafId: number | null = null;
		let lastScrollSize: number | null = null;

		const tick = () => {
			const handle = virtualizerRef.current;
			if (handle) {
				const currentSize = handle.scrollSize;
				if (lastScrollSize !== null && lastScrollSize !== currentSize && !suppressRef.current) {
					if (isAtBottom.current) {
						handle.scrollTo(Math.max(0, currentSize - handle.viewportSize));
					} else {
						const { index, subOffset } = topAnchorRef.current;
						handle.scrollTo(handle.getItemOffset(index) + subOffset);
					}
				}
				lastScrollSize = currentSize;
			}
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);

		return () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
			}
		};
	}, [isAtBottom, virtualizerRef]);

	const updateTopAnchor = (): number => {
		const handle = virtualizerRef.current;
		if (!handle) {
			return 0;
		}
		const index = handle.findItemIndex(handle.scrollOffset);
		topAnchorRef.current = {
			index,
			subOffset: handle.scrollOffset - handle.getItemOffset(index),
		};
		return index;
	};

	return { updateTopAnchor };
};
