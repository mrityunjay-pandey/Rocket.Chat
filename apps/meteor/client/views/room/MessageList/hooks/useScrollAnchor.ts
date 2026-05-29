import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { VirtualizerHandle } from 'virtua';

type UseScrollAnchorProps = {
	virtualizerRef: MutableRefObject<VirtualizerHandle | null>;
	// When true, another scroll program owns the position — we step aside.
	suppress: boolean;
	pinToBottom?: boolean;
};

/**
 * Virtua-aware scroll anchoring: on a content- or viewport-size change, pins to the
 * bottom if the user was there, else holds the top-visible item. At-bottom is captured
 * only on settled frames — virtua's sizes swing mid-resize and would falsely read "at
 * bottom". Callers must call `updateTopAnchor` from `onScroll`.
 */
export const useScrollAnchor = ({ virtualizerRef, suppress, pinToBottom = false }: UseScrollAnchorProps) => {
	const topAnchorRef = useRef<{ index: number; subOffset: number }>({ index: 0, subOffset: 0 });
	const wasAtBottomRef = useRef<boolean | null>(null);
	const suppressRef = useRef(suppress);
	suppressRef.current = suppress;
	const pinToBottomRef = useRef(pinToBottom);
	pinToBottomRef.current = pinToBottom;

	useEffect(() => {
		let lastScrollSize: number | null = null;
		let lastViewportSize: number | null = null;

		const tick = () => {
			const handle = virtualizerRef.current;
			if (handle) {
				if (lastScrollSize !== null) {
					const changed = handle.scrollSize !== lastScrollSize || handle.viewportSize !== lastViewportSize;
					if (!changed) {
						// "at bottom" = scrollOffset reached its max (scrollSize - viewportSize). That max is
						// fractional but scrollOffset is a whole pixel, so floor it, otherwise the comparison
						// is off by a sub-pixel and never matches.
						wasAtBottomRef.current = handle.scrollOffset >= Math.floor(handle.scrollSize - handle.viewportSize);
					} else if (!suppressRef.current) {
						if (pinToBottomRef.current || wasAtBottomRef.current === true) {
							// Pin via the last item, not a raw scrollTo: virtua clamps a scrollTo to its content
							// height, which stops short of the padded bottom and clips the newest message.
							handle.scrollToIndex(Math.max(0, handle.findItemIndex(handle.scrollSize)), { align: 'end' });
						} else if (wasAtBottomRef.current === false) {
							const { index, subOffset } = topAnchorRef.current;
							handle.scrollToIndex(index, { align: 'start', offset: subOffset });
						}
					}
				}

				lastScrollSize = handle.scrollSize;
				lastViewportSize = handle.viewportSize;
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
