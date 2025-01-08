# Cascador – An AI Agent Framework

Cascador is an experimental AI agent framework built on top of the [Vercel AI SDK](https://sdk.vercel.ai/) and [Cascada](https://github.com/geleto/cascada), a fork of [Nunjucks](https://mozilla.github.io/nunjucks/). It simplifies workflows involving text generation, streaming, and structured data using large language models (LLMs). Cascador enables complex AI workflows with minimal overhead by combining robust templating and standardized LLM integrations.
**
**Note**: This documentation is for a project in the **experimental stage**. Cascador is in early development, with the codebase and architecture rapidly evolving. Many documented features are under development and may not be fully implemented yet. This documentation serves as an implementation reference and should not be considered production-ready.

## About the Framework

Cascador is built on two main technologies:

1. **Vercel AI SDK Core**

   Provides standardized integration with various Large Language Model providers such as:
   OpenAI, Azure, Anthropic, Amazon Bedrock, Google Generative AI, Google Vertex AI, Mistral, x.AI Grok.

2. **Cascada**

   [Cascada](https://github.com/geleto/cascada/) is a template engine (fork from [Nunjucks](https://mozilla.github.io/nunjucks/))  designed to handle asynchronous operations seamlessly.

   It automatically parallelizes independent components during rendering while managing data dependencies, all without requiring special syntax or explicit async handling. Cascada is ideal for AI agent workflows where templates often involve long-running tasks like LLM calls, reasoning steps, or external API requests. Some key features are:
	- Automatic parallelization of independent operations
	- Seamless handling of async operations without special syntax
	- Support for async iterators and generators
	- Template inheritance and composition
	- Full programming constructs: variables, expressions, loops, conditionals, functions, scoping rules...

## Features

1. **Parallelized Asynchronous Templating**: Use [Cascada](https://github.com/geleto/cascada) for easy templating that can handle async operations and can be automatically parallelized - no constructs or special syntax is needed.
2. **Flexible Outputs**: Generate text, stream responses, and create structured objects (using schemas like Zod or JSON Schema).
3. **Filter Support**: Transform text, extract data (e.g., code blocks), and handle streams with built-in or custom filters.
4. **Hierarchical Context**: Share and extend context across generators using the `parent` property.

## Installation

```bash
TODO
```

## Classes

Cascador provides four generator classes and one configuration class:

| Class              | Vercel AI SDK Method                                                                                   | Return Type                           | Description                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------- |
| **TextGenerator**   | [`generateText`](https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#generatetext)                 | `Promise<string>`                     | Generates text from a prompt.                                               |
| **TextStreamer**    | [`streamText`](https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#streamtext)                     | `ReadableStream` (text chunks)        | Streams text in real-time for interactive use cases.                        |
| **ObjectGenerator** | [`generateObject`](https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data#generate-object) | `Promise<object | array>`            | Generates structured data based on a schema.                                |
| **ObjectStreamer**  | [`streamObject`](https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data#stream-object)     | `ReadableStream` (objects/arrays)     | Streams structured objects or arrays incrementally.                         |
| **Config**          | -                                                                                                     | -                                    | Stores shared configurations for consistent generator behavior.             |

## Common Properties

### **model**

Specifies the AI model to use, defined via the [Vercel AI SDK Provider](https://sdk.vercel.ai/providers/ai-sdk-providers).

```js
import { openai } from '@ai-sdk/openai';

const generator = new TextGenerator({
  model: openai('gpt-4-turbo'),
  prompt: 'Hello, world!',
});
```

### **Vercel AI SDK Parameters**

Supports standard configuration options, including:

- **temperature**: Controls response randomness.
- **maxTokens**: Limits the number of tokens in responses.
- **frequencyPenalty** / **presencePenalty**: Adjust token repetition penalties.

See the [Vercel AI SDK Settings](https://sdk.vercel.ai/docs/ai-sdk-core/settings) for a complete list.

### **parent**

Allows inheriting properties (e.g., `model`, `context`, `temperature`) from another generator. The child generator’s `context` automatically extends the parent’s `context`.

```js
const baseConfig = new Config({ temperature: 0.7 });

const generator = new TextGenerator({
  parent: baseConfig,
  prompt: 'Hello, {{ userName }}!',
});
```

### **context**

Provides data and methods available in the prompt as a [Cascada template](https://github.com/geleto/cascada). Enables async capabilities like API calls or processing streams.

```js
const generator = new TextGenerator({
  model: openai('gpt-4'),
  context: {
    fetchData: async () => {
      const response = await fetch('https://api.example.com/data');
      return response.json();
    },
  },
  prompt: 'The fetched data is: {{ fetchData() }}',
});
```

### **filters**

Filters can be used to:

- Extract data (e.g., code blocks from text).
- Process text or objects.
- Handle streams, such as converting them into promises with the built-in `streamToPromise` filter.

```js
const filters = {
  extractCode: async (input) => {
    const match = input.match(/```([\s\S]*?)```/);
    return match ? match[1].trim() : '';
  },
};

const generator = new TextGenerator({
  model: openai('gpt-4'),
  filters,
  prompt: 'Generate a simple game in JavaScript: {{ "```js" }}',
});
```

### **prompt**

The main template. When `context` is provided, the prompt becomes a [Cascada template](https://github.com/geleto/cascada), allowing for async logic, loops, and filters.

### **loader**

A [Nunjucks loader](https://mozilla.github.io/nunjucks/api.html#loader) for loading templates from external sources. Required for using `{% include %}`, `{% import %}`, or `{% extends %}`.

### **promptName**

If set, the prompt will be loaded via the `loader` using this name instead of being defined inline.

## Examples

### 1. **Text Generation**

```js
const generator = new TextGenerator({
  model: openai('gpt-4'),
  prompt: 'Describe {{ topic }} in 3 sentences.',
  context: { topic: 'quantum mechanics' },
});

const result = await generator();
console.log(result);
```

### 2. **Streaming Text**

```js
const streamer = new TextStreamer({
  model: openai('gpt-4'),
  prompt: 'Write a poem about the sea.',
});

for await (const chunk of streamer()) {
  process.stdout.write(chunk);
}
```

### 3. **Structured Data with Schema**

```js
import { z } from 'zod';

const generator = new ObjectGenerator({
  model: openai('gpt-4'),
  schema: z.object({
    name: z.string(),
    age: z.number(),
    hobbies: z.array(z.string()),
  }),
  prompt: 'Generate a person profile in JSON format.',
});

const data = await generator();
console.log(data); // { name: 'Alice', age: 25, hobbies: ['reading', 'hiking'] }
```

### 4. **Chained Generators**

```js
const writer = new TextGenerator({
  model: openai('gpt-4'),
  prompt: 'Write a short story about {{ topic }}.',
  context: { topic: 'time travel' },
});

const critic = new TextGenerator({
  model: openai('gpt-4'),
  prompt: 'Critique the story: {{ story }}',
});

const agent = new TextGenerator({
  context: { generateStory: writer, reviewStory: critic },
  prompt: `
    {% set story = generateStory() %}
    Story: {{ story }}
    Review: {{ reviewStory({ story: story }) }}
  `,
});

console.log(await agent());
```

## Roadmap
The following tasks are not documented:
- **Embeddings Support**: Add functionality for vector-based text embeddings.
- **Image Generation**: Generate images using tools like DALL-E.
- **`onStepFinish` Callback**: Handle intermediate steps during generation for more control.
- **Error handling and recovery**: Auto-retry when it makes sense, provide a callback. Use future Cascada try/except for non-recoverable errors