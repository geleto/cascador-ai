import {
	GenerateObjectResult, StreamObjectResult, JSONValue, DeepPartial,
} from 'ai';
import type {
	GenerateTextResult as BaseGenerateTextResult,
	StreamTextResult as BaseStreamTextResult,
	ToolSet,
} from 'ai';

// Result types
export type {
	// Keep object-related exports as-is
} from 'ai';

export type ScriptResult = JSONValue;//Record<string, any> | string | null;

// Augmented text result types with lazy messageHistory
export type GenerateTextResultAugmented<TOOLS extends ToolSet = ToolSet, OUTPUT = never> =
	BaseGenerateTextResult<TOOLS, OUTPUT> & {
		response: BaseGenerateTextResult<TOOLS, OUTPUT>['response'] & {
			messageHistory: BaseGenerateTextResult<TOOLS, OUTPUT>['response']['messages'];
		};
	};

export type StreamTextResultAugmented<TOOLS extends ToolSet = ToolSet, PARTIAL = never> =
	BaseStreamTextResult<TOOLS, PARTIAL> & {
		response: BaseStreamTextResult<TOOLS, PARTIAL>['response'] extends Promise<infer R extends { messages: readonly unknown[] }>
		? Promise<R & { messageHistory: R['messages'] }>
		: BaseStreamTextResult<TOOLS, PARTIAL>['response'];
	};

//these are returned in a Promise
export type GenerateObjectResultAll<OBJECT, ENUM extends string, ELEMENT> =
	| GenerateObjectObjectResult<OBJECT>
	| GenerateObjectArrayResult<ELEMENT>
	| GenerateObjectEnumResult<ENUM>
	| GenerateObjectNoSchemaResult;

export type GenerateObjectObjectResult<OBJECT> = GenerateObjectResult<OBJECT>;
export type GenerateObjectArrayResult<ELEMENT> = GenerateObjectResult<ELEMENT[]>;
export type GenerateObjectEnumResult<ENUM extends string> = GenerateObjectResult<ENUM>;
export type GenerateObjectNoSchemaResult = GenerateObjectResult<JSONValue>;

export type StreamObjectResultAll<OBJECT, ELEMENT> =
	| StreamObjectObjectResult<OBJECT>
	| StreamObjectArrayResult<ELEMENT>
	| StreamObjectNoSchemaResult;

//These are returned as is without a promise, many of the properties are promises,
//this allows accessing individual fields as they arrive, rather than waiting for the entire object to complete.
export type StreamObjectObjectResult<OBJECT> = StreamObjectResult<DeepPartial<OBJECT>, OBJECT, never>;
export type StreamObjectArrayResult<ELEMENT> = StreamObjectResult<ELEMENT[], ELEMENT[], AsyncIterableStream<ELEMENT>>;
export type StreamObjectNoSchemaResult = StreamObjectResult<JSONValue, JSONValue, never>;

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>;