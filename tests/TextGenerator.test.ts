/* eslint-disable @typescript-eslint/no-unused-expressions */
import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create } from '../src/index';
import { model, temperature, StringLoader, AsyncStringLoader, timeout } from './common';
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
				temperature,
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
			const generator = create.TextGenerator({ model, temperature, prompt: simplePrompt });
			const result = await generator();
			expect(result.text).to.equal(simpleExpected);
		});

		it('should treat prompt as plain text by default and not process templates', async () => {
			const generator = create.TextGenerator({
				model,
				temperature,
				prompt: 'Output this exactly: {{ test }}',
			});
			const result = await generator();
			expect(result.text).to.equal('{{ test }}');
		});

		it('should pass through Vercel AI SDK properties like temperature', async () => {
			const generator = create.TextGenerator({
				model,
				temperature,
				prompt: 'Tell me a one-word color.',
			});
			// It's hard to test randomness, so we verify the property is set in the config
			expect(generator.config.temperature).to.equal(temperature);
			const result = await generator();
			expect(result.text).to.be.a('string').with.length.above(0);
		});
	});

	describe('Configuration & Inheritance', () => {
		const parentConfig = create.Config({
			model,
			temperature,
			context: {
				item: 'apples',
				source: 'parent',
			},
			filters: {
				parens: (s: string) => `(${s})`,
			},
		});

		it('should inherit properties from a parent create.Config object', async () => {
			const generator = create.TextGenerator.withTemplate(
				{
					prompt: 'Only write this and nothing else, including any parentheses: {{ item | parens }}.',
				},
				parentConfig,
			);
			const result = await generator();
			expect(generator.config.model).to.be.ok;
			expect(generator.config.temperature).to.equal(temperature);
			expect(result.text).to.equal('(apples)');
		});

		// Test inheritance from another TextGenerator
		it('should inherit from another TextGenerator instance', async () => {
			const parentGenerator = create.TextGenerator.withTemplate({
				model,
				temperature,
				context: {
					user: 'Alice',
				},
				filters: {
					scream: (s: string) => s.toUpperCase() + '!!!',
				},
			});

			const childGenerator = create.TextGenerator.withTemplate(
				{
					prompt: 'Write this and nothing else: {{ user | scream }}',
				},
				parentGenerator,
			);

			const result = await childGenerator();
			expect(childGenerator.config.model).to.exist;
			expect(result.text).to.equal('ALICE!!!');
		});

		it('should override parent properties with child properties', async () => {
			const generator = create.TextGenerator.withTemplate(
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
			const generator = create.TextGenerator.withTemplate(
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
			const generator = create.TextGenerator.withTemplate(
				{
					filters: { exclam: (s: string) => `${s}!` },
					prompt: 'Reply verbatim, only with the following text: {{ item | parens | exclam }}',
				},
				parentConfig,
			);
			const result = await generator();
			expect(result.text).to.equal('(apples)!');
		});

		it('should have correct type property', () => {
			const generator = create.TextGenerator({
				model,
				temperature,
				prompt: 'Hello world'
			});

			const templateGenerator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Hello {{ name }}'
			});

			// Check that all TextGenerator variants have the correct type
			expect(generator.type).to.equal('GenerateText');
			expect(templateGenerator.type).to.equal('GenerateText');
		});

		it('should merge and deduplicate "loader" arrays', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const parent = create.Config({ loader: loader1 });
			const generator = create.TextGenerator.withTemplate(
				{ model, temperature, loader: [loader1, loader2], prompt: '' },
				parent,
			);
			expect(generator.config.loader).to.be.an('array').with.lengthOf(2);
			expect(generator.config.loader).to.deep.equal([loader1, loader2]);
		});
	});

	describe('Template Engine Features', () => {
		it('should render a template using a static context value from config', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Only write the word and nothing else. The word is {{ word }}.',
				context: { word: 'test' },
			});
			const result = await generator();
			expect(result.text).to.equal('test');
		});

		it('should render a template using a context value from a runtime argument', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Only write the word and nothing else. Keep it lowercase. The word is {{ word }}.',
			});
			const result = await generator({ word: 'runtime' });
			expect(result.text).to.equal('runtime');
		});

		it('should merge config context and runtime context (runtime takes precedence)', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Only write the word and number separated by a space and nothing else. The word is {{ word }} and the number is {{ num }}.',
				context: { word: 'config', num: 1 },
			});
			const result = await generator({ word: 'runtime' });
			expect(result.text).to.equal('runtime 1');
		});

		it('should resolve a synchronous function in the context', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Only write the value and nothing else. The value is {{ value() }}.',
				context: { value: () => 'functional' },
			});
			const result = await generator();
			expect(result.text).to.equal('functional');
		});

		// Test context function with arguments
		it('should resolve a context function with arguments', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Only write the value and nothing else. The value is {{ add(5, 3) }}.',
				context: { add: (a: number, b: number) => a + b },
			});
			const result = await generator();
			expect(result.text).to.equal('8');
		});

		it('should resolve an asynchronous function in the context', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Only write the value and nothing else. The value is {{ value() }}.',
				context: { value: async () => Promise.resolve('async') },
			});
			const result = await generator();
			expect(result.text).to.equal('async');
		});

		it('should apply a synchronous filter', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Write the following text exactly as shown, preserving and the original case of each letter: {{ word | upper }}',
				context: { word: 'test' },
				filters: { upper: (s: string) => s.toUpperCase() },
			});
			const result = await generator();
			expect(result.text).to.equal('TEST');
		});

		// Test filter with arguments
		it('should apply a filter with an argument', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Only write this and nothing else: {{ "hello" | repeat(3) }}',
				filters: { repeat: (s: string, count: number) => s.repeat(count) },
			});
			const result = await generator();
			expect(result.text).to.equal('hellohellohello');
		});

		it('should apply an asynchronous filter', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Write the following text exactly as shown, preserving the original case of each letter: {{ word | asyncUpper }}',
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
		stringLoader.addString('simple.njk', 'Only write the number in "" quotes and nothing else. The number is {{ number }}.');
		stringLoader.addString('filtered.njk', 'Write the following text exactly as shown, preserving all punctuation and the original case of each letter: {{ text | shout }}');

		it('should load and render a template from a named prompt', async () => {
			const generator = create.TextGenerator.loadsTemplate({
				model,
				temperature,
				loader: stringLoader,
				prompt: 'simple.njk',
			});
			const result = await generator({ number: 5 });
			expect(result.text.trim()).to.equal('"5"');
		});

		it('should load from StringLoader using a named prompt', async () => {
			const testLoader = new StringLoader();
			testLoader.addString('my-prompt', 'Write this and nothing else, keep it exactly as shown: This is a test with {{ name }}.');

			const generator = create.TextGenerator.loadsTemplate({
				model,
				temperature,
				loader: testLoader,
				prompt: 'my-prompt',
				context: { name: 'StringLoader' },
			});

			const result = await generator({ name: 'StringLoader' });
			expect(result.text.trim()).to.equal('This is a test with StringLoader.');
		});

		it('should use context and filters with a loaded template', async () => {
			const generator = create.TextGenerator.loadsTemplate({
				model,
				temperature,
				loader: stringLoader,
				prompt: 'filtered.njk',
				filters: { shout: (s: string) => `${s.toUpperCase()}!` },
			});
			const result = await generator({ text: 'hello' });
			expect(result.text.trim()).to.equal('HELLO!');
		});
	});

	describe('Callable Interface Overloads', () => {
		const generatorWithPrompt = create.TextGenerator.withTemplate({
			model,
			temperature,
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
			const generatorWithoutPrompt = create.TextGenerator.withTemplate({
				model,
				temperature,
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
				'Text generator configs require a \'model\' property',
			);
		});

		it('should not throw ConfigError if plain text generator uses template properties (validation handled at TypeScript level)', () => {
			// This validation is now handled at the TypeScript level, not runtime
			expect(() =>
				create.TextGenerator({
					model,
					temperature,
					filters: { test: () => '' },
				} as never),
			).to.not.throw();
		});

		it('should throw ConfigError if .loadsTemplate is used but no loader is provided', () => {
			// This now throws at creation time.
			expect(() =>
				// @ts-expect-error - no loader provided
				create.TextGenerator.loadsTemplate({
					model,
					temperature,
					prompt: 'file.njk',
				}),
			).to.throw(
				ConfigError,
				`A 'loader' is required for this operation`,
			);
		});

		// Refined test for missing prompt.
		it('should throw an error at runtime if no prompt is provided in config or call', () => {
			const generator = create.TextGenerator({ model });
			// Calling with no arguments should fail.
			expect(() => generator(undefined as unknown as string)).to.throw(
				ConfigError,
				'Either \'prompt\' (string or messages array) or \'messages\' must be provided',
			);
		});

		it('should throw if a filter function throws an error', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: '{{ "test" | badFilter }}',
				filters: {
					badFilter: () => {
						throw new Error('Filter failed');
					},
				},
			});

			// The error from cascada-engine is now wrapped.
			await expect(generator()).to.be.rejectedWith('Filter failed');
		});

		it('should throw if a loader fails to find a template specified at creation time', async () => {
			const generator = create.TextGenerator.loadsTemplate({
				model, temperature,
				loader: new StringLoader(),
				prompt: 'nonexistent.njk',
			});

			await expect(generator()).to.be.rejectedWith(/template not found/i);
		});

		it('should throw if a loader fails to find a template specified at runtime', async () => {
			const generator = create.TextGenerator.loadsTemplate({
				model, temperature,
				loader: new StringLoader()
			});
			await expect(generator('nonexistent.njk')).to.be.rejectedWith(/template not found/i);
		});

		it('should throw if a template is named, but no loader is provided', () => {
			//@ts-expect-error - no loader is provided
			expect(() => create.TextGenerator.loadsTemplate({
				model, temperature
			})).to.throw(
				ConfigError,
				"A 'loader' is required for this operation"
			);
		});

		it('should throw if a context function throws an error', async () => {
			const generator = create.TextGenerator.withTemplate({
				model,
				temperature,
				prompt: 'Value: {{ value() }}',
				context: {
					value: () => {
						throw new Error('Context failed');
					},
				},
			});
			// The error from cascada-engine is now wrapped.
			await expect(generator()).to.be.rejectedWith('Context failed');
		});
	});

	describe('.loadsText functionality', () => {
		const stringLoader = new StringLoader();
		stringLoader.addString('simple.txt', 'Output only the number 2.');
		stringLoader.addString('complex.txt', 'Write a short story about a robot.');

		it('should load and use plain text from a loader', async () => {
			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: stringLoader,
				prompt: 'simple.txt'
			});

			const result = await generator();
			expect(result.text).to.equal('2');
		});

		it('should load text at runtime with one-off prompt', async () => {
			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: stringLoader
			});

			const result = await generator('complex.txt');
			expect(result.text).to.be.a('string').with.length.above(0);
		});

		it('should handle multiple loaders in array', async () => {
			const loader1 = new StringLoader();
			loader1.addString('test1.txt', 'Output only the number 1.');

			const loader2 = new StringLoader();
			loader2.addString('test2.txt', 'Output only the number 2.');

			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: [loader1, loader2],
				prompt: 'test2.txt'
			});

			const result = await generator();
			expect(result.text).to.equal('2');
		});

		it('should fallback to first loader if second fails', async () => {
			const loader1 = new StringLoader();
			loader1.addString('fallback.txt', 'Output only the number 3.');

			const loader2 = new StringLoader();
			// loader2 has no templates

			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: [loader2, loader1],
				prompt: 'fallback.txt'
			});

			const result = await generator();
			expect(result.text).to.equal('3');
		});

		it('should throw ConfigError if no loader is provided', () => {
			expect(() =>
				// @ts-expect-error - no loader provided
				create.TextGenerator.loadsText({
					model,
					temperature,
					prompt: 'file.txt'
				})
			).to.throw(
				ConfigError,
				"A 'loader' is required for this operation"
			);
		});

		it('should throw if loader fails to find text at creation time', () => {
			expect(() => {
				create.TextGenerator.loadsText({
					model,
					temperature,
					loader: new StringLoader(),
					prompt: 'nonexistent.txt'
				});
			}).to.throw(/not found/);
		});

		it('should throw if loader fails to find text at runtime', async () => {
			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: new StringLoader()
			});

			await expect(generator('nonexistent.txt')).to.be.rejectedWith(/not found/);
		});

		it('should work with inheritance from parent config', async () => {
			const parentLoader = new StringLoader();
			parentLoader.addString('parent.txt', 'Output only the number 4.');

			const parent = create.Config({
				loader: parentLoader,
				temperature: 0.1
			});

			const generator = create.TextGenerator.loadsText({
				model,
				prompt: 'parent.txt'
			}, parent);

			const result = await generator();
			expect(result.text).to.equal('4');
		});

		// This is a valid use case but we currently race all loaders for the first to return a value
		it.skip('should override parent loader with child loader', async () => {
			const parentLoader = new StringLoader();
			parentLoader.addString('override.txt', 'Output only the number 5.');

			const childLoader = new StringLoader();
			childLoader.addString('override.txt', 'Output only the number 6.');

			const parent = create.Config({ loader: parentLoader });

			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: childLoader,
				prompt: 'override.txt'
			}, parent);

			const result = await generator();
			expect(result.text).to.equal('6');
		});

		it('should work with functional loaders', async () => {
			const functionalLoader = (name: string): string => {
				const templates: Record<string, string> = {
					'func.txt': 'Output only the number 7.'
				};
				return templates[name] || '';
			};

			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: functionalLoader,
				prompt: 'func.txt'
			});

			const result = await generator();
			expect(result.text).to.equal('7');
		});

		it('should handle loader caching', async () => {
			let loadCount = 0;
			const countingLoader = new StringLoader();
			countingLoader.addString('count.txt', 'Output only the number 8.');

			// Mock the load method to count calls
			const originalLoad = countingLoader.load.bind(countingLoader);
			countingLoader.load = function (name: string) {
				loadCount++;
				return originalLoad(name);
			};

			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: countingLoader,
				prompt: 'count.txt'
			});

			// First call
			const result1 = await generator();
			expect(loadCount).to.equal(1);

			// Second call should use cache
			const result2 = await generator();
			expect(loadCount).to.equal(1); // Should not increment
			expect(result1.text).to.equal(result2.text);
		});
	});

	describe('Async Loader Functionality', () => {
		const asyncStringLoader = new AsyncStringLoader();
		asyncStringLoader.addString('async-simple.txt', 'Output only the number 2.');
		asyncStringLoader.addString('async-complex.txt', 'Write a short story about a robot.');

		it('should load and use plain text from an async loader', async () => {
			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: asyncStringLoader,
				prompt: 'async-simple.txt'
			});

			const result = await generator();
			expect(result.text).to.equal('2');
		});

		it('should load text at runtime with one-off prompt using async loader', async () => {
			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: asyncStringLoader
			});

			const result = await generator('async-complex.txt');
			expect(result.text).to.be.a('string').with.length.above(0);
		});

		it('should handle multiple async loaders in array', async () => {
			const loader1 = new AsyncStringLoader();
			loader1.addString('async-test1.txt', 'Output only the number 1.');

			const loader2 = new AsyncStringLoader();
			loader2.addString('async-test2.txt', 'Output only the number 2.');

			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: [loader1, loader2],
				prompt: 'async-test2.txt'
			});

			const result = await generator();
			expect(result.text).to.equal('2');
		});

		it('should throw if async loader fails to find text at creation time', async () => {
			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: new AsyncStringLoader(),
				prompt: 'nonexistent-async.txt'
			});

			await expect(generator()).to.be.rejectedWith(/not found/);
		});

		it('should throw if async loader fails to find text at runtime', async () => {
			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: new AsyncStringLoader()
			});

			await expect(generator('nonexistent-async.txt')).to.be.rejectedWith(/not found/);
		});

		it('should work with functional async loaders', async () => {
			const functionalAsyncLoader = (name: string): Promise<string> => {
				const templates: Record<string, string> = {
					'async-func.txt': 'Output only the number 7.'
				};
				return Promise.resolve(templates[name] || '');
			};

			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: functionalAsyncLoader,
				prompt: 'async-func.txt'
			});

			const result = await generator();
			expect(result.text).to.equal('7');
		});

		it('should handle mixed sync and async loaders', async () => {
			const syncLoader = new StringLoader();
			syncLoader.addString('mixed.txt', 'Output only the number 5.');

			const asyncLoader = new AsyncStringLoader();
			asyncLoader.addString('mixed.txt', 'Output only the number 6.');

			// The first loader to return a value will be used
			const generator = create.TextGenerator.loadsText({
				model,
				temperature,
				loader: [asyncLoader, syncLoader],
				prompt: 'mixed.txt'
			});

			const result = await generator();
			expect(result.text).to.equal('5');
		});
	});
});