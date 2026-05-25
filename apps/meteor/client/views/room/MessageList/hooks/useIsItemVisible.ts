import { useCallback } from 'react';

/** Minimal shape needed from a virtua handle — matches both `VirtualizerHandle` and `WindowVirtualizerHandle`. */
type ItemVisibilityHandle = {
	readonly scrollOffset: number;
	readonly viewportSize: number;
	getItemOffset(index: number): number;
	getItemSize(index: number): number;
};

/**
 * Returns a checker for whether the item at `index` is fully visible inside the given
 * virtualizer's viewport. Uses the virtualizer handle as the single source of truth — no
 * DOM queries. Useful for skipping scroll programs when the target is already on screen.
 */
export const useIsItemVisible = () => {
	return useCallback((handle: ItemVisibilityHandle, index: number): boolean => {
		if (index < 0) {
			return false;
		}
		const itemTop = handle.getItemOffset(index);
		const itemBottom = itemTop + handle.getItemSize(index);
		return itemTop >= handle.scrollOffset && itemBottom <= handle.scrollOffset + handle.viewportSize;
	}, []);
};
