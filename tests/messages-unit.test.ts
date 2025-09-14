
import 'dotenv/config';
// Non-public API unit tests, do not import anything from the compiled cascador-ai
import {
	extractCallArguments,
	// The augment functions are tested through the public API, so direct import is not needed.
	// augmentGenerateText,
	// augmentStreamText,
} from '../src/llm-renderer';
import { ModelMessage } from 'ai';
import { expect } from 'chai';
import { timeout } from './common';

describe('Messages, Conversation & Integration', function () {
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
				expect(() => extractCallArguments(messages, messages)).to.throw('Messages provided multiple times across arguments');
			});

			it('should throw when context is provided twice', () => {
				expect(() => extractCallArguments(context, context)).to.throw('Context provided multiple times across arguments');
			});

			it('should throw on invalid third argument (context without messages)', () => {
				expect(() => extractCallArguments(prompt, context, context)).to.throw('Third argument (context) is only allowed when the second argument is messages.');
			});

			it('should throw when the third argument is not a context object', () => {
				expect(() => extractCallArguments(prompt, messages, messages as unknown as Record<string, unknown>)).to.throw('Third argument (context) must be an object');
			});
		});
	});
});
