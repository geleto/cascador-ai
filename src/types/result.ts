import {
	GenerateObjectResult, StreamObjectResult, JSONValue, DeepPartial,
} from 'ai';
import type {
	GenerateTextResult as BaseGenerateTextResult,
	StreamTextResult as BaseStreamTextResult,
	ToolCallOptions,
	ToolSet,
} from 'ai';
import { SchemaType } from './types';

// Result types
export type {
	// Keep object-related exports as-is
} from 'ai';

export type ScriptResult = JSONValue;//@todo - remove, RESULT can be any type (union, etc...)

// Augmented text result types with lazy messageHistory
export type GenerateTextResultAugmented<TOOLS extends ToolSet = ToolSet, OUTPUT = string> =
	BaseGenerateTextResult<TOOLS, OUTPUT> & {
		response: BaseGenerateTextResult<TOOLS, OUTPUT>['response'] & {
			messageHistory: BaseGenerateTextResult<TOOLS, OUTPUT>['response']['messages'];
		};
	};

export type StreamTextResultAugmented<TOOLS extends ToolSet = ToolSet, PARTIAL = string> =
	BaseStreamTextResult<TOOLS, PARTIAL> & {
		response: BaseStreamTextResult<TOOLS, PARTIAL>['response'] extends Promise<infer R extends { messages: readonly unknown[] }>
		? Promise<R & { messageHistory: R['messages'] }>
		: BaseStreamTextResult<TOOLS, PARTIAL>['response'];
	};

//these are returned in a Promise
export type GenerateObjectResultAll<
	OUTPUT, //@out
	ENUM extends string = string
> =
	| GenerateObjectObjectResult<OUTPUT>
	| GenerateObjectArrayResult<OUTPUT>
	| GenerateObjectEnumResult<ENUM>
	| GenerateObjectNoSchemaResult;

export type GenerateObjectObjectResult<OUTPUT> = GenerateObjectResult<OUTPUT>;
export type GenerateObjectArrayResult<OUTPUT> = GenerateObjectResult<OUTPUT[]>;
export type GenerateObjectEnumResult<ENUM extends string> = GenerateObjectResult<ENUM>;
export type GenerateObjectNoSchemaResult = GenerateObjectResult<JSONValue>;

export type StreamObjectResultAll<OUTPUT> =
	| StreamObjectObjectResult<OUTPUT>
	| StreamObjectArrayResult<OUTPUT>
	| StreamObjectNoSchemaResult;

//These are returned as is without a promise, many of the properties are promises,
//this allows accessing individual fields as they arrive, rather than waiting for the entire object to complete.
export type StreamObjectObjectResult<OUTPUT> = StreamObjectResult<DeepPartial<OUTPUT>, OUTPUT, never>;
export type StreamObjectArrayResult<OUTPUT> = StreamObjectResult<OUTPUT[], OUTPUT[], AsyncIterableStream<OUTPUT>>;
export type StreamObjectNoSchemaResult = StreamObjectResult<JSONValue, JSONValue, never>;

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>;

export interface RendererTool<INPUT, OUTPUT> {
	description?: string;
	inputSchema: SchemaType<INPUT>;
	execute: (args: INPUT, options: ToolCallOptions) => PromiseLike<OUTPUT>;
	type?: 'function';
}