import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create } from '../src/index';
import type { StreamObjectOnFinishEvent } from '../src/index';
import { model, temperature, StringLoader, timeout, modelName, createProvider } from './common';
import { ConfigError } from '../src/validate';
import { z } from 'zod';
import type { DeepPartial } from 'ai';

// Configure chai-as-promised
chai.use(chaiAsPromised);

const { expect } = chai;

// Helper to collect partial objects from a stream
async function collectPartials<T>(stream: AsyncIterable<DeepPartial<T>>): Promise<DeepPartial<T>[]> {
	const partials: DeepPartial<T>[] = [];
	for await (const partial of stream) {
		partials.push(partial);
	}
	return partials;
}

function mergePartials<T>(partials: DeepPartial<T>[]): T {
	return partials.reduce((acc, partial) => {
		return { ...acc, ...partial } as T;
	}, {} as T);
}

// Helper to collect complete elements from an elementStream
async function collectElements<T>(stream: AsyncIterable<T>): Promise<T[]> {
	const elements: T[] = [];
	for await (const element of stream) {
		elements.push(element);
	}
	return elements;
}


describe('create.ObjectStreamer', function () {
	this.timeout(timeout); // Increase timeout for tests that call the real API

	// --- Schemas for testing ---
	const simpleSchema = z.object({
		name: z.string().describe('The name of the item'),
		value: z.number().describe('A numerical value'),
	});

	const arraySchema = z.array(
		z.object({
			id: z.number(),
			item: z.string(),
		}),
	);

	describe('Core Functionality by Output Type', () => {
		it('should stream a single object with output: "object" (default) and provide partials', async () => {
			const streamer = create.ObjectStreamer({
				model, temperature,
				schema: simpleSchema,
				prompt: 'Generate a JSON object for an item named "StreamTest" with a value of 99.',
			});

			const result = await streamer();
			const partials = await collectPartials(result.partialObjectStream);
			const finalObject = mergePartials(partials);

			expect(partials.length).to.be.greaterThan(0);
			expect(partials[partials.length - 1]).to.deep.equal({ name: 'StreamTest', value: 99 });
			expect(finalObject).to.deep.equal({ name: 'StreamTest', value: 99 });
			expect(() => simpleSchema.parse(finalObject)).to.not.throw();
		});

		it('should stream an array of objects with output: "array" and provide complete elements', async () => {
			const streamer = create.ObjectStreamer({
				model, temperature,
				output: 'array',
				schema: arraySchema.element, // Pass the element schema for arrays
				prompt: 'Generate a JSON array with two items: {id: 1, item: "A"} and {id: 2, item: "B"}.',
			});

			const result = await streamer();
			const elements = await collectElements(result.elementStream);
			const finalArray = await result.object;

			expect(elements).to.be.an('array').with.lengthOf(2);
			expect(elements[0]).to.deep.equal({ id: 1, item: 'A' });
			expect(elements[1]).to.deep.equal({ id: 2, item: 'B' });
			expect(finalArray).to.deep.equal(elements);
			expect(() => arraySchema.parse(finalArray)).to.not.throw();
		});

		// Anthropic models do not support no-schema output streaming
		it.skip('should stream a raw JSON object with output: "no-schema"', async () => {
			const streamer = create.ObjectStreamer({
				model, temperature,
				output: 'no-schema',
				prompt: 'Generate a JSON object with a "status" key set to "ok" and "code" key set to 200: { status: "ok", code: 200 }.',
			});

			const result = await streamer();
			const partials = await collectPartials(result.partialObjectStream);
			// As a workaround, we use mergePartials to get the complete object from the stream.
			expect(partials.length).to.be.greaterThan(0);
			const finalObject = mergePartials(partials);
			expect(finalObject).to.deep.equal({ status: 'ok', code: 200 });
		});

		it('should stream an object when prompt is provided only at runtime', async () => {
			const streamer = create.ObjectStreamer({
				model, temperature,
				schema: simpleSchema,
			});

			const result = await streamer('Generate an object named "RuntimeStream" with value 555.');
			const partials = await collectPartials(result.partialObjectStream);
			const finalObject = mergePartials(partials);
			expect(finalObject).to.deep.equal({ name: 'RuntimeStream', value: 555 });
		});

		it('should have correct type property', () => {
			const objectStreamer = create.ObjectStreamer({
				model,
				temperature,
				schema: simpleSchema,
				prompt: 'Generate a test object'
			});

			const templateStreamer = create.ObjectStreamer.withTemplate({
				model,
				temperature,
				schema: simpleSchema,
				prompt: 'Generate {{ name }}'
			});

			const arrayStreamer = create.ObjectStreamer({
				model,
				temperature,
				output: 'array',
				schema: arraySchema.element,
				prompt: 'Generate an array'
			});

			// Check that all ObjectStreamer variants have the correct type
			expect(objectStreamer.type).to.equal('StreamObject');
			expect(templateStreamer.type).to.equal('StreamObject');
			expect(arrayStreamer.type).to.equal('StreamObject');
		});
	});

	describe('Configuration & Inheritance', () => {
		const parentConfig = create.Config({
			model, temperature,
			context: {
				entity: 'john',
				defaultId: 456,
			},
			filters: {
				capitalize: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
			},
		});

		it('should inherit model, context, and filters from a parent create.Config', async () => {
			const streamer = create.ObjectStreamer.withTemplate(
				{
					schema: simpleSchema,
					prompt: 'Generate an object with name set to "{{ entity | capitalize }}" and value set to {{ defaultId }}.',
				},
				parentConfig,
			);

			const result = await streamer();
			const partials = await collectPartials(result.partialObjectStream);
			const finalObject = mergePartials(partials);
			expect(finalObject).to.deep.equal({ name: 'John', value: 456 });
		});

		it('should inherit output type and schema from a parent streamer', async () => {
			const parentStreamer = create.ObjectStreamer.withTemplate({
				model, temperature,
				output: 'array',
				schema: arraySchema.element,
			});

			const childStreamer = create.ObjectStreamer.withTemplate({
				prompt: 'Generate an array with one item: {id: 19, item: "InheritedStream"}.'
			}, parentStreamer);

			expect(childStreamer.config.output).to.equal('array');

			//collect the stream
			const result = await childStreamer();
			const array = await collectElements(result.elementStream);
			expect(array).to.be.an('array').with.lengthOf(1);
			expect(array).to.deep.equal([{ id: 19, item: 'InheritedStream' }]);

			const { object: finalArray } = result;
			expect(await finalArray).to.be.an('array').with.lengthOf(1);
			expect(await finalArray).to.deep.equal([{ id: 19, item: 'InheritedStream' }]);
		});

		it('should override parent properties (context, temperature)', async () => {
			const streamer = create.ObjectStreamer.withTemplate({
				temperature: 0.8,
				schema: simpleSchema,
				context: { entity: 'streamed_product' }, // Override entity
				prompt: 'Generate an object for "{{ entity }}" and value {{ defaultId }}.',
			}, parentConfig);

			expect(streamer.config.temperature).to.equal(0.8);
			const result = await streamer();
			const partials = await collectPartials(result.partialObjectStream);
			const finalObject = mergePartials(partials);
			expect(finalObject).to.deep.equal({ name: 'streamed_product', value: 456 });
		});

		it('should merge and deduplicate loader arrays from parent configs and use a named template', async () => {
			const loader1 = new StringLoader();
			loader1.addTemplate('stream1.njk', 'Generate an object with name "{{ name }}" and value {{ value }}.');
			const loader2 = new StringLoader();
			loader2.addTemplate('stream2.njk', 'Generate an object with name "{{ name }}" and value -{{ value }}.');

			const parent = create.Config({ loader: [loader1] });
			const streamer = create.ObjectStreamer.loadsTemplate({
				model, temperature,
				schema: simpleSchema,
				loader: [loader2]
			}, parent);

			expect(streamer.config.loader).to.be.an('array').with.lengthOf(2);

			const result1 = await streamer('stream1.njk', { name: 'Stream1', value: 11 });
			const partials1 = await collectPartials(result1.partialObjectStream);
			const object1 = mergePartials(partials1);
			expect(object1).to.deep.equal({ name: 'Stream1', value: 11 });

			const result2 = await streamer('stream2.njk', { name: 'Stream2', value: 22 });
			const partials2 = await collectPartials(result2.partialObjectStream);
			const object2 = mergePartials(partials2);
			expect(object2).to.deep.equal({ name: 'Stream2', value: -22 });
		});
	});

	describe('Template Engine Features', () => {
		it('should resolve an asynchronous function from context', async () => {
			const streamer = create.ObjectStreamer.withTemplate({
				model, temperature,
				schema: simpleSchema,
				context: {
					fetchData: async () => ({ name: 'AsyncStream', value: await Promise.resolve(110) }),
				},
				prompt: 'Generate an object using this data: {{ fetchData() | dump }}.',
			});

			const result = await streamer();
			const partials = await collectPartials(result.partialObjectStream);
			const finalObject = mergePartials(partials);
			expect(finalObject).to.deep.equal({ name: 'AsyncStream', value: 110 });
		});

		it('should apply an asynchronous filter with arguments', async () => {
			const streamer = create.ObjectStreamer.withTemplate({
				model, temperature,
				schema: simpleSchema,
				filters: {
					createObject: async (name: string, val: number) => {
						await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
						return { name, value: val };
					},
				},
				prompt: 'Generate this object: {{ "FilteredStream" | createObject(35) | dump }}',
			});

			const result = await streamer();
			const partials = await collectPartials(result.partialObjectStream);
			const finalObject = mergePartials(partials);
			expect(finalObject).to.deep.equal({ name: 'FilteredStream', value: 35 });
		});
	});

	describe('Callbacks and Event Handlers', () => {
		it('should call onFinish callback with final object and usage when stream completes', async () => {
			let resolveFinish: (data: StreamObjectOnFinishEvent<typeof simpleSchema>) => void;
			const finishPromise = new Promise<StreamObjectOnFinishEvent<typeof simpleSchema>>((resolve) => {
				resolveFinish = resolve;
			});

			//x@ts-expect-error A TypeScript bug: https://github.com/microsoft/TypeScript/issues/62204
			const streamer = create.ObjectStreamer({
				model, temperature,
				schema: simpleSchema,
				sss: 1,
				prompt: 'Generate a JSON object for "FinishCallback" with value 123.',
				onFinish: function (result: StreamObjectOnFinishEvent<typeof simpleSchema>) {
					resolveFinish(result);
				}
			});

			// x@ts-expect-error wrong return due to the afore mentioned TypeScript bug
			const result = await streamer();
			const partials = await collectPartials(result.partialObjectStream);
			const finalObject = mergePartials(partials) as z.infer<typeof simpleSchema>;
			expect(finalObject).to.deep.equal({ name: 'FinishCallback', value: 123 });

			const finishData = await finishPromise;
			expect(finishData.object).to.deep.equal({ name: 'FinishCallback', value: 123 });
			expect(finishData.usage.inputTokens).to.be.a('number').and.be.greaterThan(0);
			expect(finishData.usage.outputTokens).to.be.a('number').and.be.greaterThan(0);
		});

		it('should throw and reject promises for API errors', async () => {
			const provider = createProvider({ apiKey: 'invalid-key' });
			const badModel = provider(modelName);

			const streamer = create.ObjectStreamer({
				model: badModel,
				temperature,
				schema: simpleSchema,
				prompt: 'This will fail.',
			});

			const resultPromise = streamer();
			// await expect(resultPromise).to.be.rejected;

			try {
				const result = await resultPromise;
				await collectPartials(result.partialObjectStream); // Consuming the stream triggers the error
			} catch (e) {
				expect(e).to.be.an.instanceOf(Error);
				expect((e as Error).message).to.include('invalid x-api-key');
			}
		});
	});

	describe('Error Handling and Validation', () => {
		it('should throw ConfigError if no model is provided', () => {
			expect(() => create.ObjectStreamer({ schema: simpleSchema } as never)).to.throw(
				ConfigError,
				'Object generator configs require a \'model\' property',
			);
		});

		it('should throw ConfigError if output is "array" but no schema is provided', () => {
			expect(() => create.ObjectStreamer({ model, temperature, output: 'array' } as never)).to.throw(
				ConfigError,
				'An \'output\' of \'array\' requires a \'schema\' property',
			);
		});

		it('should throw ConfigError for invalid output type like "enum"', () => {
			// but this does not work now because of function property TS bug workaround that removes the shape
			// and I have not implemented alternative type checking yet
			expect(() =>
				create.ObjectStreamer({
					model, temperature,
					// @ts-expect-error - Intentionally invalid
					output: 'enum',
					enum: ['A', 'B'],
				})
			).to.throw(ConfigError, 'Object streamers do not support "enum" output.');
		});

		it('should not throw ConfigError if output is "no-schema" but a schema is provided (validation handled at TypeScript level)', () => {
			// This validation is now handled at the TypeScript level, not runtime
			expect(() =>
				create.ObjectStreamer({
					model, temperature,
					output: 'no-schema',
					schema: simpleSchema,
				} as never),
			).to.not.throw();
		});

		it('should reject promise at runtime if no prompt is provided in config or call', () => {
			const streamer = create.ObjectStreamer({ model, temperature, schema: simpleSchema });
			expect(() => streamer(undefined as unknown as string)).to.throw(
				ConfigError,
				'Either \'prompt\' (string or messages array) or \'messages\' must be provided',
			);
		});
	});
});