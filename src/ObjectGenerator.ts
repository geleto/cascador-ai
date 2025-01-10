import { generateObject, JSONValue } from 'ai';
import { ObjectGeneratorConfig, GenerateObjectReturn, GenerateObjectConfig } from './types';
import { LLMRenderer } from './LLMRenderer';
import { z } from 'zod';

type ObjectType<OBJECT> =
	| { output: 'object'; schema: z.Schema<OBJECT, z.ZodTypeDef, any> }
	| { output: 'array'; schema: z.Schema<OBJECT, z.ZodTypeDef, any> }
	| { output: 'enum'; enum: Array<OBJECT> }
	| { output: 'no-schema' };

// Helper to infer the OBJECT type from configuration
type InferObjectType<T extends ObjectType<any>> =
	T['output'] extends 'object'
	? z.infer<Extract<T, { output: 'object' }>['schema']>
	: T['output'] extends 'array'
	? z.infer<Extract<T, { output: 'array' }>['schema']>[]
	: T['output'] extends 'enum'
	? Extract<T, { output: 'enum' }>['enum'][number]
	: JSONValue;


export class ObjectGenerator<T> extends LLMRenderer<ObjectGeneratorConfig, GenerateObjectReturn<T>> {
	protected async callLLMFunction(config: ObjectGeneratorConfig): Promise<GenerateObjectReturn<T>> {
		return generateObject(config);
	}
}