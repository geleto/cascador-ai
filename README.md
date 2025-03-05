# Cascador-AI: Simplify Complex AI Workflows and Agents with Powerful Templates

## Effortless Orchestration, Built-In Concurrency

Imagine crafting sophisticated AI workflows—blending language models, API calls, and data transformations—without wrestling with intricate async code or concurrency headaches. *Cascador-AI* makes this a reality with an intuitive, template-driven approach. Built on the [Vercel AI SDK](https://sdk.vercel.ai/) and the [Cascada Template Engine](https://github.com/geleto/cascada) (a fork of [Nunjucks](https://mozilla.github.io/nunjucks/)), it lets you define complex sequences in a simple syntax while automatically optimizing for parallel execution.

Whether you’re generating stories, analyzing data, or integrating external services, *Cascador-AI* streamlines development with a synchronous feel and asynchronous power. It’s TypeScript-friendly, supports all major LLM providers, and scales effortlessly from quick prototypes to robust applications.

**Note:** *Cascador-AI* is under active development and not yet production-ready, pending the [Cascada Template Engine](https://github.com/geleto/cascada?tab=readme-ov-file#development-status-and-roadmap) reaching maturity.

# Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Understanding the Cascador-AI API](#understanding-the-cascador-ai-api)
- [Configuration Management](#configuration-management)
- [Renderer Types](#renderer-types)
- [Callable Render Objects](#callable-render-objects)
- [Template Properties](#template-properties)
- [Vercel AI Properties](#vercel-ai-properties)
- [Using Renderers in Templates](#using-renderers-in-templates)
- [Type Checking](#type-checking)
- [Embedding Integration](#embedding-integration)
- [Roadmap](#roadmap)

## Why Cascador-AI?

- **Intuitive Orchestration**: Create complex AI workflows with easy-to-understand template syntax
- **Parallel by Default**: Independent operations run concurrently—no extra effort required
- **Powerful Template Language**: Leverage variables, loops, conditionals, and more via [Cascada](https://github.com/geleto/cascada)
- **Flexible Context**: Seamlessly access asynchronous data and functionality in your templates using the context object - from static values and dynamic functions to external APIs, database queries, and custom service integrations
- **LLM Provider Flexibility**: Works with any major provider through the Vercel AI SDK
- **Type-Safe**: Catch errors early with robust TypeScript support

Built on the powerful combination of [Vercel AI SDK](https://sdk.vercel.ai/) and the [Cascada Template Engine](https://github.com/geleto/cascada), Cascador-AI delivers a developer experience that feels synchronous while providing the performance benefits of asynchronous execution.

## Installation

```bash
npm install cascador-ai
```
Ensure you have Node.js installed and, if you plan to use specific LLM providers, their respective SDKs (e.g., `@ai-sdk/openai` for OpenAI). Check the [Vercel AI SDK documentation](https://sdk.vercel.ai/) for provider-specific setup details

## Quick Start

This example walks you through generating a story from a synopsis, critiquing it, and translating it—all orchestrated with a single template. Independent tasks (critique and translation) run in parallel automatically, waiting only for the story to finish.

Here’s how it works:

```js
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';
import fs from 'fs/promises';

// Base shared configuration
const baseConfig = create.Config({
	temperature: 0.7,
});

// Story generator using Claude 3
const storylineGen = create.TextGenerator({
	model: anthropic('claude-3-5-sonnet-20240620'),
	prompt: 'Expand the following synopsis into a short story: {{ synopsis }}'
}, baseConfig);

// Critique generator using GPT-4
const critiqueGen = create.TextGenerator({
	model: openai('gpt-4o'),
	prompt: 'Provide a critical analysis of the following story: {{ story }}'
}, baseConfig);

// Translation using GPT-4
const translateGen = create.TextGenerator({
	model: openai('gpt-4o'),
	prompt: 'Translate the following text to {{ language }}: {{ text }}'
}, baseConfig);

// Main template renderer for orchestrating the whole process
const mainGenerator = create.TemplateRenderer({
	filters: {
		translate: async (text: string, lang: string) => (await translateGen({ text, language: lang })).text
	},
	context: {
		language: 'Spanish',
		readFile: async (filePath: string) => await fs.readFile(filePath, 'utf-8'),
		storylineGen,
		critiqueGen,
		language: 'Spanish',
	},
	prompt: `
    {% set synopsis = readFile('./src/synopsis.txt') %}
    {% set storyContent = (storylineGen({ synopsis: synopsis })).text %}
	Story: {{ storyContent }}
    {% set critiqueContent = (critiqueGen({ story: storyContent })).text %}
    Critique : {{ critiqueContent }}
	Story in {{language}}: {{ storyContent | translate(language) }}`
});

(async () => console.log(await mainGenerator()))();
```

This snippet:

1. Sets up a reusable base configuration.
2. Loads a synopsis from a file.
3. Expands it into a story using Claude 3.
4. Generates a critique with GPT-4.
5. Translates the story into Spanish—concurrently with the critique.

The result? A seamless workflow with minimal code, showcasing Cascador-AI’s power to orchestrate tasks effortlessly.

# Understanding the Cascador-AI API

## Renderers: The Heart of Cascador-AI

At the core of *Cascador-AI* are **renderers**—versatile objects that transform inputs into outputs, whether that’s rendering templates, generating text with LLMs, or streaming structured data. Think of them as the building blocks for your workflows, designed to be both powerful and easy to use. Every renderer shares a few key traits:

- **Created with Factories**: Use the `create` namespace to spin up renderers with custom configurations, optionally inheriting from a parent (like a `Config` object or another renderer):
  ```typescript
  import { create } from 'cascador-ai';
  import { openai } from '@ai-sdk/openai';

  // Standalone renderer
  const simpleRenderer = create.TextGenerator({
    model: openai('gpt-4o'),
    prompt: 'Hello {{ name }}'
  });

  // Inheriting from a base config
  const baseConfig = create.Config({
    model: openai('gpt-4o'),
    temperature: 0.7
  });
  const inheritingRenderer = create.TextGenerator({
    prompt: 'Greet {{ name }}'
  }, baseConfig);
  ```

- **Template Properties**: Every renderer supports template processing through several key properties:
  - `promptType` - Controls the template processing mode
  - `context` - Provides data and methods for templates
  - `filters` - Adds transformation functions
  - `loader` - Enables external template loading

  [See Template Properties](#template-properties)

- **Callable Interface**: Invoke renderers in two ways: with their built-in setup or with one-off prompts and contexts. Precompiled prompts (set during creation) run faster, while on-the-fly prompts offer flexibility:
  ```typescript
  // Using configured prompt and context
  const result = await renderer();

  // With a one-off prompt and context
  const result = await renderer('Hello {{ name }}', { name: 'World' });
  ```
  One-off prompts specified in a call argument are compiled each time they're used, while prompts defined during renderer creation are precompiled for better performance. [See Callable Objects](#callable-objects)

- **Nested in Templates**: Drop renderers into your `context` to use them within templates, chaining tasks effortlessly:
  ```typescript
  const mainRenderer = create.TemplateRenderer({
    context: {
      translateRenderer,
      summarizeRenderer
    },
    prompt: '{{ (translateRenderer({ text })).text }}'
  }, baseConfig);
  ```
  [Check out Using Renderers in Templates](#using-renderers-in-templates) for examples.

Renderers tie together *Cascador-AI*’s simplicity and concurrency magic, letting you orchestrate complex workflows with minimal fuss. Whether you’re generating text, streaming data, or rendering pure templates, they’ve got you covered.

## Configuration Management

Cascador-AI allows you to define shared configuration through `Config` objects that can be inherited by other renderers:

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

// Create a base configuration
const baseConfig = create.Config({
  model: openai('gpt-4o'),
  temperature: 0.7,
  context: {
    language: 'en'
  }
});

// Create a renderer that inherits from base config
const renderer = create.TextGenerator({
  prompt: 'Translate to {{ language }}: {{ text }}'
}, baseConfig);

// The renderer inherits model, temperature, and context from baseConfig
```

## The Cascador Renderers

### Your Toolkit for Every Task

*Cascador-AI* offers a suite of renderers, each tailored to a specific job—whether it’s rendering templates, generating text, or streaming data. Built on the Vercel AI SDK, they share a common foundation but shine in their own ways. Here’s the lineup:

### TemplateRenderer
**What it does**: Pure template processing, no LLMs involved. Perfect for stitching together dynamic content from data or async sources.

```typescript
import { create } from 'cascador-ai';

const baseConfig = create.Config({ /* shared settings */ });
const templatedRenderer = create.TemplateRenderer({
  prompt: 'Hi {{ name }}! Today is {{ currentDay }}.',
  context: {
    name: async () => (await sql.query('SELECT name FROM users LIMIT 1')).rows[0].name,
    currentDay: new Date().toLocaleDateString()
  }
}, baseConfig);

(async () => {
  const result = await templatedRenderer();
  console.log('Output:', result);
})();
```

**Use it for**: Dynamic reports, email templates, or any task needing flexible, non-LLM rendering.

### TextGenerator
**What it does**: Generates text via LLMs using Vercel’s `generateText`. Ideal for one-shot outputs like summaries or creative writing.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

const generator = create.TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Describe "{{ topic }}" in 3 sentences.',
  context: {
    topic: async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
      const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${today}`;
      return (await (await fetch(url)).json()).tfa.normalizedtitle;
    }
  }
}, baseConfig);

(async () => {
  const { text } = await generator();
  console.log('Description:', text);
})();
```

**Use it for**: Article generation, quick answers, or API-driven content. [See Vercel docs](<link-to-vercel-docs>) for return details.

### TextStreamer
**What it does**: Streams LLM text in real time with Vercel’s `streamText`. Great for live updates or chat-style interfaces.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

const streamer = create.TextStreamer({
  model: openai('gpt-4o'),
  prompt: 'Write a poem about the sea.'
}, baseConfig);

(async () => {
  const { textStream } = await streamer();
  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }
})();
```

**Use it for**: Progressive rendering, chatbots, or interactive UIs. [See Vercel docs](<link-to-vercel-docs>) for streaming specifics.

### ObjectGenerator
**What it does**: Produces structured data with Vercel’s `generateObject`, complete with schema validation. Think JSON outputs or classifications.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const profileGenerator = create.ObjectGenerator({
  model: openai('gpt-4o'),
  schema: z.object({
    name: z.string(),
    age: z.number(),
    hobbies: z.array(z.string())
  }),
  prompt: 'Generate a random person profile in JSON format.'
}, baseConfig);

(async () => {
  const { object: person } = await profileGenerator();
  console.log('Person:', person);
})();
```

You can specify how the data should be structured by setting `output` to:
- `object` (default) - Returns a single object matching the schema
- `array` - Returns an array of objects matching the schema
- `enum` - For classification tasks with a discrete set of possible values
- `no-schema` - No schema validation, returns raw JSON

**Use it for**: Data extraction, structured responses, or enum-based classification.

### ObjectStreamer
**What it does**: Streams structured data incrementally via Vercel’s `streamObject`. Perfect for real-time data feeds or partial updates.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const characterStreamer = create.ObjectStreamer({
  model: openai('gpt-4o'),
  schema: z.array(z.object({
    name: z.string(),
    description: z.string()
  })),
  output: 'array',
  prompt: 'Generate 3 character descriptions.'
}, baseConfig);

(async () => {
  const { elementStream } = await characterStreamer();
  for await (const character of elementStream) {
    console.log('Character:', character);
  }
})();
```

You can specify how the data should be structured by setting `output` to:
- `object` (default) - Streams partial updates to a single object
- `array` - Streams complete elements from an array
- `no-schema` - No schema validation, streams raw JSON

**Use it for**: Live dashboards, incremental JSON builds, or array streaming.

## Callable Render Objects

### Flexibility at Your Fingertips

Every renderer in *Cascador-AI* doubles as a callable object, giving you two ways to wield it: stick with its preconfigured setup or throw in a fresh prompt and context on the fly. Plus, renderers can serve as parent configurations for others, making them reusable building blocks. Whether you’re iterating fast or fine-tuning, this flexibility keeps your workflows smooth.

Here’s how you can call them:

1. **Using the Predefined Prompt**: Rely on the prompt and context set when the renderer is created - precompiled for speed:
   ```typescript
   import { create } from 'cascador-ai';

   const renderer = create.TextGenerator({
     prompt: 'Hello {{ name }}',
     context: { name: 'World' }
   }, baseConfig);

   (async () => {
     const result = await renderer();
     console.log(result.text); // "Hello World"
   })();
   ```

2. **With a One-Off Prompt**: Pass a new prompt and optional context directly, compiled fresh each time:
   ```typescript
   (async () => {
     const result = await renderer('Hi {{ user }}', { user: 'Alice' });
     console.log(result.text); // "Hi Alice"
   })();
   ```

Precompiled prompts (set at creation) are optimized for performance, while one-off prompts offer quick adaptability—perfect for testing or dynamic scenarios.

## Template Properties

Renderers in *Cascador-AI* aren’t just static tools—they’re template-powered engines. With a handful of properties, you can control how templates are processed, inject data, transform outputs, and even pull in external files. These apply to all renderers (unless you set `promptType: 'text'` to skip templating). Here’s what you can tweak:

### prompt
The heart of your renderer—it’s the template or text that gets processed. Set it in three spots:
- Base config: `create.Config({ prompt: 'Base {{ var }}' })`
- Renderer creation (recommended): `create.TextGenerator({ prompt: 'Main {{ var }}' })`
- Function call: `renderer('Dynamic {{ var }}', context)`

Prompts set at creation or in config are precompiled for speed; call-time prompts are compiled fresh each time. When paired with `messages`, the rendered prompt appends to the array (future feature).

### promptType
Controls how your prompt is handled:
- `'async-template'` (default) - Async processing with parallel promise resolution
- `'template'` - Standard synchronous Nunjucks templating
- `'template-name'` - Loads a named template synchronously (needs `loader`)
- `'async-template-name'` - Loads a named template asynchronously (needs `loader`)
- `'text'` - Skips templating, treats the prompt as plain text

### context
Provides data and methods that can be accessed within templates. Both the data and method returns can be asynchronous (promises are automatically handled), keeping your templates clean and powerful. Here’s what you can add to the `context` object:
- **Static Values**: Simple strings, numbers, or objects (e.g., `'London'`, `42`, `{ key: 'value' }`).
- **Synchronous Functions**: Basic logic or transformations (e.g., `(x) => x.toUpperCase()`).
- **Asynchronous Functions**: API calls, database queries, or file reads (e.g., `async () => await fetch(...)`).
- **Other Renderers**: Nest renderers for chained operations (e.g., a `TextGenerator` to translate text).
- **Custom Integrations**: Anything callable—think service clients or utility libraries.

Example:
```typescript
const renderer = create.TextGenerator({
  prompt: 'Weather in {{ city }}: {{ getWeather(city) }} - {{ (translator({ text: 'Updated' })).text }}',
  context: {
    city: 'London', // Static value
    getWeather: async (city) => (await fetch(`https://api.weather.com/${city}`)).json(), // Async function
    currentTime: new Date().toISOString(), // Static via function
    translator: create.TextGenerator({ // Nested renderer
      model: openai('gpt-4o'),
      prompt: 'Translate to Spanish: {{ text }}'
    }, baseConfig)
  }
}, baseConfig);
```

### filters
Transform data on the fly with custom functions, sync or async, using the `|` operator:
```typescript
import { create } from 'cascador-ai';
import translate from 'translate';

const renderer = create.TemplateRenderer({
  filters: {
    translate: async (text, lang) => await translate(text, lang)
  },
  prompt: `
    Original: {{ text }}
    Spanish: {{ text | translate('es') }}
  `
}, baseConfig);

(async () => {
  console.log(await renderer({ text: 'Hello world' }));
})();
```

### loader
Pull templates from files using a Nunjucks-compatible loader:
```typescript
import { create, FileSystemLoader } from 'cascador-ai';

const fileLoader = new FileSystemLoader('./templates');
const renderer = create.TemplateRenderer({
  loader: fileLoader,
  prompt: `
    {% include 'header.njk' %}
    {% include 'content.njk' %}
  `
}, baseConfig);
```
For named templates, use `promptType: 'template-name'` and set `prompt` to the filename (e.g., `'main.njk'`).

### options
Fine-tune the Nunjucks engine with extras like `autoescape` or `trimBlocks`:
```typescript
const renderer = create.TemplateRenderer({
  options: {
    autoescape: false,
    trimBlocks: true
  },
  prompt: '...'
}, baseConfig);
```
See [Nunjucks docs](https://mozilla.github.io/nunjucks/api.html#configure) for more.

### Property Inheritance Explained
Properties in *Cascador-AI* flow through a chain of configurations—starting from any `Config` object (or multiple), passing through parent renderers, and ending at the renderer you’re crafting. Each level can tweak or extend what came before, but the rules differ: scalar properties like `prompt` or `promptType` get overridden entirely, while objects like `context`, `filters`, and `loader` merge their contents, preserving and combining values.

Here’s how it plays out:

```typescript
const rootConfig = create.Config({
  prompt: 'Root {{ var }}',
  context: { var: 'root', theme: 'dark' },
  filters: { uppercase: (s) => s.toUpperCase() }
});

const midConfig = create.Config({
  prompt: 'Mid {{ var }}',
  context: { var: 'mid' }, // Merges with root’s context
  filters: { lowercase: (s) => s.toLowerCase() } // Adds to filters
}, rootConfig);

const parentRenderer = create.TextGenerator({
  prompt: 'Parent {{ var }}',
  context: { user: 'guest' } // Merges again
}, midConfig);

const childRenderer = create.TextGenerator({
  prompt: 'Child {{ var }} {{ user }}' // Overrides all prior prompts
}, parentRenderer);

(async () => {
  console.log(await childRenderer()); // "Child guest"—prompt from child, context merged
  // context: { var: 'mid', theme: 'dark', user: 'guest' }
  // filters: { uppercase, lowercase }
})();
```

## Vercel AI Properties

*Cascador-AI* renderers inherit a robust set of properties from the [Vercel AI SDK](https://sdk.vercel.ai/), enabling fine-tuned control over language model behavior. These properties are available across all renderer types and can be set in a base `Config` object, during renderer creation, or, where applicable, overridden in runtime calls. Below are the key properties, with examples provided for the less intuitive ones (`model`, `messages`, `stop`, `tools`).

### model
**Purpose**: Specifies the language model to use for generation.
**Type**: Provider-specific model object (required).
**Details**: Must be supplied via a provider helper (e.g., `openai()`, `anthropic()`). Mandatory in renderer or `Config`.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { create } from 'cascador-ai';

const baseConfig = create.Config({ temperature: 0.7 });
const openaiRenderer = create.TextGenerator({
  model: openai('gpt-4o'), // OpenAI's GPT-4o
  prompt: 'Summarize {{ text }}'
}, baseConfig);

const anthropicRenderer = create.TextGenerator({
  model: anthropic('claude-3-5-sonnet-20240620'), // Claude 3.5 Sonnet
  prompt: 'Analyze {{ data }}'
}, baseConfig);
```

### temperature
**Purpose**: Adjusts the randomness of the model's output.
**Type**: `number` (0 to 1, default: 0.7).
**Details**: Lower values for predictable responses; higher for creativity.

### maxTokens
**Purpose**: Limits the number of tokens generated.
**Type**: `number` (optional).
**Details**: Caps response length to manage size and cost.

### messages
**Purpose**: Defines a chat-style conversation history.
**Type**: Array of `{ role: 'system' | 'user' | 'assistant', content: string }` (optional).
**Details**: For multi-turn interactions; `prompt` appends as a user message (future behavior may evolve).
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';

const renderer = create.TextGenerator({
  model: openai('gpt-4o'),
  messages: [
    { role: 'system', content: 'You are a pirate captain.' },
    { role: 'user', content: 'What’s your ship called?' },
    { role: 'assistant', content: 'The Black Kraken, matey!' }
  ],
  prompt: 'Tell me about your latest adventure.'
}, baseConfig);

(async () => {
  const { text } = await renderer();
  console.log(text); // Continues pirate-themed chat
})();
```

### topP
**Purpose**: Controls diversity via nucleus sampling.
**Type**: `number` (0 to 1, default: 1).
**Details**: Limits tokens to the top probability mass; an alternative to `temperature` for finer diversity control.

### presencePenalty
**Purpose**: Discourages repetition of tokens already in the output.
**Type**: `number` (-2.0 to 2.0, default: 0).
**Details**: Positive values reduce reuse; negative encourage it.

### frequencyPenalty
**Purpose**: Reduces repetition based on token frequency.
**Type**: `number` (-2.0 to 2.0, default: 0).
**Details**: Higher values penalize frequent tokens; negative promote them.

### stop
**Purpose**: Halts generation at specified sequences.
**Type**: `string[]` (optional).
**Details**: Stops before generating the sequence; useful for structured outputs.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';

const renderer = create.TextGenerator({
  model: openai('gpt-4o'),
  stop: ['###', '\n\n'], // Stops at triple hash or double newline
  prompt: 'List 3 facts about space:\n1.'
}, baseConfig);

(async () => {
  const { text } = await renderer();
  console.log(text); // Stops early if "###" or "\n\n" appears
})();
```

### tools
**Purpose**: Enables the model to call external functions.
**Type**: Object mapping tool names to `{ description: string, parameters: z.ZodSchema, execute?: (args: any) => Promise<any> }` (optional).
**Details**: Supported by `TextGenerator` and `TextStreamer`; paired with `maxSteps`.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';
import { z } from 'zod';

const renderer = create.TextGenerator({
  model: openai('gpt-4o'),
  tools: {
    fetchStockPrice: {
      description: 'Get the current stock price',
      parameters: z.object({ ticker: z.string() }),
      execute: async ({ ticker }) => ({ price: 150.25, currency: 'USD' }) // Mock API
    }
  },
  prompt: 'What’s the stock price for {{ company }}?',
  context: { company: 'AAPL' }
}, baseConfig);

(async () => {
  const { text, toolCalls } = await renderer();
  console.log(text); // Incorporates tool result
})();
```

### maxSteps
**Purpose**: Limits the number of tool-calling steps.
**Type**: `number` (default: 1, optional).
**Details**: Works with `tools` in `TextGenerator` and `TextStreamer`.

## Using Renderers in Templates

Renderers in *Cascador-AI* can be embedded within templates by adding them to the `context` object, enabling seamless task chaining and orchestration. This approach leverages the template engine’s power to coordinate multiple renderers, execute them when their inputs are ready, and process their outputs dynamically.

### How It Works
- **Setup**: Include renderers (e.g., `TextGenerator`, `ObjectStreamer`) in the `context` of a parent renderer, typically a `TemplateRenderer`.
- **Execution**: Renderers run automatically once their dependencies resolve, with independent tasks executing in parallel by default.
- **Output Access**: Results expose Vercel AI SDK properties like `.text`, `.textStream`, or `.object`, depending on the renderer type.
- **Flexibility**: Any renderer type can be nested, from simple text generators to complex streamers.

### Example
Here’s an example that generates a character profile, uses it to create a story, and streams a live critique—all within one template:

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { create } from 'cascador-ai';
import { z } from 'zod';

const baseConfig = create.Config({ temperature: 0.7 });

// Character profile generator (ObjectGenerator)
const characterGenerator = create.ObjectGenerator({
  model: openai('gpt-4o'),
  schema: z.object({
    name: z.string(),
    role: z.string()
  }),
  prompt: 'Generate a character for a story about {{ topic }}'
}, baseConfig);

// Story generator (TextGenerator)
const storyRenderer = create.TextGenerator({
  model: anthropic('claude-3-5-sonnet-20240620'),
  prompt: 'Write a short story about {{ character.name }}, a {{ character.role }}, in {{ topic }}'
}, baseConfig);

// Live critique streamer (TextStreamer)
const critiqueStreamer = create.TextStreamer({
  model: openai('gpt-4o'),
  prompt: 'Provide a live critique of this story: {{ story }}'
}, baseConfig);

// Orchestrating renderer
const mainRenderer = create.TemplateRenderer({
  context: {
    characterGenerator,
    storyRenderer,
    critiqueStreamer,
    topic: 'a lost astronaut'
  },
  prompt: `
    {% set character = (characterGenerator({ topic })).object %}
    Character: {{ character | json }}
    {% set storyContent = (storyRenderer({ character })).text %}
    Story: {{ storyContent }}
    Live Critique: {% set stream = (critiqueStreamer({ story: storyContent })).textStream %}
      {% for chunk in stream %}{{ chunk }}{% endfor %}
  `
}, baseConfig);

(async () => {
  const result = await mainRenderer();
  console.log(result); // Outputs character JSON, story, and streamed critique
})();
```

### Key Points
- **Parallel Execution**: The critique stream runs after the story, which depends on the character, optimizing the dependency chain.
- **Result Handling**: Access `.object` for structured data, `.text` for stories, and `.textStream` for live critiques.
- **Dynamic Inputs**: Pass outputs (e.g., `character`) to subsequent renderers for cohesive workflows.
- **Versatility**: Combine different renderer types—like `ObjectGenerator`, `TextGenerator`, and `TextStreamer`—to handle varied tasks in one workflow.


### Choosing Between **Context Methods/Filters**, **Renderers**, and **Tools** in *Cascador-AI*

In *Cascador-AI*, we’re dealing with three distinct mechanisms - **context methods/filters**, **renderers**, and **tools** - each with unique strengths. **Context methods/filters** excel at fast, precise data handling and transformations through JS/TS functions and filters, though they lack orchestration. **Renderers** orchestrate workflows with templating or LLM generation, offering modularity but not the LLM’s dynamic reasoning. **Tools** empower the LLM to adaptively fetch and chain data, at the cost of higher expense and serial execution.

#### Context Methods/Filters:
These are JS/TS functions and template filters in a renderer’s `context`, ideal for raw data tasks and transformations.

**Use When:**
- **Fetching specific data**: Call APIs, services, request data or files (e.g., `getFile('README.md')`).
- **Running parallel tasks**: Fetch multiple data points concurrently (e.g., stock prices and weather).
- **Knowing which data is needed**: Pre-fetch predictable data (e.g., stock prices for finance queries).
- **Custom logic**: Compute values with JS/TS (e.g., `calculateDiscount(price, rate)`).
- **Data transformation with filters**: Reshape data in templates (e.g., `{{ data | json | pluck('key') }}`).
- *Why?* Fast, cheap, no LLM overhead; runs in parallel.

#### Renderers:
Renderers, like `TextGenerator` or `TemplateRenderer` (for non-LLM tasks), are modular blocks that orchestrate workflows with templating or LLM generation.

**Use When:**
- **Transforming context data to prompt/text**: Convert raw context into structured text (e.g., `{% set prompt = 'Analyze ' + data.topic %}{{ (analyzerRenderer({ prompt })).text }}`).
- **Breaking down prompts in separate renderers**: Divide complex prompts across renderers for modularity and parallelism (e.g., `{{ (titleRenderer()).text }}` and `{{ (bodyRenderer()).text }}` run concurrently).
- **Orchestrating workflows**: Chain steps (e.g., `{% set story = (storyRenderer()).text %}`).
- **Reusing components**: Share renderers across templates (e.g., `translateGen`).
- **Logic driving renderer use**:
  - *Conditional renderer calls*: Pick renderers based on logic (e.g., `{% if detailLevel == 'brief' %}{{ (summaryRenderer()).text }}{% else %}{{ (detailedRenderer()).text }}{% endif %}`).
  - *Dynamic context*: Guide renderer logic with context properties (e.g., `{{ (storyRenderer({ detailLevel: 'brief' })).text }}` adjusts output brevity).
  - *Loops*: Process separate documents with `{% for %}` (e.g., summarize search result docs).
  - *Why?* Structured, efficient, versatile; avoids LLM for logic.

#### Tools:
Tools extend the LLM with dynamic, callable functions, integrating data through its reasoning.
**Use When:**
- **LLM decides the workflow**: Pick tools based on context (e.g., fetch weather if asked).
- **Chaining data in one pass**: LLM fetches data, decides next steps, and fetches more in a single response (e.g., “It’s 20°C—perfect! Hyde Park is nearby.” fetches temp, assesses it, then finds a park).
- *Why?* Adaptive, cohesive responses; no extra prompts.

#### Key Takeaways
- **Methods/filters for raw efficiency**: Fast, specific tasks with JS/TS or filters; cost-effective and parallel.
- **Renderers for orchestration**: Structured workflows with templating or LLM power; reusable and logic-driven.
- **Tools for LLM dynamism**: Adaptive, single-pass data chaining; may increase latency and cost.

## Embedding Integration

While *Cascador-AI* doesn’t offer built-in embedding-specific features, it seamlessly integrates vector embeddings from the Vercel AI SDK. By adding embedding functions to the `context` object, you can use them directly in templates for tasks like semantic search, similarity comparisons, or retrieval-augmented generation (RAG).

### Example
Here’s how to find the most similar document to a user query using embeddings and cosine similarity:

```typescript
import { openai } from '@ai-sdk/openai';
import { embed, cosineSimilarity } from 'ai';
import { create } from 'cascador-ai';
import fs from 'fs/promises';

const documentFinder = create.TemplateRenderer({
  context: {
    userQuery: 'machine learning applications',
    readFile: async (filePath) => await fs.readFile(filePath, 'utf-8'),
    embedText: async (text) => (await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: text
    })).embedding,
    compareSimilarity: cosineSimilarity
  },
  prompt: `
    {% set queryEmbedding = embedText(userQuery) %}
    {% set docs = [] %}
    {% for i in range(1, 11) %}
      {% set docText = readFile('docs/document' + i + '.txt') %}
      {% set docEmbedding = embedText(docText) %}
      {{- docs.push({
        filename: 'document' + i + '.txt',
        similarity: compareSimilarity(queryEmbedding, docEmbedding)
      }) | reject() }}
    {% endfor %}
    Most similar document to "{{ userQuery }}":
    {{ (docs | sort(true, false, 'similarity') | first).filename }}
  `
}, baseConfig);

(async () => {
  const result = await documentFinder();
  console.log(result); // Outputs the filename of the most similar document
})();
```

## RAG Integration

*Cascador-AI*’s template-driven approach simplifies retrieval-augmented generation (RAG) workflows by integrating external libraries like LlamaIndex. Templates coordinate vector search and LLM generation effortlessly, leveraging automatic concurrency for efficiency.

### Example
**Summary**: This example loads 10 documents, builds a vector index with LlamaIndex (which chunks them into snippets), and uses a template to retrieve the most relevant snippets about machine learning for cancer detection, then summarizes them.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { Document, VectorStoreIndex, OpenAIEmbedding } from 'llamaindex';
import fs from 'fs/promises';

const docs = await Promise.all(
  [...Array(10)].map(async (_, i) =>
    new Document({ text: await fs.readFile(`document${i + 1}.txt`), id_: `doc${i + 1}` })
  ));
const vectorIndex = await VectorStoreIndex.fromDocuments(docs, {
  embedModel: new OpenAIEmbedding({ model: 'text-embedding-3-small' })
});

// Answer generator
const answerGenerator = create.TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Summarize the latest advancements in machine learning for cancer detection based on: {{ context }}'
});

// RAG orchestrator
const ragGenerator = create.TemplateRenderer({
  context: {
    query: 'What are the latest advancements in machine learning for cancer detection?',
    searchIndex: async (queryText) => {
      const queryEngine = vectorIndex.asQueryEngine();
      const response = await queryEngine.query(queryText);
      return response.sourceNodes.map(n => n.text).join('\n');
    },
    answerGenerator
  },
  prompt: `
    Query: {{ query }}
    Answer: {{ (answerGenerator({ context: searchIndex(query) })).text }}
  `
});

(async () => {
  const result = await ragGenerator();
  console.log(result); // Outputs query and summarized answer
})();
```

### Vercel AI Embedding Adapter
To use Vercel AI SDK embeddings instead of LlamaIndex’s embeddings with LlamaIndex, create an adapter:

```typescript
import { BaseEmbedding } from 'llamaindex';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

class VercelEmbeddingAdapter extends BaseEmbedding {
  constructor(private vercelModel = openai.embedding('text-embedding-3-small')) {
    super();
  }

  async getTextEmbedding(text: string): Promise<number[]> {
    const { embedding } = await embed({ model: this.vercelModel, value: text });
    return embedding;
  }

  async getQueryEmbedding(text: string): Promise<number[]> {
    return this.getTextEmbedding(text);
  }
}

// Usage:
const vectorIndex = await VectorStoreIndex.fromDocuments(docs, {
  embedModel: new VercelEmbeddingAdapter()
});
```

## Type Checking

*Cascador-AI*’s TypeScript integration enforces strict configuration rules to catch errors at compile time, preventing runtime issues. Below are examples of common type violations and the required properties they enforce.

### Examples
```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

// Error: Cannot mix text and template properties
const invalidRenderer = create.TextGenerator({
  promptType: 'text',
  filters: {}, // Type error: 'text' mode disallows template properties
});

// Error: Missing required model
const noModelRenderer = create.TextGenerator({
  prompt: 'Hello'
}); // Type error: 'model' must be provided

// Error: Missing loader for named template
const namedTemplate = create.TextGenerator({
  promptType: 'template-name',
  prompt: 'my-template'
}); // Type error: 'loader' required for 'template-name'

// Error: Missing prompt at runtime
const noPromptRenderer = create.TextGenerator({
  model: openai('gpt-4o')
});
await noPromptRenderer(); // Type error: 'prompt' required in config, creation, or call
```

### Enforced Rules
- **Model**: Must be set in renderer creation or a parent `Config`.
- **Loader**: Required for `promptType: 'template-name'` or `'async-template-name'`.
- **Prompt**: Must be provided in creation, a `Config`, or the runtime call.
- **Template Properties**: `filters`, `loader`, and `options` are disallowed when `promptType: 'text'`.

This type safety ensures robust, predictable workflows with early error detection.

## Roadmap

*Cascador-AI* is evolving to enhance its capabilities and robustness. Here are the key features planned for future releases:

- **Image Generation**: Add support for generating images from prompts using models like DALL-E.
- **Step Callback**: Introduce an `onStepFinish` hook to capture intermediate results or partial outputs.
- **Versioned Templates**: Enable loading versioned prompts with a loader that wraps unversioned loaders for better template management.
- **Error Resilience**: Implement retry logic and Cascada’s upcoming try/except blocks for improved error handling.
- **Snapshot Support**: Request the template engine to return a snapshot of the currently rendered data, due to the non-sequential nature of the rendering where regular streaming is not practical.