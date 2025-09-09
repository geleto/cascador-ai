import { z } from 'zod';
import { SchemaType } from './types';
import { Schema } from 'ai';

//export type Override<A, B> = Omit<A, keyof B> & B;
export type Override<A, B> = {
	[K in keyof A | keyof B]: K extends keyof B
	? B[K] extends never
	? K extends keyof A ? A[K] : never
	: B[K]
	: K extends keyof A ? A[K] : never;
};

// Ensures T is an exact match of one of the union members in U
// Prevents extra properties and mixing properties from different union types
export type StrictUnionSubtype<T, U> = U extends any
	? T extends U
	? Exclude<keyof T, keyof U> extends never ? T : never
	: never
	: never;

// Ensures T has exactly the same properties as Shape (no extra properties). Returns never if T is not a strict subtype of Shape.
export type StrictType<T, Shape> = T extends Shape
	? keyof T extends keyof Shape ? T : never
	: never;

// Helper to get keys as a string array for the error message
export type KeysToStringArray<T> = T extends readonly [infer F, ...infer R] ? [F & string, ...KeysToStringArray<R>] : [];

// Helper to infer inputSchema from the schema
/*export type InferParameters<T extends SchemaType<any>> = T extends z.ZodTypeAny
	? z.infer<T>
	: T extends { inputSchema: z.ZodTypeAny }
	? z.infer<T['inputSchema']>
	: any;*/

// Helper to infer the output type from a Zod or Vercel AI Schema, the vercel
export type InferParameters<T extends SchemaType<any>> = T extends z.ZodTypeAny
	? z.infer<T> // It's a Zod schema, use z.infer
	: T extends Schema<infer U> // It's a Vercel AI Schema, infer the inner type U
	? U
	: unknown; // Fallback to a safe unknown type

export type EnsurePromise<T> = T extends Promise<any> ? T : Promise<T>;

export type ConditionalPromise<T, IsAsync extends boolean> = IsAsync extends true ? Promise<T> : T;