/* eslint-disable @typescript-eslint/no-unused-expressions */
import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create, StreamTextResult } from '../src/index';
import { model, temperature, modelName, StringLoader, createProvider, timeout } from './common';
import { ConfigError } from '../src/validate';
import { streamText } from 'ai';

// Configure chai-as-promised
chai.use(chaiAsPromised);

const { expect } = chai;

// Helper to consume a text stream and return the full string
async function streamToString(stream: StreamTextResult<any, any>['textStream']): Promise<string> {
	let text = '';
	for await (const delta of stream) {
		text += delta;
	}
	return text;
}

describe('create.TextStreamer', function () {
	this.timeout(timeout); // Increase timeout for tests that call the real streaming API

	// Simple prompts for easy and cheap verification
	const simplePrompt = "Write only the exact word 'Hello' without the quotes while keeping the case. Output it in this exact case: 'Hello'. Write nothing else.";
	const simpleExpected = 'Hello';

	describe('Core Functionality', () => {
		it('should stream text with a simple prompt and model', async () => {
			const streamer = create.TextStreamer({
				model, temperature,
				prompt: simplePrompt,
			});
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal(simpleExpected);
		});

		// vercel bug, result.text does not resolve, the stream is ok
		it.skip('should provide the full text in the resolved .text promise', async () => {
			const streamer = create.TextStreamer({ model, temperature, prompt: simplePrompt });
			const result = await streamer();
			const fullText = await result.text;
			expect(fullText).to.equal(simpleExpected);
		});

		// vercel bug, result.text does not resolve, the stream is ok
		it.skip('should provide the full text using Vercel streamText directly', async () => {
			const result = streamText({
				model, temperature,
				prompt: simplePrompt,
			});
			const fullText = await result.text;
			expect(fullText).to.equal(simpleExpected);
		});

		it('should stream text when the prompt is a runtime argument', async () => {
			const streamer = create.TextStreamer({ model });
			const result = await streamer(simplePrompt);
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal(simpleExpected);
		});

		it('should treat the prompt as plain text by default, not processing templates', async () => {
			const streamer = create.TextStreamer({
				model, temperature,
				prompt: 'Write this exactly: {{ test }}',
			});
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('{{ test }}');
		});

		it('should pass through Vercel AI SDK properties like temperature', async () => {
			const streamer = create.TextStreamer({
				model, temperature,
				prompt: 'Write a one-word color.',
			});
			// It's hard to test randomness, so we verify the property is set in the config
			expect(streamer.config.temperature).to.equal(temperature);
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.be.a('string').with.length.above(0);
		});

		it('should call onFinish callback with final data when stream completes', async () => {
			let resolveFinish: (data: { text: string, finishReason: string }) => void;
			const finishPromise = new Promise<{ text: string, finishReason: string }>((resolve) => {
				resolveFinish = resolve;
			});

			const streamer = create.TextStreamer({
				model, temperature,
				prompt: simplePrompt,
				onFinish(data) {
					resolveFinish(data);
				},
			});

			const result = await streamer();
			const streamedText = await streamToString(result.textStream);

			expect(streamedText).to.equal(simpleExpected);
			// Wait for the onFinish callback to be called
			const finalData = await finishPromise;
			expect(finalData).to.be.an('object');
			expect(finalData.text).to.equal(simpleExpected);
			expect(finalData.finishReason).to.equal('stop');
		});

		it('should call onError callback when an error occurs', async () => {
			const anthropicProvider = createProvider({ apiKey: 'invalid-key' });
			const badModel = anthropicProvider(modelName);
			let resolveError: (error: Error) => void;
			const errorPromise = new Promise<Error>((resolve) => {
				resolveError = resolve;
			});

			const streamer = create.TextStreamer({
				model: badModel,
				temperature,
				prompt: 'This will fail.',
				onError({ error }) {
					resolveError(error as Error);
				},
			});

			const result = await streamer();
			// Consume the stream to trigger the flow
			await streamToString(result.textStream).catch(() => {
				// Expected to fail
			});

			const errorCaught = await errorPromise;
			expect(errorCaught).to.be.an.instanceOf(Error);
			expect(errorCaught.message).to.include('invalid x-api-key');
		});
	});

	describe('Configuration & Inheritance', () => {
		const parentConfig = create.Config({
			model, temperature,
			context: {
				item: 'apples',
				source: 'parent',
			},
			filters: {
				parens: (s: string) => `(${s})`,
			},
		});

		it('should inherit properties from a parent create.Config object', async () => {
			const streamer = create.TextStreamer.withTemplate(
				{
					prompt: 'Write only this and nothing else, including any parentheses: {{ item | parens }}.',
				},
				parentConfig,
			);
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);

			expect(streamer.config.model).to.be.ok;
			expect(streamer.config.temperature).to.equal(temperature);
			expect(streamedText).to.equal('(apples)');
		});

		it('should inherit from another TextStreamer instance', async () => {
			const parentStreamer = create.TextStreamer.withTemplate({
				model, temperature,
				context: { user: 'Alice' },
				filters: { scream: (s: string) => s.toUpperCase() + '!!!' },
			});

			const childStreamer = create.TextStreamer.withTemplate({
				prompt: 'Write this and nothing else: {{ user | scream }}',
			}, parentStreamer);

			const result = await childStreamer();
			const streamedText = await streamToString(result.textStream);

			expect(childStreamer.config.model).to.exist;
			expect(streamedText).to.equal('ALICE!!!');
		});

		it('should override parent properties with child properties', async () => {
			const streamer = create.TextStreamer.withTemplate(
				{
					temperature: 0.9,
					prompt: 'Write only this and nothing else: {{ item }}',
				},
				parentConfig,
			);
			expect(streamer.config.temperature).to.equal(0.9);
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('apples');
		});

		it('should merge "context" objects (child overrides parent keys)', async () => {
			const streamer = create.TextStreamer.withTemplate(
				{
					context: { item: 'oranges', source: 'child' },
					prompt: 'Write this and nothing else: Item: {{ item }}, Source: {{ source }}',
				},
				parentConfig,
			);
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('Item: oranges, Source: child');
		});

		it('should merge "filters" objects', async () => {
			const streamer = create.TextStreamer.withTemplate(
				{
					filters: { stars: (s: string) => `*${s}*` },
					prompt: 'Write only this and nothing else, including any parentheses: {{ item | parens | stars }}.',
				},
				parentConfig,
			);
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('*(apples)*');
		});

		it('should merge and deduplicate "loader" arrays', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const parent = create.Config({ loader: loader1 });
			const streamer = create.TextStreamer.withTemplate(
				{ model, temperature, loader: [loader1, loader2] },
				parent,
			);
			expect(streamer.config.loader).to.be.an('array').with.lengthOf(2);
			expect(streamer.config.loader).to.deep.equal([loader1, loader2]);
		});

		it('should correctly handle a three-level inheritance chain and call the LLM', async () => {
			const grandparent = create.Config({
				context: {
					items: ['Apple'],
					source: 'Grandparent'
				},
				filters: {
					f1: (arr: string[]) => [...arr, 'Banana'] // Add Banana
				},
			});

			const parent = create.Config({
				context: {
					source: 'Parent'
				},
				filters: {
					f2: (arr: string[]) => [...arr, 'Cherry'] // Add Cherry
				},
			}, grandparent);

			const childStreamer = create.TextStreamer.withTemplate({
				model, temperature,
				context: {
					source: 'Child'
				},
				prompt: 'You are a summarizer. Your task is to summarize the following list of items into a single sentence starting with "The final list contains" followed immediately by the comma-separated list items wuth no "and" or quotes. Do not include the word "Items:". List: {{ items | f1 | f2 | join(", ") }}.',
			}, parent);


			expect(childStreamer.config.context).to.deep.equal({ items: ['Apple'], source: 'Child' });
			expect(childStreamer.config.filters).to.have.keys('f1', 'f2');


			const result = await childStreamer();
			const streamedText = await streamToString(result.textStream);


			expect(streamedText).to.match(/^The final list contains/);
			const textWithoutSpaces = streamedText.replace(/\s/g, '');
			expect(textWithoutSpaces).to.include('Apple,Banana,Cherry');
			expect(streamedText).to.not.include('You are a summarizer');
			expect(streamedText).to.not.include('List:');
		});
	});

	describe('Template Engine Features', () => {
		it('should render a template using a static context value from config', async () => {
			const streamer = create.TextStreamer.withTemplate({
				model, temperature,
				prompt: 'Write only the word and nothing else. The word is {{ word }}.',
				context: { word: 'test' },
			});
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('test');
		});

		it('should resolve an asynchronous function in the context', async () => {
			const streamer = create.TextStreamer.withTemplate({
				model, temperature,
				prompt: 'Write only the value and nothing else. The value is {{ value() }}.',
				context: { value: async () => Promise.resolve('async') },
			});
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('async');
		});

		it('should apply an asynchronous filter', async () => {
			const streamer = create.TextStreamer.withTemplate({
				model, temperature,
				prompt: 'Write the following text exactly as shown, preserving the original case of each letter: {{ word | asyncUpper }}',
				context: { word: 'test' },
				filters: { asyncUpper: async (s: string) => Promise.resolve(s.toUpperCase()) },
			});
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('TEST');
		});
	});

	describe('Loader Functionality', () => {
		const stringLoader = new StringLoader();
		stringLoader.addTemplate('simple.njk', 'Write only the number {{ number }} and nothing else.');
		stringLoader.addTemplate('filtered.njk', 'Write the following text exactly as shown, preserving all punctuation and the original case of each letter: {{ text | shout }}');

		it('should load and render a template from a loader', async () => {
			const streamer = create.TextStreamer.loadsTemplate({
				model, temperature,
				loader: stringLoader,
				prompt: 'simple.njk',
			});
			const result = await streamer({ number: 5 });
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('5');
		});

		it('should use context and filters with a loaded template', async () => {
			const streamer = create.TextStreamer.loadsTemplate({
				model, temperature,
				loader: stringLoader,
				prompt: 'filtered.njk',
				filters: { shout: (s: string) => `${s.toUpperCase()}!` },
			});
			const result = await streamer({ text: 'hello' });
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal('HELLO!');
		});
	});

	describe('Callable Interface Overloads', () => {
		const streamerWithPrompt = create.TextStreamer.withTemplate({
			model, temperature,
			prompt: 'Write only the value {{ val }} and nothing else.',
			context: { val: 'A' },
		});

		it('handles call with no arguments: streamer()', async () => {
			const result = await streamToString((await streamerWithPrompt()).textStream);
			expect(result).to.equal('A');
		});

		it('handles call with context override: streamer({ val: "B" })', async () => {
			const result = await streamToString((await streamerWithPrompt({ val: 'B' })).textStream);
			expect(result).to.equal('B');
		});

		it('handles call with prompt and context override', async () => {
			const result = await streamToString(
				(await streamerWithPrompt('Write only the quotet text but without the quotes: "{{val}}!"', { val: 'C' })).textStream
			);
			expect(result).to.equal('C!');
		});
	});

	describe('Error Handling and Validation', () => {
		it('should throw ConfigError if no model is provided', () => {
			expect(() => create.TextStreamer({ prompt: 'test' } as never)).to.throw(
				ConfigError,
				'TextStreamer config requires a \'model\' property',
			);
		});

		it('should throw ConfigError if .loadsTemplate is used but no loader is provided', () => {
			expect(() =>
				// @ts-expect-error - no loader provided
				create.TextStreamer.loadsTemplate({
					model, temperature,
					prompt: 'file.njk',
				}),
			).to.throw(
				ConfigError,
				`requires a 'loader'`,
			);
		});

		it('should reject promises at runtime if no prompt is provided in config or call', async () => {
			const streamer = create.TextStreamer({ model });
			// The call returns promises that should reject
			expect(() => streamer(undefined as unknown as string)).to.throw(
				ConfigError,
				'Either prompt argument or config.prompt/messages required',
			);
		});

		it('should reject promises if a filter throws an error', async () => {
			const streamer = create.TextStreamer.withTemplate({
				model, temperature,
				prompt: '{{ "test" | badFilter }}',
				filters: { badFilter: () => { throw new Error('Filter failed'); } },
			});
			const result = streamer();
			await expect(result).to.be.rejectedWith('Filter failed');
		});

		it('should reject promises if a loader fails to find a template', async () => {
			const streamer = create.TextStreamer.loadsTemplate({
				model, temperature,
				loader: new StringLoader(),
				prompt: 'nonexistent.njk',
			});
			const result = streamer();
			await expect(result).to.be.rejectedWith(/template not found/i);
		});
	});
});