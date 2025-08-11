import {
	GenerateObjectResult, StreamObjectResult, JSONValue, DeepPartial,
} from 'ai';

// Result types
export type {
	GenerateTextResult,
	StreamTextResult
} from 'ai';

export type ScriptResult = JSONValue;//Record<string, any> | string | null;

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