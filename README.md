# Cascador-AI – An AI Agent Framework

[Cascador-AI](https://github.com/geleto/cascador-ai) is an AI agent framework that combines the [Vercel AI SDK](https://sdk.vercel.ai/) with the [Cascada Template Engine](https://github.com/geleto/cascada) (a fork of [Nunjucks](https://mozilla.github.io/nunjucks/)). Its core strength is automatically parallelized asynchronous templating, letting you write simple templates to orchestrate multiple Large Language Model (LLM) operations without explicit async/await handling or special constructs.

Here's an improved introduction for your document:

---

# Cascador-AI – A Framework for Simplified AI Orchestration

With [Cascador-AI](https://github.com/geleto/cascador-ai), you can focus on defining what your AI agents should achieve, while the framework handles the intricate details of orchestration, concurrency, and dependency management. Using an intuitive templating approach, Cascador-AI makes it easy to describe workflows in a way that’s both simple and flexible - no need to deal with complex async code or specialized constructs. Cascador-AI delivers simplicity, flexibility and performance in one package.

**Note**: This documentation is for a project in the **experimental stage**. Cascador is in early development, with the codebase and architecture rapidly evolving. Many documented features are under development and may not be fully implemented yet. This documentation serves as an implementation reference and should not be considered production-ready.

## Features

1. **Define Workflows with Automatically Parallelized Async Templating**

	The [Cascada Template Engine](https://github.com/geleto/cascada) (a fork of [Nunjucks](https://mozilla.github.io/nunjucks/)) provides seamless async templating with automatic parallelization - no special syntax or explicit promise handling required. It automatically parallelizes concurrent tasks like LLM calls, API requests, and data processing while intelligently managing dependencies.

	[Cascada](https://github.com/geleto/cascada) offers a complete programming model that makes templates dynamic and reusable. Features include template inheritance and composition, properly scoped variables, expressions, loops, conditionals, and functions.

2. **Standardized LLM Integrations**

   Built on the [Vercel AI SDK Core](https://sdk.vercel.ai/), which provides standardized integration with various Large Language Model providers such as:
   OpenAI, Azure, Anthropic, Amazon Bedrock, Google Generative AI, Google Vertex AI, Mistral, x.AI Grok...

3. **Rich Context Objects**

	Context objects provide dynamic data and functionality to templates, supporting both static values and async sources like API calls or database queries. This makes it easy to integrate external services or encapsulate logic directly within templates for flexible and extensible workflows.

4. **Flexible Outputs**

   Generate or stream text and structured data (using [Zod](https://github.com/colinhacks/zod) or JSON Schema).

5. **Hierarchical Context and Configurations**

   Generators and streamers can inherit properties from a shared configuration or parent generator. This allows defining hierarchical setups such as a base configuration, individual prompts with different LLMs, orchestrating agents for complex workflows, or exposing distinct APIs and data to different agents and prompts.

## Installation

```bash
TODO
```

## Quick Start

This example demonstrates how to:
1. Define a base configuration that is shared across all generators.
2. Read a synopsis in the template from a file.
3. Expand the synopsis into a story.
4. Critique it.
4. Translate both the story and the critique into a specified language.

Generating the critique and translating the story will run in parallel, as these are two independent operations, but both must wait for the story generation to complete first.

```js
import fs from 'fs/promises';
import { openai } from '@ai-sdk/openai';
import { Config, TextGenerator } from 'cascador-ai';
import translate from 'translate';

translate.engine = "google";

// Base configuration
const baseConfig = new Config({
  model: openai('gpt-4o'),
  context: {
    language: 'es', // Translation language
  },
  temperature: 0.7,
});

// Generators for story expansion and critique
const storylineGen = new TextGenerator({
  inherit: baseConfig,
  prompt: 'Expand the following synopsis into a short story: {{ synopsis }}',
});

const critiqueGen = new TextGenerator({
  inherit: baseConfig,
  prompt: 'Provide a critical analysis of the following story: {{ story }}',
});

// Main generator (including a translation filter)
const mainGenerator = new TemplateRenderer({
  parent: baseConfig,
  filters: {
    translate: async (input, lang) => await translate(input, lang),
  },
  context: {
    readFile: async (filePath) => await fs.readFile(filePath, 'utf-8'),
    storylineGen,
    critiqueGen,
  },
  prompt: `
    {% set synopsis = readFile('./synopsis.txt') %}
    {% set storyContent = (storylineGen({ synopsis })).text %}
    {% set critiqueContent = (critiqueGen({ story: storyContent })).text %}

    Story ({{ language }}): {{ storyContent | translate(language) }}
    Critique ({{ language }}): {{ critiqueContent }}
  `,
});

// Execute
(async () => {
  const result = await mainGenerator();
  console.log(result);
})();
```

## The Cascador-AI API Classes
Generators and streamers are objects that can also be invoked like functions to produce or stream results. For instance, you can do `const { text } = await someGenerator('prompt')` to get a result, or use `const { textStream } = await someStreamer('prompt'); for await (const chunk of textStream) { ... }` for streaming.

| Class | Parent | Return Type | Description |
|-------|---------|------------|-------------|
| [**Config**](#config) | - | - | Base configuration store that handles merging of configs including context, filters, and loaders. |
| [**TemplateRenderer**](#templaterenderer) | Config | `Promise<string>` | Renders templates using the Cascada template engine with context. Can be called with `(prompt: string, context?: Context)` or `(config: Partial<CommonConfig>)`. |
| [**TextGenerator**](#textgenerator) | LLMRenderer | `Promise<{ text: string, ... }>` [Reference](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-text#returns) | Generates a text response from a prompt (e.g., conversation or summary). |
| [**TextStreamer**](#textstreamer) | LLMRenderer | `Promise<{ textStream: AsyncIterable<string>, ... }>` [Reference](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text#returns) | Streams text in real-time as an AsyncIterable for interactive or continuous output. |
| [**ObjectGenerator**](#objectgenerator) | LLMRenderer | `Promise<{ object: T, ... }>` [Reference](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-object#returns) | Generates structured data validated with a schema (e.g., [Zod](https://github.com/colinhacks/zod)). |
| [**ObjectStreamer**](#objectstreamer) | LLMRenderer | `Promise<{ elementStream: AsyncIterable<T>, ... }>` or `Promise<{ partialObjectStream: AsyncIterable<Partial<T>>, ... }>` [Reference](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-object#returns) | Streams structured objects or arrays incrementally. Object mode uses partialObjectStream for partial updates, array mode uses elementStream for complete elements. |                                                            |

## Calling the Cascador-AI instances
All instances of the Cascador-AI classes can be called as functions in two ways:
1. Prompt string and context object: `const { text } = await generator('Write about {{ topic }}', { topic: 'AI' });`
2. Config object: `const { text } = await generator({ context: { topic: 'AI' }, temperature: 0.7 });`
The same pattern works for all generators/streamers, just with different return properties.

### **TemplateRenderer**
This class renders a template with a given context.

#### Example: Generating Text from Template and Context Object
```js
import { TemplateRenderer } from 'cascador-ai';

const asyncTemplatedGen = new TemplateRenderer({
 prompt: 'Hi {{ name }}! Today is {{ currentDay }}.',
 context: {
   name: async () => (await sql.query('SELECT name FROM users LIMIT 1')).rows[0].name,
   currentDay: new Date().toLocaleDateString(),
 },
});

(async () => {
 const result = await asyncTemplatedGen();
 console.log('Async templated output:', result);
})();
```

### **TextGenerator**

The `TextGenerator` class is used to generate text responses from prompts.

#### Example: Generating Text using LLM

```js
import { TextGenerator } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

const generator = new TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Describe "{{ topic }}" in 3 sentences.',
  context: {
	//The title of today's featured Wikipedia article:
    topic: async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
      const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${today}`;
      return (await (await fetch(url)).json()).tfa.normalizedtitle;
    }
  },
});

(async () => {
  const { text } = await generator();
  console.log('Description:', text);
})();
```

This example demonstrates how to use a `TextGenerator` to produce a brief description of a topic by substituting the `{{ topic }}` placeholder in the template prompt.

### **TextStreamer**

The `TextStreamer` class streams text in real-time, making it ideal for use cases like chat interfaces, live updates, or progressive text rendering.

#### Example: Streaming Text using LLM

```js
import { TextStreamer } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

const streamer = new TextStreamer({
  model: openai('gpt-4o'),
  prompt: 'Write a poem about the sea.',
});

(async () => {
  const { textStream } = await streamer();
  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }
})();
```

This example demonstrates how to use `TextStreamer` to stream chunks of text from the LLM as they are generated.

### **ObjectGenerator**

The `ObjectGenerator` class is used to produce structured data that conforms to a schema. It is especially useful for scenarios where you need to ensure the output's validity or structure.

You can specify how the data should be structured by setting output to:
- object (default)
- enum (for classification tasks with a discrete set of possible values)
- no-schema (no schema validation)

#### Example: Structured Data with Zod Schema using LLM

```js
import { ObjectGenerator } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const generator = new ObjectGenerator({
  model: openai('gpt-4o'),
  schema: z.object({
    name: z.string(),
    age: z.number(),
    hobbies: z.array(z.string()),
  }),
  prompt: 'Generate a random person profile in JSON format.',
});

(async () => {
  const person = (await generator()).object;
  console.log('Generated Person:', person);
})();
```
This example validates the LLM output against a Zod schema to ensure the generated data adheres to the specified structure.

#### Example: Enum result using LLM

```js
import { ObjectGenerator } from 'cascador-ai';

const generator = new ObjectGenerator({
  model: yourModel,
  output: 'enum',
  enum: ['action', 'comedy', 'drama', 'horror', 'sci-fi'],
  prompt:
    'Classify the genre of this movie plot: ' +
    '"A group of astronauts travel through a wormhole..."',
});

(async () => {
  const classification = (await generator()).object;
  console.log('Genre:', classification);
})();
```

### **ObjectStreamer**

The `ObjectStreamer` class streams structured array data incrementally. When combined with the `output: 'array'` option, it streams individual elements from an array.

You can specify how the data should be structured by setting output to:
- object (default)
- array (for a stream of array elements)
- no-schema (no schema validation)

#### Example: Streaming Structured Array Data using LLM

```js
import { ObjectStreamer } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const streamer = new ObjectStreamer({
  model: openai('gpt-4o'),
  schema: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
  output: 'array',
  prompt: 'Generate 3 character descriptions.',
});

(async () => {
  const { elementStream } = await streamer();
  for await (const character of elementStream) {
    console.log(character);
  }
})();
```
This example demonstrates how to stream individual objects (e.g., character descriptions) one-by-one.

#### Example: Streaming Structured Data using LLM

```js
import { openai } from '@ai-sdk/openai';
import { ObjectStreamer } from 'cascador-ai';
import { z } from 'zod';

const streamer = new ObjectStreamer({
  model: openai('gpt-4o'),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    abilities: z.array(z.string())
  }),
  prompt: 'Generate a character description.'
});

(async () => {
  const { partialObjectStream } = await streamer();
  for await (const partial of partialObjectStream) {
    console.log(partial);
  }
})();
```
This example demonstrates streaming partial updates of an object containing character details.

## Common Options for All Generators and Streamers

### parent
Enables hierarchical context and configuration settings. For example, you can define a base config with a default model, temperature and shared context. Then child generators can inherit, override or add to these settings or context properties as needed. You can arrange multiple levels of inheritance - some generators might use different LLMs, while several agents can orchestrate them, each exposing different APIs or context to their prompts.

```js
import { Config, TextGenerator } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

const baseConfig = new Config({
  model: openai('gpt-4o'),
  temperature: 0.7,
  context: {
    async fetchData() => fetch('https://api.example.com/data').then(res => res.json()),
  }
});

const childGenerator = new TextGenerator({
  parent: baseConfig,
  context: {
    greeting: 'Hello from base config!',
  },
  prompt: '{{ greeting }}. Data: {{ fetchData() }}',
});
```

### context
The context contains data and methods utilized in templates. Both the data and the outputs of methods can be asynchronous (i.e., return promises).

### prompt
The [Cascador-AI](https://github.com/geleto/cascador-ai) template string to be rendered. For LLM generators and streamers, the rendered result will be fed to the LLM.

### filters
Filters can extract, process or transform data directly in templates.

Below is an advanced filters example using two generators. The first generator creates an asteroids game in a ```js block, and the second extracts the code block:

```js
const asteroidsGen = new TextGenerator({
  parent: baseConfig,
  prompt: 'Create a simple asteroids-like game in a single file. Output the code in a ```js block.',
});

const extractCodeGen = new TemplateRenderer({
  parent: baseConfig,
  filters: {
    extractCode: (text) => {
      const match = text.match(/```js([\s\S]*?)```/);
      return match ? match[1].trim() : 'No code found';
    },
  },
  prompt:
    `{% set original = (asteroidsGen()).text %}
    Original Output:
    {{ original }}

    Extracted Code:
    {{ original | extractCode }}`,
  context: { asteroidsGen },
});

(async () => {
  const result = await extractCodeGen();
  console.log(result);
})();
```

This example uses a custom filter `extractCode` to extract JavaScript code blocks from the LLM's output.

## loader
Load external templates using a Nunjucks-compatible file loader. The below example uses the built-in FileSystemLoader:
```js
import { FileSystemLoader } from 'cascador-ai';
const fileLoader = new FileSystemLoader('./templates');
const generator = new TemplateRenderer ({
  parent: baseConfig,
  loader: fileLoader,
  prompt: `
    {% include 'part1.njk' %}
    {% include 'part2.njk' %}
  `,
});
```
This example demonstrates how to use `fileLoader` to include multiple external templates within the main prompt.

### promptName
Load a template purely by name:
```js
const generator = new TemplateRenderer({
  parent: baseConfig,
  loader: fileLoader,
  promptName: 'welcome.njk',
});
```
This code references an external template (`welcome.njk`) by its name without defining the prompt inline.

## Vercel AI SDK Parameters

Configure standard LLM settings (e.g., temperature, maxTokens, frequencyPenalty). See [Vercel AI SDK Settings](https://sdk.vercel.ai/docs/ai-sdk-core/settings).

For instance to specify the LLM model to use:
```js
import { openai } from '@ai-sdk/openai';
import { TextGenerator } from 'cascador-ai';

const generator = new TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Hello, world!',
});
```
For a list of supported models, see [Vercel AI SDK Providers](https://sdk.vercel.ai/providers/ai-sdk-providers).

## Calling Generators/Streamers in Templates

### Call with (config)
Update configuration for a single invocation:
```js
{% set greeting = myGenerator({ context: { userName: 'Bob' }, temperature: 0.9 }).text %}
```

### Call with (prompt, context)
Simplify a single call by providing a new prompt and optionally a context:
```js
{% set greeting = myGenerator('Hello, dear {{ userName }}', { userName: 'Carol' }).text %}

```

## Roadmap

- **Embeddings Example**
- **Image Generation**
  Integrate image generators (e.g., DALL-E) to produce images from prompts.
- **`onStepFinish` Callback**
  Provide hooks to capture intermediate steps or partial outputs.
- **Error Handling & Recovery**
  Implement robust retry mechanisms and upcoming Cascada try/except blocks for improved error handling.

Cascador-AI aims to simplify complex AI workflows by letting you declare them in flexible, automatically parallelized templates — so you can focus on what you want the LLM to do instead of how to orchestrate it.