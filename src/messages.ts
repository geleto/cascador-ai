import { ModelMessage, ToolSet } from 'ai';
import type { GenerateTextResult, StreamTextResult } from 'ai';
import type { GenerateTextResultAugmented, StreamTextResultAugmented } from './types/result';

// Helper function to augment a response object with messages and messageHistory
function augmentResponseObject(
	responseObject: any,
	prefixForMessages: ModelMessage[] | undefined,
	historyPrefix: ModelMessage[] | undefined,
	originalMessages: ModelMessage[]
): void {
	let cachedMessages: ModelMessage[] | undefined;
	let cachedMessageHistory: ModelMessage[] | undefined;

	// Override the messages property with a lazy, memoized getter
	Object.defineProperty(responseObject, 'messages', {
		get() {
			if (cachedMessages !== undefined) return cachedMessages;
			const head = prefixForMessages ?? [];
			cachedMessages = [...head, ...originalMessages];
			return cachedMessages;
		},
		enumerable: true,
		configurable: true
	});

	// Add the messageHistory property
	Object.defineProperty(responseObject, 'messageHistory', {
		get() {
			if (cachedMessageHistory !== undefined) return cachedMessageHistory;
			const historyHead = historyPrefix ?? [];
			const head = prefixForMessages ?? [];
			cachedMessageHistory = [...historyHead, ...head, ...originalMessages];
			return cachedMessageHistory;
		},
		enumerable: true,
		configurable: true
	});
}

export function augmentGenerateText<TOOLS extends ToolSet = ToolSet, OUTPUT = string>(
	result: GenerateTextResult<TOOLS, OUTPUT>,
	prefixForMessages: ModelMessage[] | undefined,
	historyPrefix: ModelMessage[] | undefined,
): GenerateTextResultAugmented<TOOLS, OUTPUT> {
	// Get the actual response object that the getter returns
	const actualResponse = result.steps[result.steps.length - 1].response;

	// Store the original messages before we override them
	const originalMessages = actualResponse.messages;

	// Augment the response object
	augmentResponseObject(actualResponse, prefixForMessages, historyPrefix, originalMessages);

	return result as GenerateTextResultAugmented<TOOLS, OUTPUT>;
}

export function augmentStreamText<TOOLS extends ToolSet = ToolSet, PARTIAL = string>(
	result: StreamTextResult<TOOLS, PARTIAL>,
	prefixForMessages: ModelMessage[] | undefined,
	historyPrefix: ModelMessage[] | undefined,
): StreamTextResultAugmented<TOOLS, PARTIAL> {
	// We need to modify the response when it becomes available
	let cachedResponsePromise: Promise<ResponseWithMessages> | undefined;

	// Helper type to extract the resolved response type from the promise that has messages
	type ResponseWithMessages = StreamTextResult<TOOLS, PARTIAL>['response'] extends Promise<infer R>
		? R
		: never;

	// Capture the original response promise before overriding the getter to avoid recursion
	const originalResponsePromise = result.response as unknown as Promise<ResponseWithMessages>;

	const getAugmentedResponse = (): Promise<ResponseWithMessages> => {
		cachedResponsePromise ??= originalResponsePromise
			.then((resolvedResponse: ResponseWithMessages) => {
				// Store the original messages before we override them
				const originalMessages = resolvedResponse.messages as unknown as ModelMessage[];

				// Augment the response object
				augmentResponseObject(resolvedResponse, prefixForMessages, historyPrefix, originalMessages);

				return resolvedResponse;
			});
		return cachedResponsePromise;
	};

	// Override the response getter to return our augmented promise
	Object.defineProperty(result, 'response', {
		get() {
			return getAugmentedResponse();
		},
		enumerable: true,
		configurable: true
	});

	return result as StreamTextResultAugmented<TOOLS, PARTIAL>;
}

// Helper to create a copy of messages and append the prompt as a user message when available
export function buildMessagesWithPrompt(existing: ModelMessage[] | undefined, promptToAppend?: string): ModelMessage[] | undefined {
	if (!existing) return undefined;
	const messagesCopy = existing.slice();
	if (typeof promptToAppend === 'string' && promptToAppend.length > 0) {
		messagesCopy.push({ role: 'user', content: promptToAppend } as ModelMessage);
	}
	return messagesCopy;
}
