/* eslint-disable @typescript-eslint/no-unused-expressions */
import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { z } from 'zod';
import { create } from '../src/index';
import { model, temperature, timeout } from './common';
import { ConfigError } from '../src/validate';
import {
	extractCallArguments,
	// The augment functions are tested through the public API, so direct import is not needed.
	// augmentGenerateText,
	// augmentStreamText,
} from '../src/llm';
import { ModelMessage } from 'ai';

// Configure chai-as-promised
chai.use(chaiAsPromised);
const { expect } = chai;

describe.only('Messages, Conversation & Integration', function () {
	this.timeout(timeout); // Increase timeout for tests that call the real API

	// --- Unit Tests (Isolated Logic) ---
	describe('Unit Tests (Isolated Logic)', () => {
		describe('extractCallArguments', () => {
			const messages: ModelMessage[] = [{ role: 'user', content: 'hello' }];
			const context = { user: 'test' };
			const prompt = 'a prompt';

			it('should parse a single messages argument', () => {
				const result = extractCallArguments(messages);
				expect(result).to.deep.equal({ prompt: undefined, messages, context: undefined });
			});

			it('should parse a single context argument', () => {
				const result = extractCallArguments(context);
				expect(result).to.deep.equal({ prompt: undefined, messages: undefined, context });
			});

			it('should parse a single prompt argument', () => {
				const result = extractCallArguments(prompt);
				expect(result).to.deep.equal({ prompt, messages: undefined, context: undefined });
			});

			it('should parse prompt and messages arguments', () => {
				const result = extractCallArguments(prompt, messages);
				expect(result).to.deep.equal({ prompt, messages, context: undefined });
			});

			it('should parse prompt and context arguments', () => {
				const result = extractCallArguments(prompt, context);
				expect(result).to.deep.equal({ prompt, messages: undefined, context });
			});

			it('should parse messages and context arguments', () => {
				const result = extractCallArguments(messages, context);
				expect(result).to.deep.equal({ prompt: undefined, messages, context });
			});

			it('should parse prompt, messages, and context arguments', () => {
				const result = extractCallArguments(prompt, messages, context);
				expect(result).to.deep.equal({ prompt, messages, context });
			});

			it('should throw when messages are provided twice', () => {
				expect(() => extractCallArguments(messages, messages)).to.throw('Messages provided multiple times');
			});

			it('should throw when context is provided twice', () => {
				expect(() => extractCallArguments(context, context)).to.throw('Context provided multiple times');
			});

			it('should throw on invalid third argument (context without messages)', () => {
				expect(() => extractCallArguments(prompt, context, context)).to.throw('Third argument (context) is only allowed when the second argument is messages.');
			});

			it('should throw when the third argument is not a context object', () => {
				expect(() => extractCallArguments(prompt, messages, messages as unknown as Record<string, unknown>)).to.throw('Third argument (context) must be an object');
			});
		});

		describe('Result Augmentation (via public API)', () => {
			const systemMessage: ModelMessage = { role: 'system', content: 'You are a test bot.' };

			// We test augmentation through the public API, as the internal `augment` functions are an implementation detail.
			it('should augment generateText result with messageHistory', async () => {
				const generator = create.TextGenerator({
					model,
					temperature,
					messages: [systemMessage],
				});

				const result = await generator('Reply with "OK".');

				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;

				// system, user, assistant
				expect(history).to.have.lengthOf(3);
				expect(history[0].role).to.equal('system');
				expect(history[1].role).to.equal('user');
				expect(history[2].role).to.equal('assistant');

				// Check memoization (identity check)
				const history2 = result.response.messageHistory;
				expect(history).to.equal(history2);
			});

			it('should augment streamText result with messageHistory', async () => {
				const streamer = create.TextStreamer({
					model,
					temperature,
					messages: [systemMessage],
				});

				const result = await streamer('Reply with "OK".');
				// consume stream to resolve the response promise
				for await (const chunk of result.textStream) { void chunk; }

				const response = await result.response;
				expect(response).to.have.property('messageHistory');

				const history = response.messageHistory;
				expect(history).to.have.lengthOf(3); // system, user, assistant
				expect(history[0].role).to.equal('system');

				// Check memoization (identity check)
				const history2 = response.messageHistory;
				expect(history).to.equal(history2);
			});
		});
	});

	// --- Integration Tests (Factory-Level Behavior) ---
	describe('Integration Tests (Factory-Level Behavior)', () => {
		const simpleUserMessage: ModelMessage[] = [{ role: 'user', content: 'This is a test. Reply only with the word "Acknowledged".' }];
		const simpleSystemMessage: ModelMessage[] = [{ role: 'system', content: 'You are a test bot.' }];

		describe('Call-Time Validation & Precedence', () => {
			it('should succeed in text mode with only messages', async () => {
				const generator = create.TextGenerator({ model, temperature });
				const promise = generator(simpleUserMessage);
				await expect(promise).to.not.be.rejected;
				expect((await promise).text).to.equal('Acknowledged');
			});

			it('should fail in template mode with only messages and no configured prompt', async () => {
				const generator = create.TextGenerator.withTemplate({ model, temperature });
				// The call is invalid because a prompt string is required for rendering
				// @ts-expect-error - we want to test the error
				const promise = generator(simpleUserMessage);
				await expect(promise).to.be.rejectedWith(ConfigError, /Prompt is required/);
			});

			it('should use a one-off template string over a configured prompt', async () => {
				const generator = create.TextGenerator.withTemplate({
					model,
					temperature,
					prompt: 'Config: {{name}}',
					context: { name: 'World' },
				});
				const result = await generator('One-off: {{name}}');
				expect(result.text).to.equal('One-off: World');
			});

			it('should merge runtime context with configured context', async () => {
				const generator = create.TextGenerator.withTemplate({
					model,
					temperature,
					prompt: 'Output only this, with spaces: {{a}} {{b}} {{c}}',
					context: { a: 1, b: 2 },
				});
				const result = await generator({ b: 99, c: 3 });
				expect(result.text).to.equal('1 99 3');
			});
		});

		describe('Text Mode Renderers', () => {
			it('should use call-time messages over configured messages', async () => {
				const generator = create.TextGenerator({
					model,
					temperature,
					messages: [{ role: 'system', content: 'Always answer in Spanish.' }],
				});
				// This system message should override the configured one.
				const result = await generator('Say "hello".', [{ role: 'system', content: 'Always answer in French.' }]);
				expect(result.text.toLowerCase()).to.equal('bonjour.');
			});

			it('should append a non-empty prompt as a user message and augment the result', async () => {
				const generator = create.TextGenerator({ model, temperature, messages: simpleSystemMessage });
				const result = await generator('Reply only with "OK".');

				expect(result.text).to.equal('OK');
				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;
				expect(history).to.have.lengthOf(3); // system, user, assistant
				expect(history[1].content).to.equal('Reply only with "OK".');
			});

			it('should not append an empty prompt and not augment the result', async () => {
				const generator = create.TextGenerator({ model, temperature, messages: simpleSystemMessage });
				const result = await generator(''); // Empty prompt

				// Check that the original 'messages' are used without augmentation
				const baseMessages = result.response.messages;
				expect(baseMessages).to.have.lengthOf(2); // system, assistant (no user prompt)
				expect(result.response).to.not.have.property('messageHistory');
			});
		});

		describe('Template & Script Mode Renderers', () => {
			it('should append a rendered template string as a user message and augment the result', async () => {
				const generator = create.TextGenerator.withTemplate({
					model,
					temperature,
					messages: simpleSystemMessage,
					prompt: 'The user instruction is: {{instruction}}. Reply only with "Confirmed".',
				});
				const result = await generator({ instruction: 'Execute' });

				expect(result.text).to.equal('Confirmed');
				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;
				expect(history[1].content).to.equal('The user instruction is: Execute. Reply only with "Confirmed".');
			});

			it('should append a rendered script string as a user message and augment the result', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
					messages: simpleSystemMessage,
				});
				const result = await generator(':data @data = "Execute order " + order + ". Reply only with the number." ', { order: 66 });

				expect(result.text).to.equal('66');
				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;
				expect(history[1].content).to.equal('Execute order 66. Reply only with the number.');
			});

			it('should concatenate messages from a script with base messages', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
					messages: [{ role: 'system', content: 'The answer is always 42.' }],
				});
				const result = await generator(':data @data = [{ role: "user", content: "What is the answer to everything?" }]');
				expect(result.text).to.include('42');
				expect(result.response).to.not.have.property('messageHistory'); // Not augmented
			});

			it('should use only the script-returned messages if no base messages exist', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
				});
				const result = await generator(':data @data = [{ role: "user", content: "Output only the number 2." }]');
				expect(result.text).to.equal('2');
				expect(result.response).to.not.have.property('messageHistory'); // Not augmented
			});

			it('should throw ZodError if a script returns a malformed message object', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
					// This script returns an object missing the 'role' property
				});
				await expect(generator(':data @data = [{ content: "This is invalid" }]')).to.be.rejectedWith(z.ZodError);
			});
		});
	});

	// --- Advanced Scenarios & End-to-End Workflows ---
	describe('Advanced Scenarios & End-to-End Workflows', () => {
		describe('Multi-Turn Conversation Chaining', () => {
			const agent = create.TextGenerator({
				model,
				temperature,
				messages: [{ role: 'system', content: 'You are a counter. When the user says "count", you reply with the next number, starting at 1. Only output the number.' }],
			});
			let conversationHistory: ModelMessage[] = [];

			it('should initiate a conversation and return augmented history', async () => {
				const result = await agent('count');
				expect(result.text).to.equal('1');

				conversationHistory = result.response.messageHistory;
				expect(conversationHistory).to.be.an('array').with.lengthOf(3);
				expect(conversationHistory[0].role).to.equal('system');
				expect(conversationHistory[1].role).to.equal('user');
				expect(conversationHistory[2].role).to.equal('assistant');
			});

			it('should continue a conversation using history and a new prompt', async () => {
				const result = await agent('count', conversationHistory);
				expect(result.text).to.equal('2');

				conversationHistory = result.response.messageHistory;
				expect(conversationHistory).to.be.an('array').with.lengthOf(5);
				expect(conversationHistory[3].role).to.equal('user');
				expect(conversationHistory[4].role).to.equal('assistant');
			});

			it('should continue with only history and no new prompt', async () => {
				const agentWithMemory = create.TextGenerator({
					model,
					temperature,
					prompt: 'Based on our chat, what was the last number I asked you to count to?',
				});
				// Pass the history from the previous turn. The new prompt will be appended.
				const result = await agentWithMemory(conversationHistory);
				expect(result.text).to.include('2');
				expect(result.response).to.have.property('messageHistory');
			});
		});

		describe('Tool Use within a Conversation Chain', () => {
			const toolParent = create.TextGenerator({ model, temperature });
			const getWeatherTool = create.Tool({
				description: 'Get the weather for a city',
				parameters: z.object({ city: z.string() }),
			}, toolParent);
			const agent = create.TextGenerator({
				model,
				temperature,
				tools: { getWeather: getWeatherTool },
			});
			let conversationHistory: ModelMessage[] = [];

			it('should call a tool when prompted', async () => {
				const result = await agent('What is the weather in San Francisco?');
				expect(result.toolCalls).to.be.an('array').with.lengthOf(1);
				expect(result.toolCalls[0].toolName).to.equal('getWeather');
				conversationHistory = result.response.messageHistory;
			});

			it('should use tool result to answer the user', async () => {
				// Simulate tool execution and create the result message
				const toolCall = (conversationHistory.at(-1)!.content as unknown as { type: 'tool-call'; toolCallId: string }[])[0];
				const toolResult = ({
					role: 'tool',
					content: [{
						type: 'tool-result',
						toolCallId: toolCall.toolCallId,
						toolName: 'getWeather',
						output: 'San Francisco: 75, Sunny',
					}],
				} as unknown) as ModelMessage;

				const historyWithToolResult: ModelMessage[] = [...conversationHistory, toolResult];
				const result = await agent(historyWithToolResult);

				expect(result.text).to.include('75').and.to.include('Sunny');
				expect(result.toolCalls).to.be.empty;
			});
		});

		describe('Cross-Renderer Conversation Chaining', () => {
			it('should pass conversation history from a TextGenerator to an ObjectGenerator', async () => {
				const chatAgent = create.TextGenerator({
					model,
					temperature,
					messages: [{ role: 'system', content: 'Have a casual conversation about a user\'s order.' }],
				});

				// Have a conversation
				const res1 = await chatAgent('Hi, I need to order a large pizza.');
				const history1 = res1.response.messageHistory;
				const res2 = await chatAgent('Please add pepperoni and mushrooms.', history1);
				const finalHistory = res2.response.messageHistory;

				// Extract from the conversation
				const extractionAgent = create.ObjectGenerator.withTemplate({
					model,
					schema: z.object({
						size: z.string(),
						toppings: z.array(z.string()),
					}),
					prompt: 'From the above conversation, extract the final pizza order into a JSON object.',
				});

				const extractionResult = await extractionAgent(finalHistory);

				expect(extractionResult.object).to.deep.equal({
					size: 'large',
					toppings: ['pepperoni', 'mushrooms'],
				});
			});
		});
	});
});