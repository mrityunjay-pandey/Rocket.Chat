import type { IMessage } from '@rocket.chat/core-typings';
import { isThreadMainMessage, isThreadMessage } from '@rocket.chat/core-typings';
import { useEndpoint, useSearchParameter } from '@rocket.chat/ui-contexts';
import { useQuery } from '@tanstack/react-query';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect } from 'react';
import type { WindowVirtualizerHandle } from 'virtua';

import { useIsItemVisible } from './useIsItemVisible';
import { RoomHistoryManager } from '../../../../../app/ui-utils/client';
import { messagesQueryKeys } from '../../../../lib/queryKeys';
import { mapMessageFromApi } from '../../../../lib/utils/mapMessageFromApi';
import { setMessageJumpQueryStringParameter } from '../../../../lib/utils/setMessageJumpQueryStringParameter';
import { clearHighlightMessage, setHighlightMessage } from '../providers/messageHighlightSubscription';

type UseTryToJumpToMessageProps = {
	rid: string;
	virtualizerRef: MutableRefObject<WindowVirtualizerHandle | null>;
	setIsJumpingToMessage: Dispatch<SetStateAction<boolean>>;
	messages: IMessage[];
	indexOffset?: number;
};

const useTryToJumpToMessage = ({ rid, virtualizerRef, setIsJumpingToMessage, messages, indexOffset = 0 }: UseTryToJumpToMessageProps) => {
	const messageJumpParam = useSearchParameter('msg');
	const isItemVisible = useIsItemVisible();

	const getMessage = useEndpoint('GET', '/v1/chat.getMessage');

	const { data: message } = useQuery({
		queryKey: messageJumpParam ? messagesQueryKeys.message(messageJumpParam) : [],
		queryFn: async () => {
			if (!messageJumpParam) return null;
			const { message } = await getMessage({ msgId: messageJumpParam });
			return mapMessageFromApi(message);
		},
		enabled: !!messageJumpParam,
	});

	useEffect(() => {
		if (!messageJumpParam) {
			setIsJumpingToMessage(false);
			return;
		}
		if (!message) {
			return;
		}
		// Thread deep links are handled by useTryToJumpToThreadMessage; do not use the main list virtualizer
		// If tshow is true, there is a preview on the main list, in this case we scroll to it
		if (message && isThreadMessage(message) && !isThreadMainMessage(message) && message.tshow !== true) {
			setIsJumpingToMessage(false);
			return;
		}

		if (!virtualizerRef.current) {
			return;
		}

		setIsJumpingToMessage(true);

		if (RoomHistoryManager.isLoading(rid) || messages.length === 0) {
			return;
		}

		const loadedMessage = messages.find((message) => message._id === messageJumpParam);
		if (!loadedMessage) {
			if (message) {
				RoomHistoryManager.getSurroundingChannelMessages(message);
			}
			return;
		}

		// If the target is a thread-reply broadcast (the "also send to channel" copy),
		// the click opens the thread separately — don't shift the main channel position.
		if (isThreadMessage(loadedMessage) && !isThreadMainMessage(loadedMessage)) {
			setIsJumpingToMessage(false);
			return;
		}

		const messageIndex = messages.indexOf(loadedMessage);
		const virtualizerIndex = messageIndex + indexOffset;

		// Already visible — just highlight, no scroll needed.
		const handle = virtualizerRef.current;
		if (handle && !isItemVisible(handle, virtualizerIndex)) {
			handle.scrollToIndex(virtualizerIndex, {
				align: 'center',
			});
		}

		setHighlightMessage(loadedMessage._id);

		setTimeout(() => {
			clearHighlightMessage();
		}, 2000);

		setTimeout(() => {
			setIsJumpingToMessage(false);
			setMessageJumpQueryStringParameter(null);
		}, 500);
	}, [messageJumpParam, virtualizerRef, setIsJumpingToMessage, rid, messages, message, isItemVisible, indexOffset]);
};

export default useTryToJumpToMessage;
