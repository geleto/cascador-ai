/* eslint-disable @typescript-eslint/no-unused-expressions */
import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create } from '../src/index'; // Adjust path to your 'index.ts'

import { model, temperature, StringLoader, timeout } from './common';
import { ConfigError } from '../src/validate';
import { z } from 'zod';

// Configure chai-as-promised
chai.use(chaiAsPromised);

const { expect } = chai;

describe('create.ObjectGenerator', function () {
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

	const enumValues = ['Red', 'Green', 'Blue'] as const;
	type Color = (typeof enumValues)[number];

	describe('Core Functionality by Output Type', () => {
		it('should generate a single object with output: "object" (default) and allow property access', async () => {
			const generator = create.ObjectGenerator({
				model, temperature,
				schema: simpleSchema,
				prompt: 'Generate a JSON object for an item named "Test" with a value of 42.',
			});

			const { object } = await generator();
			// Test direct property access and type
			expect(object.name).to.equal('Test');
			expect(object.value).to.equal(42);//check type
			// Ensure the schema was used for validation
			expect(() => simpleSchema.parse(object)).to.not.throw();
		});

		it('should generate an array of objects with output: "array"', async () => {
			const generator = create.ObjectGenerator({
				model, temperature,
				output: 'array',
				schema: arraySchema.element, // Pass the element schema for arrays
				prompt: 'Generate a JSON array with two items: {id: 1, item: "A"} and {id: 2, item: "B"}.',
			});

			const { object } = await generator();
			expect(object).to.be.an('array').with.lengthOf(2);
			expect(object[0].item).to.equal('A');//check type
			expect(object).to.deep.equal([
				{ id: 1, item: 'A' },
				{ id: 2, item: 'B' },
			]);
			expect(() => arraySchema.parse(object)).to.not.throw();
		});

		it('should generate an enum value and allow type-safe assignment', async () => {
			const generator = create.ObjectGenerator({
				model, temperature,
				output: 'enum',
				enum: enumValues,
				prompt: 'From the list [Red, Green, Blue], choose the color of the sky. Output only the color name.',
			});

			const { object: color } = await generator();
			// This compile-time check confirms TypeScript infers the correct, specific enum type
			const resultColor: Color = color;

			expect(resultColor).to.be.oneOf(enumValues);
			expect(resultColor).to.equal('Blue');
		});

		it('should generate an object when prompt is provided only at runtime', async () => {
			// Generator is created without a prompt
			const generator = create.ObjectGenerator({
				model, temperature,
				schema: simpleSchema,
			});

			// Prompt is provided in the call
			const { object } = await generator('Generate an object for "RuntimePrompt" with value 101.');
			expect(object.value).to.equal(101);//check type
			expect(object).to.deep.equal({ name: 'RuntimePrompt', value: 101 });
		});
	});

	describe('Configuration & Inheritance', () => {
		const parentConfig = create.Config({
			model, temperature,
			context: {
				entity: 'user',
				defaultId: 123,
			},
			filters: {
				upper: (s: string) => s.toUpperCase(),
			},
		});

		it('should inherit model, context, and filters from a parent create.Config', async () => {
			const generator = create.ObjectGenerator.withTemplate(
				{
					schema: simpleSchema,
					prompt: 'Generate an object with name set to "{{ entity | upper }}" and value set to {{ defaultId }}.',
				},
				parentConfig,
			);

			expect(generator.config.model).to.exist;
			expect(generator.config.temperature).to.equal(temperature);

			const { object } = await generator();
			expect(object.value).to.equal(123);//check type

			expect(object).to.deep.equal({ name: 'USER', value: 123 });
		});

		it('should inherit output type and schema from a parent config', async () => {
			const parentGenerator = create.ObjectGenerator({
				model, temperature,
				output: 'array',
				schema: arraySchema.element,
			});

			const childGenerator = create.ObjectGenerator({
				prompt: 'Generate an array with one item: {id: 9, item: "Inherited"}.'
			}, parentGenerator);

			expect(childGenerator.config.output).to.equal('array');
			const { object } = await childGenerator();
			expect(object).to.be.an('array').with.lengthOf(1);
			expect(object[0].id).to.equal(9);//check type
			expect(object).to.deep.equal([{ id: 9, item: 'Inherited' }]);
		});

		it('should correctly assign enum type when inheriting from a parent config', async () => {
			const parentConfig = create.Config({
				model, temperature,
				output: 'enum'
			});
			const childGenerator = create.ObjectGenerator({
				enum: enumValues,
				prompt: 'From the available colors, what color is a fire truck?'
			}, parentConfig);

			const result = await childGenerator();
			const { object: color } = result;
			// This compile-time check confirms TypeScript infers the correct, specific enum type
			const resultColor: Color = color;
			expect(resultColor).to.equal('Red');
		});

		it('should inherit `output: array` from a parent config', async () => {
			const parentConfig = create.Config({
				model, temperature,
				output: 'array',
				schema: z.object({ id: z.number(), success: z.boolean() })
			});

			const childGenerator = create.ObjectGenerator({
				prompt: 'Generate a JSON array with these exact two items: {id: 1, success: true} and {id: 2, success: false}.'
			}, parentConfig);

			const { object } = await childGenerator();
			expect(object).to.eql([{ id: 1, success: true }, { id: 2, success: false }]);
		});

		it('should have correct type property', () => {
			const objectGenerator = create.ObjectGenerator({
				model,
				temperature,
				schema: simpleSchema,
				prompt: 'Generate a test object'
			});

			const templateGenerator = create.ObjectGenerator.withTemplate({
				model,
				temperature,
				schema: simpleSchema,
				prompt: 'Generate {{ name }}'
			});

			const arrayGenerator = create.ObjectGenerator({
				model,
				temperature,
				output: 'array',
				schema: arraySchema.element,
				prompt: 'Generate an array'
			});

			const enumGenerator = create.ObjectGenerator({
				model,
				temperature,
				output: 'enum',
				enum: enumValues,
				prompt: 'Choose a color'
			});

			// Check that all ObjectGenerator variants have the correct type
			expect(objectGenerator.type).to.equal('GenerateObject');
			expect(templateGenerator.type).to.equal('GenerateObject');
			expect(arrayGenerator.type).to.equal('GenerateObject');
			expect(enumGenerator.type).to.equal('GenerateObject');
		});

		it('should generate an object when inheriting and prompt is at runtime', async () => {
			const parentWithSchema = create.ObjectGenerator({
				model, temperature,
				schema: simpleSchema
			});
			const childGenerator = create.ObjectGenerator({}, parentWithSchema);
			const { object } = await childGenerator('Generate an object for "InheritedRuntime" with value 789.');
			expect(object).to.deep.equal({ name: 'InheritedRuntime', value: 789 });
			expect(object.value).to.equal(789);//check type
		});

		it('should override parent properties (context, temperature)', async () => {
			const generator = create.ObjectGenerator.withTemplate({
				temperature: 0.8,
				schema: simpleSchema,
				context: { entity: 'product' }, // Override entity
				prompt: 'Generate an object for "{{ entity }}" with value {{ defaultId }}.',
			}, parentConfig);

			expect(generator.config.temperature).to.equal(0.8);
			const { object } = await generator();
			expect(object).to.deep.equal({ name: 'product', value: 123 });
			expect(object.value).to.equal(123);//check type
		});

		it('should override an inherited schema with a child schema', async () => {
			const locationSchema = z.object({ city: z.string(), country: z.string() });
			const parentWithSchema = create.ObjectGenerator({
				model, temperature,
				schema: simpleSchema, // Parent has the 'name'/'value' schema
			});
			const childWithSchema = create.ObjectGenerator({
				schema: locationSchema, // Child has the 'city'/'country' schema
				prompt: 'Generate a JSON object for the location: Paris, France.',
			}, parentWithSchema);

			const { object } = await childWithSchema();
			expect(object).to.deep.equal({ city: 'Paris', country: 'France' });
			expect(object.city).to.equal('Paris');//check type
		});

		it('should merge and deduplicate loader arrays from parent configs', async () => {
			const loader1 = new StringLoader();
			loader1.addTemplate('object1.njk', 'Generate an object with these exact properties - name: "{{ name }}" and value: {{ value }}.');
			const loader2 = new StringLoader();
			loader2.addTemplate('object2.njk', 'Generate an object with these exact properties - name: "{{ name }}" and value: {{ value }}.');

			const parent = create.Config({ loader: [loader1] });
			const generator = create.ObjectGenerator.loadsTemplate({
				model, temperature,
				schema: simpleSchema,
				loader: [loader2]
			}, parent);

			expect(generator.config.loader).to.be.an('array').with.lengthOf(2);
			expect(generator.config.loader).to.deep.equal([loader1, loader2]);

			//test the loader functionality using named templates
			const { object: object1 } = await generator('object1.njk', { name: 'Test', value: 10 });
			expect(object1).to.deep.equal({ name: 'Test', value: 10 });

			const { object: object2 } = await generator('object2.njk', { name: 'Test2', value: 20 });
			expect(object2).to.deep.equal({ name: 'Test2', value: 20 });
		});
	});

	describe('Template Engine Features', () => {
		it('should resolve an asynchronous function from context', async () => {
			const generator = create.ObjectGenerator.withTemplate({
				model, temperature,
				schema: simpleSchema,
				context: {
					fetchData: async () => ({ name: 'Async', value: await Promise.resolve(10) }),
				},
				prompt: 'Generate an object using this data: {{ fetchData() | dump }}.',
			});

			const { object } = await generator();
			expect(object).to.deep.equal({ name: 'Async', value: 10 });
		});

		it('should apply an asynchronous filter with arguments', async () => {
			const generator = create.ObjectGenerator.withTemplate({
				model, temperature,
				schema: simpleSchema,
				filters: {
					createObject: async (name: string, val: number) => {
						await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
						return { name, value: val };
					},
				},
				prompt: 'Generate this object: {{ "Filtered" | createObject(25) | dump }}',
			});

			const { object } = await generator();
			expect(object).to.deep.equal({ name: 'Filtered', value: 25 });
		});

		it('should merge config and runtime context correctly', async () => {
			const generator = create.ObjectGenerator.withTemplate({
				model, temperature,
				schema: simpleSchema,
				context: { name: 'Config', value: 1 },
				prompt: 'Generate an object with name "{{ name }}" and value {{ value }}.',
			});
			// Runtime context ({ name: 'Runtime' }) overrides the key from the config context.
			const { object } = await generator({ name: 'Runtime' });
			expect(object).to.deep.equal({ name: 'Runtime', value: 1 });
		});
	});

	describe('Loader Functionality', () => {
		const stringLoader = new StringLoader();
		stringLoader.addTemplate('object.njk', 'Generate an object with name "{{ name }}" and value {{ value }}.');

		it('should load a template using .loadsTemplate modifier', async () => {
			const generator = create.ObjectGenerator.loadsTemplate({
				model, temperature,
				schema: simpleSchema,
				loader: stringLoader,
				prompt: 'object.njk',
			});

			const { object } = await generator({ name: 'Loaded', value: 500 });
			expect(object).to.deep.equal({ name: 'Loaded', value: 500 });
		});
	});

	describe('Callable Interface Overloads', () => {
		const generatorWithPrompt = create.ObjectGenerator.withTemplate({
			model, temperature,
			schema: simpleSchema,
			prompt: 'Generate an object with name "{{ name }}" and value {{ value }}.',
			context: { name: 'Default', value: 0 },
		});

		it('handles call with no arguments: generator()', async () => {
			const { object } = await generatorWithPrompt();
			expect(object).to.deep.equal({ name: 'Default', value: 0 });
		});

		it('handles call with context override: generator({ name: "Override" })', async () => {
			const { object } = await generatorWithPrompt({ name: 'Override' });
			expect(object).to.deep.equal({ name: 'Override', value: 0 });
		});

		it('handles call with prompt and context override', async () => {
			const { object } = await generatorWithPrompt(
				'Generate a JSON object with a "name" of "{{ name }}" and a "value" of {{ value }}.',
				{ name: 'Final', value: 99 },
			);
			expect(object).to.deep.equal({ name: 'Final', value: 99 });
		});
	});

	describe('Error Handling and Validation', () => {
		it('should throw ConfigError if no model is provided', () => {
			expect(() => create.ObjectGenerator({ schema: simpleSchema } as never)).to.throw(
				ConfigError,
				'Object config requires a \'model\' property',
			);
		});

		it('should throw ConfigError if output is "object" but no schema is provided', () => {
			expect(() => create.ObjectGenerator({ model, temperature, output: 'object' } as never)).to.throw(
				ConfigError,
				'object output requires schema',
			);
		});

		it('should throw ConfigError if output is "array" but no schema is provided', () => {
			expect(() => create.ObjectGenerator({ model, temperature, output: 'array' } as never)).to.throw(
				ConfigError,
				'array output requires schema',
			);
		});

		it('should throw ConfigError if output is "enum" but no enum array is provided', () => {
			expect(() => create.ObjectGenerator({ model, temperature, output: 'enum' } as never)).to.throw(
				ConfigError,
				'enum output requires non-empty enum array',
			);
		});

		it('should throw ConfigError if output is "no-schema" but a schema is provided', () => {
			expect(() =>
				create.ObjectGenerator({
					model, temperature,
					output: 'no-schema',
					schema: simpleSchema,
				} as never),
			).to.throw(ConfigError, 'no-schema output cannot have schema');
		});

		it('should throw at runtime if no prompt is provided in config or call', () => {
			const generator = create.ObjectGenerator({ model, temperature, schema: simpleSchema });
			expect(() => generator(undefined as unknown as string)).to.throw(
				ConfigError,
				'Either prompt or messages must be provided',
			);
		});

		it('should reject the promise if the LLM output fails schema validation', async () => {
			const strictSchema = z.object({
				name: z.string(),
				value: z.number().min(100), // Expecting a number >= 100
			});
			const generator = create.ObjectGenerator({
				model, temperature,
				schema: strictSchema,
				prompt: 'Generate an object for "ValidationTest" with value 42. The value must be a number.',
			});
			await expect(generator()).to.be.rejectedWith('response did not match schema');
		});

		it('should propagate errors from async context functions', async () => {
			const generator = create.ObjectGenerator.withTemplate({
				model, temperature,
				schema: simpleSchema,
				context: {
					badFunc: async () => {
						await new Promise(resolve => setTimeout(resolve, 1));
						throw new Error('Async context failed');
					},
				},
				prompt: 'This will fail: {{ badFunc() }}',
			});

			await expect(generator()).to.be.rejectedWith('Async context failed');
		});

		it('should throw ConfigError for invalid output type', () => {
			expect(() =>
				create.ObjectGenerator({
					model, temperature,
					schema: simpleSchema,
					// @ts-expect-error - Intentionally invalid
					output: 'invalid-type',
				}),
			).to.throw(ConfigError, `Invalid output type: 'invalid-type'`);
		});
	});
});