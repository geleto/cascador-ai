/* eslint-disable @typescript-eslint/no-unused-expressions */
import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create } from '../src/index'; // Adjust path to your 'index.ts'
import { model, StringLoader, timeout } from './common';
import { ConfigError } from '../src/validate';

// Configure chai-as-promised
chai.use(chaiAsPromised);

const { expect } = chai;

describe('create.TextGenerator', function () {
	this.timeout(timeout); // Increase timeout for tests that call the real API

	// Simple prompts for easy and cheap verification
	const simplePrompt = 'Output only the number 2.';
	const simpleExpected = '2';

	describe('Core Functionality', () => {
		it('should generate text with a simple prompt and model', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: simplePrompt,
			});
			const result = await generator();
			expect(result.text).to.equal(simpleExpected);
		});

		it('should generate text when the prompt is a runtime argument', async () => {
			const generator = create.TextGenerator({ model });
			const result = await generator(simplePrompt);
			expect(result.text).to.equal(simpleExpected);
		});

		it('should use prompt from config if no runtime prompt is given', async () => {
			const generator = create.TextGenerator({ model, prompt: simplePrompt });
			const result = await generator();
			expect(result.text).to.equal(simpleExpected);
		});

		it('should handle promptType: "text" by not processing templates', async () => {
			const generator = create.TextGenerator({
				model,
				promptType: 'text',
				prompt: 'Output this exactly: {{ test }}',
			});
			const result = await generator();
			expect(result.text).to.equal('{{ test }}');
		});

		it('should pass through Vercel AI SDK properties like temperature', async () => {
			const generator = create.TextGenerator({
				model,
				temperature: 0, // Deterministic
				prompt: 'Tell me a one-word color.',
			});
			// It's hard to test randomness, so we verify the property is set in the config
			expect(generator.config.temperature).to.equal(0);
			const result = await generator();
			expect(result.text).to.be.a('string').with.length.above(0);
		});
	});

	describe('Configuration & Inheritance', () => {
		const parentConfig = create.Config({
			model,
			temperature: 0.1,
			context: {
				item: 'apples',
				source: 'parent',
			},
			filters: {
				parens: (s: string) => `(${s})`,
			},
		});

		it('should inherit properties from a parent create.Config object', async () => {
			const generator = create.TextGenerator(
				{
					prompt: 'Only write this and nothing else, including any parentheses: {{ item | parens }}.',
				},
				parentConfig,
			);
			const result = await generator();
			expect(generator.config.model).to.be.ok;
			expect(generator.config.temperature).to.equal(0.1);
			expect(result.text).to.equal('(apples)');
		});

		// Test inheritance from another TextGenerator
		it('should inherit from another TextGenerator instance', async () => {
			const parentGenerator = create.TextGenerator({
				model,
				context: {
					user: 'Alice',
				},
				filters: {
					scream: (s: string) => s.toUpperCase() + '!!!',
				},
			});

			const childGenerator = create.TextGenerator({
				prompt: 'Write this and nothing else: {{ user | scream }}',
			}, parentGenerator);

			const result = await childGenerator();
			expect(childGenerator.config.model).to.exist;
			expect(result.text).to.equal('ALICE!!!');
		});

		it('should override parent properties with child properties', async () => {
			const generator = create.TextGenerator(
				{
					temperature: 0.9,
					prompt: 'Only write this and nothing else: {{ item }}',
				},
				parentConfig,
			);
			expect(generator.config.temperature).to.equal(0.9);
			const result = await generator();
			expect(result.text).to.equal('apples');
		});

		it('should merge "context" objects (child overrides parent keys)', async () => {
			const generator = create.TextGenerator(
				{
					context: {
						item: 'oranges',
						source: 'child',
					},
					prompt: 'Write this and nothing else: Item: {{ item }}, Source: {{ source }}',
				},
				parentConfig,
			);
			const result = await generator();
			expect(result.text).to.equal('Item: oranges, Source: child');
		});

		it('should merge "filters" objects', async () => {
			const generator = create.TextGenerator(
				{
					filters: {
						stars: (s: string) => `*${s}*`,
					},
					prompt: 'Only write this and nothing else, including any parentheses: {{ item | parens | stars }}.',
				},
				parentConfig,
			);
			const result = await generator();
			expect(result.text).to.equal('*(apples)*');
		});

		it('should merge and deduplicate "loader" arrays', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const parent = create.Config({ loader: loader1 });
			const generator = create.TextGenerator(
				{ model, loader: [loader1, loader2] },
				parent,
			);
			expect(generator.config.loader).to.be.an('array').with.lengthOf(2);
			expect(generator.config.loader).to.deep.equal([loader1, loader2]);
		});
	});

	describe('Template Engine Features', () => {
		it('should render a template using a static context value from config', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write the word and nothing else. The word is {{ word }}.',
				context: { word: 'test' },
			});
			const result = await generator();
			expect(result.text).to.equal('test');
		});

		it('should render a template using a context value from a runtime argument', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write the word and nothing else. The word is {{ word }}.',
			});
			const result = await generator({ word: 'runtime' });
			expect(result.text).to.equal('runtime');
		});

		it('should merge config context and runtime context (runtime takes precedence)', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write the word and number separated by a space and nothing else. The word is {{ word }} and the number is {{ num }}.',
				context: { word: 'config', num: 1 },
			});
			const result = await generator({ word: 'runtime' });
			expect(result.text).to.equal('runtime 1');
		});

		it('should resolve a synchronous function in the context', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write the value and nothing else. The value is {{ value() }}.',
				context: { value: () => 'functional' },
			});
			const result = await generator();
			expect(result.text).to.equal('functional');
		});

		// Test context function with arguments
		it('should resolve a context function with arguments', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write the value and nothing else. The value is {{ add(5, 3) }}.',
				context: { add: (a: number, b: number) => a + b },
			});
			const result = await generator();
			expect(result.text).to.equal('8');
		});

		it('should resolve an asynchronous function in the context', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write the value and nothing else. The value is {{ value() }}.',
				context: { value: async () => Promise.resolve('async') },
			});
			const result = await generator();
			expect(result.text).to.equal('async');
		});

		it('should apply a synchronous filter', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write this and nothing else, keep the capitalization: {{ word | upper }}',
				context: { word: 'test' },
				filters: { upper: (s: string) => s.toUpperCase() },
			});
			const result = await generator();
			expect(result.text).to.equal('TEST');
		});

		// Test filter with arguments
		it('should apply a filter with an argument', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write this and nothing else: {{ "hello" | repeat(3) }}',
				filters: { repeat: (s: string, count: number) => s.repeat(count) },
			});
			const result = await generator();
			expect(result.text).to.equal('hellohellohello');
		});

		it('should apply an asynchronous filter', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Only write this and nothing else, keep the capitalization: {{ word | asyncUpper }}',
				context: { word: 'test' },
				filters: { asyncUpper: async (s: string) => Promise.resolve(s.toUpperCase()) },
			});
			const result = await generator();
			expect(result.text).to.equal('TEST');
		});
	});

	describe('Loader Functionality', () => {
		const stringLoader = new StringLoader();

		// Add templates to the StringLoader
		stringLoader.addTemplate('simple.njk', 'Only write the number in "" quotes and nothing else. The number is {{ number }}.');
		stringLoader.addTemplate('filtered.njk', 'Only write, this, keep the capitalization and punctuation: {{ text | shout }}');

		it('should load and render a template using promptType: "template-name"', async () => {
			const generator = create.TextGenerator({
				model,
				loader: stringLoader,
				promptType: 'template-name',
				prompt: 'simple.njk',
			});
			const result = await generator({ number: 5 });
			expect(result.text.trim()).to.equal('"5"');
		});

		it('should load and render a template using promptType: "async-template-name"', async () => {
			const generator = create.TextGenerator({
				model,
				loader: stringLoader,
				promptType: 'async-template-name',
				prompt: 'simple.njk',
			});
			const result = await generator({ number: 10 });
			expect(result.text.trim()).to.equal('"10"');
		});

		it('should load from StringLoader using promptType: "template-name"', async () => {
			const testLoader = new StringLoader();
			testLoader.addTemplate('my-prompt', 'Write this and nothing else: This is a test with {{ name }}.');

			const generator = create.TextGenerator({
				model,
				loader: testLoader,
				promptType: 'template-name',
				prompt: 'my-prompt',
			});

			const result = await generator({ name: 'StringLoader' });
			expect(result.text.trim()).to.equal('This is a test with StringLoader.');
		});

		it('should use context and filters with a loaded template', async () => {
			const generator = create.TextGenerator({
				model,
				loader: stringLoader,
				promptType: 'async-template-name',
				prompt: 'filtered.njk',
				filters: { shout: (s: string) => `${s.toUpperCase()}!` },
			});
			const result = await generator({ text: 'hello' });
			expect(result.text.trim()).to.equal('HELLO!');
		});
	});

	describe('Callable Interface Overloads', () => {
		const generatorWithPrompt = create.TextGenerator({
			model,
			prompt: 'Only write the value in "" quotes and nothing else. The value is {{ val }}.',
			context: { val: 'A' },
		});

		it('handles call with no arguments: generator()', async () => {
			const result = await generatorWithPrompt();
			expect(result.text).to.equal('"A"');
		});

		it('handles call with prompt override: generator("new prompt {{val}}")', async () => {
			const result = await generatorWithPrompt('Only write the value in () parenthesis and nothing else, the value is: {{ val }}.');
			expect(result.text).to.equal('(A)');
		});

		it('handles call with context override: generator({ val: "B" })', async () => {
			const result = await generatorWithPrompt({ val: 'B' });
			expect(result.text).to.equal('"B"');
		});

		it('handles call with prompt and context override', async () => {
			const result = await generatorWithPrompt(
				'Only write the value in () parenthesis and nothing else, the value is: {{ val }}.',
				{ val: 'C' },
			);
			expect(result.text).to.equal('(C)');
		});

		// Test the call signature for a generator without a pre-configured prompt
		describe('for generator without configured prompt', () => {
			const generatorWithoutPrompt = create.TextGenerator({
				model,
				context: { val: 'A' },
			});

			it('handles call with prompt: generator(prompt)', async () => {
				const result = await generatorWithoutPrompt('Only write the value, nothing else. The value is {{ val }}.');
				expect(result.text).to.equal('A');
			});

			it('handles call with prompt and context: generator(prompt, context)', async () => {
				const result = await generatorWithoutPrompt('Only write the value, nothing else. The value is {{ val }}.', { val: 'B' });
				expect(result.text).to.equal('B');
			});
		});
	});

	describe('Error Handling and Validation', () => {
		it('should throw ConfigError if no model is provided', () => {
			// This now throws at creation time due to stricter config validation.
			expect(() => create.TextGenerator({ prompt: 'test' } as never)).to.throw(
				ConfigError,
				'TextGenerator config requires model',
			);
		});

		it('should throw ConfigError for mixing template and script properties', () => {
			expect(() => {
				// @ts-expect-error - Intentionally mixing properties
				create.TextGenerator({
					model,
					prompt: 'a',
					script: 'b',
				});
			}).to.throw(
				ConfigError,
				'Configuration cannot have both template/prompt and script properties.',
			);
		});

		it('should throw ConfigError if promptType is "text" but template properties are used', () => {
			expect(() =>
				create.TextGenerator({
					model,
					promptType: 'text',
					filters: { test: () => '' },
				} as never),
			).to.throw(
				ConfigError,
				"'text' promptType cannot be used with template engine properties like 'loader', 'filters', or 'options'.",
			);
		});

		it('should throw ConfigError if promptType is "template-name" but no loader is provided', () => {
			// This now throws at creation time.
			expect(() =>
				// @ts-expect-error - no loader provided
				create.TextGenerator({
					model,
					promptType: 'template-name',
					prompt: 'file.njk',
				}),
			).to.throw(
				ConfigError,
				`The promptType 'template-name' requires a 'loader' to be configured`,
			);
		});

		// Refined test for missing prompt.
		it('should throw an error at runtime if no prompt is provided in config or call', async () => {
			const generator = create.TextGenerator({ model });
			// Calling with no arguments should fail.
			await expect(generator(undefined as unknown as string)).to.be.rejectedWith(
				ConfigError,
				'Either prompt argument or config.prompt/messages required',
			);
		});

		it('should throw if a filter function throws an error', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: '{{ "test" | badFilter }}',
				filters: {
					badFilter: () => {
						throw new Error('Filter failed');
					},
				},
			});

			// The error from cascada-engine is now wrapped.
			await expect(generator()).to.be.rejectedWith(
				'Filter failed',
			);
		});

		it('should throw if a loader fails to find a template', async () => {
			const generator = create.TextGenerator({
				model,
				loader: new StringLoader(),
				promptType: 'template-name',
				prompt: 'nonexistent.njk',
			});

			await expect(generator()).to.be.rejectedWith(
				'Template not found: nonexistent.njk',
			);
		});

		it('should throw if a context function throws an error', async () => {
			const generator = create.TextGenerator({
				model,
				prompt: 'Value: {{ value() }}',
				context: {
					value: () => {
						throw new Error('Context failed');
					},
				},
			});
			// The error from cascada-engine is now wrapped.
			await expect(generator()).to.be.rejectedWith(
				'Context failed',
			);
		});
	});
});