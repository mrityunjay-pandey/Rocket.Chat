import { renderHook } from '@testing-library/react';
import type { VirtualizerHandle } from 'virtua';

import { useIsItemVisible } from './useIsItemVisible';

// `makeHandle` defaults: every item is 50px tall, item N starts at pixel N*50.
// So item 4 spans pixels 200-250, item 7 spans 350-400, etc.
// scrollOffset and viewportSize are 0 / 300 unless a test overrides them.
const makeHandle = (overrides: Partial<Record<keyof VirtualizerHandle, unknown>> = {}): VirtualizerHandle =>
	({
		scrollOffset: 0,
		scrollSize: 1000,
		viewportSize: 300,
		getItemOffset: (index: number) => index * 50,
		getItemSize: () => 50,
		findItemIndex: () => 0,
		scrollToIndex: () => undefined,
		scrollTo: () => undefined,
		scrollBy: () => undefined,
		cache: {} as never,
		...overrides,
	}) as unknown as VirtualizerHandle;

describe('useIsItemVisible', () => {
	it('returns true when the item is fully inside the viewport', () => {
		// scrollOffset 100, viewport covers pixels 100-400; item 4 (200-250) is fully inside.
		const handle = makeHandle({ scrollOffset: 100 });
		const { result } = renderHook(() => useIsItemVisible());
		expect(result.current(handle, 4)).toBe(true);
	});

	it('returns false when the item overflows the top of the viewport', () => {
		// scrollOffset 200, viewport covers pixels 200-500; item 3 (150-200) sits just above.
		const handle = makeHandle({ scrollOffset: 200 });
		const { result } = renderHook(() => useIsItemVisible());
		expect(result.current(handle, 3)).toBe(false);
	});

	it('returns false when the item overflows the bottom of the viewport', () => {
		// scrollOffset 0, viewport covers pixels 0-300; item 7 (350-400) sits below.
		const handle = makeHandle({ scrollOffset: 0 });
		const { result } = renderHook(() => useIsItemVisible());
		expect(result.current(handle, 7)).toBe(false);
	});

	it('returns false for negative indexes', () => {
		const handle = makeHandle();
		const { result } = renderHook(() => useIsItemVisible());
		expect(result.current(handle, -1)).toBe(false);
	});

	it('returns true when the item is exactly at the viewport edges', () => {
		// scrollOffset 100, viewportSize 50, viewport covers 100-150; item 2 (100-150) fits exactly.
		const handle = makeHandle({ scrollOffset: 100, viewportSize: 50 });
		const { result } = renderHook(() => useIsItemVisible());
		expect(result.current(handle, 2)).toBe(true);
	});
});
