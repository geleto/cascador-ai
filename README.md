# Cascador-AI: Efficient AI Orchestration Made Intuitive

## What is Cascador-AI?

Building sophisticated AI systems - from multi-step agents and RAG pipelines to complex tool-use chains - requires orchestrating numerous asynchronous tasks. **Cascador-AI is an AI orchestration library that makes this radically simpler and more intuitive.** Built on the [Vercel AI SDK Core](https://sdk.vercel.ai/docs/ai-sdk-core) and the powerful [Cascada Template and Scripting Engine](https://github.com/geleto/cascada), it allows you to define these workflows with clean, declarative, synchronous-style code and templates. The engine automatically parallelizes asynchronous operations, giving you the performance of concurrent execution without the complexity of managing it.

### 🔀 A Code-First Philosophy: Write Logic, Not Graphs

Cascador-AI is built for developers who prefer expressing complex logic as **code, not as a graph of boilerplate nodes**. Instead of forcing you to learn a rigid, declarative API to define nodes and edges, it lets you write your workflows using familiar patterns like variables, functions, loops, and conditionals. You write the logic; the engine handles the complex orchestration and parallel execution for you.

### ⚡ Parallel by Default, Data-Flow guided execution

The core of Cascador-AI is a **data-flow execution model**. Instead of running line-by-line, operations run as soon as their data dependencies are met. This means independent LLM calls or API requests in your script automatically run in parallel without any extra effort. For stateful operations where order is critical (e.g., database writes), you can easily enforce a strict sequential execution, giving you the best of both worlds. This powerful combination means that instead of wrestling with computation graphs, message queues, or async boilerplate, you just write the logic - the engine handles the rest.

### 💡 Logic vs. Capabilities: A Clear Separation of Concerns

The library encourages a powerful separation between the *what* (the orchestration plan) and the *how* (the underlying tools and functions):

*   **The Logic (The "What"):** This is the high-level plan defined in a `ScriptRunner` or `TemplateRenderer`. It's a readable, self-contained script that orchestrates the workflow, defining the steps and data flow.
    *   *Examples:* A script that first generates a draft, then sends it for critique, and finally revises it based on feedback; a template that fetches user data and product recommendations in parallel to render a personalized welcome email.

*   **The Capabilities (The "How"):** These are the concrete tools and data sources your logic uses to get the job done. You provide them in the `context` object, making them available to your scripts and templates. The engine automatically handles resolving promises, allowing you to focus on your workflow logic without async boilerplate.
    *   *Examples:* Seamlessly access asynchronous data and functionality—from static values (`{ qualityThreshold: 8 }`) and dynamic JavaScript functions (`(name) => name.toUpperCase()`) to external API calls (`fetchWeatherAPI`), database queries (`db.getUser`), custom service integrations, and even other `Cascador-AI` renderers.

### 🧩 Composable & Reusable Components

Cascador-AI treats every piece of your AI workflow—from a simple text generator to a complex multi-step agent—as a modular, reusable component. Because you define logic as code, you can encapsulate functionality into distinct `TextGenerator`, `ObjectGenerator`, or `ScriptRunner` instances.

These components are not just static definitions; they are callable functions that can be passed around, nested, and composed. You can call one component from within another's script or template by simply adding it to the `context`. This allows you to build sophisticated systems from smaller, testable, and self-contained parts, promoting clean architecture and avoiding monolithic, hard-to-maintain agent definitions. For even more powerful composition, Cascada templates and scripts can also `include` files, `import` macros, and `extend` parent templates and scripts.

### 🛠️ Full-Spectrum AI Functionality

Cascador-AI combines its unique orchestration capabilities with the robust features of the [Vercel AI SDK Core](https://sdk.vercel.ai/docs/ai-sdk-core) to provide a complete toolkit for modern AI development.

#### Powered by Cascada
*   **Declarative Agent Orchestration:** Define sophisticated, multi-step agent logic using clean, readable scripts. The engine automatically parallelizes independent operations, data-flows and piepeline steps while transparently managing data dependencies, letting you focus on the "what" instead of the "how."
*   **Dynamic Prompt Engineering:** Craft powerful, adaptive prompts by composing templates, embedding the results from other LLM calls, and injecting data from asynchronous sources like APIs or databases, all within a single, coherent workflow.
*   **Seamless Custom Integrations:** Easily plug any custom service, utility, or external API into your workflows. By adding them to the `context` object, they become available as simple function calls within your scripts and templates.

#### Powered by the Vercel AI SDK Core
*   **LLM Provider Flexibility:** Works with any major provider supported by the Vercel AI SDK Core, including OpenAI, Anthropic, Google, Cohere, and more. Swap models and providers with a single line of code.
*   **Structured Data Generation:** Generate strongly-typed, validated JSON objects and arrays using Zod schemas, ensuring reliable and predictable outputs from your LLMs.
*   **Model-Driven Tool Use:** Expose your own functions—like API calls or database queries—as tools that an LLM can decide to call based on its own reasoning to fulfill a user's request.
*   **Text Generation & Streaming:** Leverage powerful LLMs for both one-shot text generation and real-time streaming to create dynamic, interactive user experiences.

**⚠️ Welcome to the Cutting Edge! ⚠️**
Cascador-AI is a new project and is evolving quickly! This is exciting, but it also means things are in flux. You might run into bugs, and the documentation might not always align perfectly with the released code. It could be behind or have gaps. I am working hard to improve everything and welcome your contributions and feedback.

# Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Understanding the Cascador-AI API](#understanding-the-cascador-ai-api)
- [Configuration Management](#configuration-management)
- [The Cascador Renderers](#the-cascador-renderers)
- [Callable Render Objects](#callable-render-objects)
- [Template Properties](#template-properties)
- [Vercel AI Properties](#vercel-ai-properties)
- [Using Renderers in Templates and Scripts](#using-renderers-in-templates-and-scripts)
- [Choosing Your Orchestration Strategy: Scripts, Templates, Context Methods, and Tools](#choosing-your-orchestration-strategy-scripts-templates-context-methods-and-tools)
- [Embedding Integration](#embedding-integration)
- [RAG Integration](#rag-integration)
- [Type Checking](#type-checking)
- [Roadmap](#roadmap)


## Installation

Install the Vercel AI SDK
```bash
npm install ai
```

Install Cascador-ai
```bash
npm install cascador-ai
```

Install the specific LLM providers that you plan to use:
```bash
npm install @ai-sdk/openai
```
Check the [Vercel AI SDK Core documentation](https://sdk.vercel.ai/docs/ai-sdk-core) for provider-specific setup details

## Quick Start

This example demonstrates the core power of Cascador-AI by building a **self-improving content agent**. This agent orchestrates a multi-step workflow: it writes a draft, critiques its own work, and then iteratively revises the content until it meets a quality standard.

Here’s how it works:

```javascript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { create } from 'cascador-ai';
import { z } from 'zod';

// Define a reusable base configuration
const baseConfig = create.Config({ model: openai('gpt-4o'), temperature: 0.7, maxRetries: 3 });

// A renderer to write drafts (inherits from baseConfig)
const draftGenerator = create.TextGenerator({
	prompt: 'Write a short, engaging blog post about {{ topic }}.',
}, baseConfig);

// A renderer to critique drafts using a structured schema.
const critiqueGenerator = create.ObjectGenerator({
	schema: z.object({
		score: z.number().describe('Quality score from 1-10.'),
		suggestions: z.array(z.string()).describe('Actionable suggestions for improvement.'),
	}),
	prompt: 'Critique this blog post: {{ draft }}',
}, baseConfig);

// A renderer to rewrite a draft based on feedback
const revisionGenerator = create.TextGenerator({
	model: anthropic('claude-3-7-sonnet-latest'), //override the base model to use Claude Sonnet
	prompt: 'Rewrite the following post based on these suggestions:\n\nPOST:\n{{ draft }}\n\nSUGGESTIONS:\n- {{ suggestions | join("\n- ") }}',
}, baseConfig);

// Define the orchestration script for the agent
const contentAgent = create.ScriptRunner({
	context: {
		draftGenerator, critiqueGenerator, revisionGenerator,
		topic: "the future of AI-powered development",
		qualityThreshold: 8, maxRevisions: 3, minRevisions: 1
	},
	script: `:data
      var revisionCount = 0
      var currentDraft = draftGenerator({ topic: topic }).text
      var critique = critiqueGenerator({ draft: currentDraft }).object

      // Iteratively revise until the quality threshold or maxRevisions is met
      while (critique.score < qualityThreshold or revisionCount < minRevisions) and revisionCount < maxRevisions
        revisionCount = revisionCount + 1
        currentDraft = revisionGenerator({ draft: currentDraft, suggestions: critique.suggestions }).text
        critique = critiqueGenerator({ draft: currentDraft }).object
      endwhile

      @data = { finalDraft: currentDraft, finalScore: critique.score, revisionCount: revisionCount }`,
});

// Run the agent
(async () => {
	const result = await contentAgent();
	console.log(JSON.stringify(result, null, 2));
})().catch(console.error);
```

# Understanding the Cascador-AI API

## Renderers: The Heart of Cascador-AI

At the core of *Cascador-AI* are **renderers**—versatile objects that transform inputs into outputs. They are the building blocks for your workflows, designed to be both powerful and easy to compose. Every renderer, from a data-processing `criptRunner` to an LLM-powered `TextGenerator`, is created using the `create` factory and can be called like a function.

All renderers that generate output from a language model (e.g., `TextGenerator`, `ObjectGenerator`) accept a `prompt` that is processed by the Cascada templating engine. This allows you to dynamically construct prompts using data from the `context`. The `ScriptRunner` is the exception; it executes a `script` instead of rendering a `prompt`.

Here's a quick overview of the primary renderers you'll use:
*   [**`create.Config`**](#configuration-management): Not a renderer, but a factory for creating reusable configuration objects. Define a base config with a shared model, temperature, or context, and have other renderers inherit from it to keep your code DRY.
*   [**`create.ScriptRunner`**](#scriptrunner): **For data-layer orchestration.** Executes a Cascada script to orchestrate complex, multi-step workflows. Its primary output is a structured data object (JSON), making it ideal for building agents and data pipelines.
*   [**`create.TemplateRenderer`**](#templaterenderer): **For presentation-layer generation.** Processes a Cascada template to produce a final string output, with no LLM involved. Perfect for generating HTML, Markdown, or other text-based formats from dynamic data.
*   [**`create.TextGenerator` / `create.TextStreamer`**](#textgenerator): **For LLM-based text generation.** Generates or streams unstructured text from an LLM. Use it for tasks like summarization, translation, or creative writing.
*   [**`create.ObjectGenerator` / `create.ObjectStreamer`**](#objectgenerator): **For structured data from an LLM.** Generates or streams structured JSON objects or arrays from an LLM, validated against a Zod schema. Ideal for data extraction, classification, or function-like outputs.
*   [**`create.Tool`**](#tool): **For exposing functions to an LLM.** Wraps any other renderer or a standard JavaScript function into a Vercel AI SDK-compatible tool. This allows an LLM to decide when and how to call your custom logic.

Every renderer shares a few key traits:

- **Created with Factories**: Use the `create` namespace to spin up renderers with custom configurations, optionally inheriting from a parent (a `Config` object or another renderer):
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

- **Template And Script Properties**: Every renderer supports template and script processing through several key properties:
  - `promptType` - Controls the template processing mode
  - `context` - Provides data and methods for templates and scripts
  - `filters` - Adds transformation functions
  - `loader` - Enables external template/script loading

  [See Template Properties](#template-properties)

- **Callable Interface**: Invoke renderers in two ways: with their built-in setup or with one-off prompts and contexts. Precompiled prompts/scripts (set during creation) run faster, while on-the-fly inputs offer flexibility:
  ```typescript
  // Using configured precompiled prompt and context
  const result = await renderer();

  // With a one-off prompt and context
  const result = await renderer('Hi {{ name }}', { name: 'World' });
  ```
  One-off inputs specified in a call argument are compiled each time they're used, while inputs defined during renderer creation are precompiled for better performance. [See Callable Render Objects](#callable-render-objects)

- **Nested in Scripts and Templates**: Drop renderers into your `context` to use them within other scripts or templates, chaining tasks effortlessly:
  ```typescript
  import { create } from 'cascador-ai';
  import { openai } from '@ai-sdk/openai';

  // Define a renderer that calls another renderer from its template
  const mainRenderer = create.TemplateRenderer({
    context: {
      // Define the nested renderer directly in the context
      translator: create.TextGenerator({
        model: openai('gpt-4o-mini'),
        prompt: 'Translate to {{ language }}: "{{ text }}"',
      }),
    },
    prompt: `Spanish: "{{ (translator({ text: 'It always seems impossible until it\\'s done.', language: 'Spanish' })).text }}"`
  });

  // Run the renderer and log the result
  mainRenderer().then(console.log).catch(console.error);
  ```
  [Check out Using Renderers in Templates and Scripts](#using-renderers-in-templates-and-scripts) for examples.

Renderers tie together *Cascador-AI*’s simplicity and concurrency magic, letting you orchestrate complex workflows with minimal fuss. Whether you’re building data pipelines, generating text, or rendering pure templates, they’ve got you covered.

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
### Property Inheritance Explained
Properties in *Cascador-AI* flow through a chain of configurations - starting from any `Config` object (or multiple), passing through parent renderers, and ending at the renderer you’re crafting. Each level can tweak or extend what came before, but the rules differ: scalar properties like `prompt` or `promptType` get overridden entirely, while objects like `filters`, and `loader` merge their contents, preserving and combining values.
For the `context` object a child renderer's context keeps all the parent root properties but overrides the ones with matching names

Here’s how it plays out:

```typescript
const rootConfig = create.Config({
  prompt: 'Root {{ var }}',
  context: { var: 'root', theme: 'dark' }, // Initial context
  filters: { uppercase: (s) => s.toUpperCase() }
});

const midConfig = create.Config({
  prompt: 'Mid {{ var }}',
  context: { var: 'mid' }, // Overrides 'var', keeps 'theme'
  filters: { lowercase: (s) => s.toLowerCase() } // Merges with uppercase
}, rootConfig);
// Resulting context: { var: 'mid', theme: 'dark' }

const parentRenderer = create.TextGenerator({
  prompt: 'Parent {{ var }}',
  context: { user: 'guest' }, // Adds 'user', keeps 'var' and 'theme'
}, midConfig);
// Resulting context: { var: 'mid', theme: 'dark', user: 'guest' }

const childRenderer = create.TextGenerator({
  prompt: 'Child {{ var }} {{ user }}', // Overrides prompt
}, parentRenderer);
// Resulting context: { var: 'mid', theme: 'dark', user: 'guest' }

(async () => {
  console.log((await childRenderer()).text); // "Child mid guest"
  // context: { var: 'mid', theme: 'dark', user: 'guest' }
  // filters: { uppercase, lowercase }
})();
```

## The Cascador Renderers

### Your Toolkit for Every Task

*Cascador-AI* offers a suite of renderers, each tailored to a specific job - whether it’s executing scripts, rendering templates, generating text, or streaming data. Built on the Vercel AI SDK, they share a common foundation where each LLM renderer has a corresponding Vercel AI SDK Core function. Here’s the lineup:

### TemplateRenderer
**What it does**: Pure template processing for string generation, with no LLMs involved. Perfect for stitching together dynamic content from data or async sources into a final text output like HTML or Markdown.

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

**Use it for**: Generating HTML, dynamic reports, email templates, or any task needing flexible, non-LLM rendering where the final output is a string.

### ScriptRunner

**What it does**: Executes a Cascada script to produce a structured data object (JSON). It is the ideal tool for orchestrating data sources, running multi-step logic, and building the data layer of your application.

For added reliability, you can provide an **optional** Zod `schema` to validate the script's output, ensuring it is type-safe.

```typescript
import { create } from 'cascador-ai';
import { z } from 'zod';

const dealFinder = create.ScriptRunner({
  schema: z.record(
    z.string(), // e.g., "sku-a123"
    z.array(z.object({ vendor: z.string(), price: z.number() }))
  ),
  context: {
    productIds: ['sku-a123', 'sku-b456'],
    vendors: ['VendorX', 'VendorY'],
    // Fake an async API call to fetch prices
    getPrice: async (productId, vendor) => ({
      vendor,
      price: Math.floor(Math.random() * 101) + 100,
    }),
  },
  script: `
    :data
    for productId in productIds
      for vendor in vendors
        var priceInfo = getPrice(productId, vendor)
        @data[productId].push(priceInfo)
      endfor
    endfor
  `,
});

(async () => {
  const report = await dealFinder();
  console.log(JSON.stringify(report, null, 2));
  /* Output:
    {
      "sku-a123": [ { "vendor": "VendorX", "price": 154 }, { "vendor": "VendorY", "price": 182 } ],
      "sku-b456": [ { "vendor": "VendorX", "price": 110 }, { "vendor": "VendorY", "price": 195 } ]
    }
  */
})();
```

#### Key Properties

*   **`script`**: A string containing the Cascada script that defines the orchestration logic.
*   **`context`**: An object providing data and functions (both sync and async) to the script. Promises returned from functions are resolved automatically.
*   **`schema`** (Optional): A Zod schema to validate the final output object. If validation fails, an error is thrown.

**Use it for**: Building type-safe data layers, orchestrating multi-step agentic workflows, fetching and aggregating data from multiple APIs/databases, and any task where the primary output is a reliable, structured data object. For a deep dive into the scripting language, see the **[Cascada Script Documentation](script.md)**.

### TextGenerator
**What it does**: Generates text via LLMs using Vercel’s [`generateText` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-text). Ideal for one-shot outputs like summaries or creative writing.

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

**Use it for**: Article generation, quick answers, or API-driven content. [See Vercel docs on text generation](https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#generatetext) for return details.

### TextStreamer
**What it does**: Streams LLM text in real time with Vercel’s [`streamText` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text). Great for live updates or chat-style interfaces.

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

**Use it for**: Progressive rendering, chatbots, or interactive UIs. [See Vercel docs on text streaming](https://sdk.vercel.ai/docs/ai-sdk-core/streaming-text#streamtext) for streaming specifics.

### ObjectGenerator
**What it does**: Produces structured data with Vercel’s [`generateObject` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-object), complete with schema validation. Think JSON outputs or classifications.

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

**Use it for**: Data extraction, structured responses, or enum-based classification. [See Vercel docs on object generation](https://sdk.vercel.ai/docs/ai-sdk-core/generating-objects#generateobject) for return details.

### ObjectStreamer
**What it does**: Streams structured data incrementally via Vercel’s [`streamObject` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-object). Perfect for real-time data feeds or partial updates.

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

**Use it for**: Live dashboards, incremental JSON builds, or array streaming. [See Vercel docs on object streaming](https://sdk.vercel.ai/docs/ai-sdk-core/streaming-objects#streamobject) for streaming specifics.

### Tool
**What it does**: Wraps an existing `TextGenerator`, `ObjectGenerator`, `TemplateRenderer` or `ScriptRunner` into a standardized, **Vercel AI SDK-compatible tool**. The resulting object can be provided to an LLM to be called based on its own reasoning.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// 1. Define a renderer to perform a specific task
const summarizer = create.TextGenerator({
  model: openai('gpt-4o-mini'),
  prompt: 'Provide a concise, one-sentence summary of the following text: {{ text }}',
});

// 2. Wrap it in a Tool to create a Vercel AI SDK-compatible tool object
const summarizeTool = create.Tool({
  description: 'Summarizes a given piece of text into a single sentence.',
  parameters: z.object({ text: z.string() }),
}, summarizer);

const chatAgent = create.TextGenerator({
  model: openai('gpt-4o'),
  tools: { summarize: summarizeTool }, // Provide the tool to the LLM
  prompt: "Please summarize this for me: 'Cascador-AI is an AI orchestration library...'",
});
const chatResult = await chatAgent(); // LLM sees the prompt and calls the tool
console.log('Model-Driven Result:', chatResult.toolCalls);
```

**Use it for**: Creating modular, reusable, and type-safe functions that can be used flexibly across your application, when want to empower an autonomous agent with the decision which tools to use.

## Callable Render Objects


Every renderer in *Cascador-AI* doubles as a callable object, giving you two ways to wield it: stick with its preconfigured setup or throw in a fresh prompt or context on the fly. Plus, renderers can serve as parent configurations for others, making them reusable building blocks.

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

Precompiled prompts (set at creation) are optimized for performance, while one-off prompts offer quick adaptability - perfect for testing or dynamic scenarios.

## Template Properties

Renderers in *Cascador-AI* are powered by Cascada's templating engine. With a handful of properties, you can control how prompts and  templates are processed, inject data, transform outputs, and pull in data from external files and service. These apply to all renderers except the script runner.

### prompt
The heart of your renderer - it’s the template or text that gets processed. Set it in three spots:
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
Provides data and methods that can be accessed within templates and scripts. Both the data and method returns can be asynchronous (promises are automatically handled), keeping your logic clean and powerful. Here’s what you can add to the `context` object:
- **Static Values**: Simple strings, numbers, or objects (e.g., `'London'`, `42`, `{ key: 'value' }`).
- **Synchronous Functions**: Basic logic or transformations (e.g., `(x) => x.toUpperCase()`).
- **Asynchronous Functions**: API calls, database queries, or file reads (e.g., `async () => await fetch(...)`).
- **Other Renderers**: Nest renderers for chained operations (e.g., a `TextGenerator` to translate text).
- **Custom Integrations**: Anything callable - think service clients or utility libraries.

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
Pull templates or scripts from files using a Nunjucks-compatible loader:
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

## Vercel AI Properties

*Cascador-AI* renderers inherit a robust set of properties from the [Vercel AI SDK](https://sdk.vercel.ai/), enabling fine-tuned control over language model behavior. These properties are available across all LLM renderer types and can be set in a base `Config` object, during renderer creation, or, where applicable overridden in runtime calls. Below are the key properties, with examples provided for the less intuitive ones (`model`, `stop`).

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
**Purpose**: Enables the model to call external functions *based on its own reasoning*.
**Details**: Supported by `TextGenerator` and `TextStreamer`. This is for model-driven tool use. For better organization, you can populate this with tools created by `create.Tool`.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';
import { z } from 'zod';

// Define a tool using the create.Tool factory
const getWeatherTool = create.Tool({
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ temperature: Math.floor(Math.random() * 30) })
});

// Pass the tool to the LLM
const weatherAgent = create.TextGenerator({
  model: openai('gpt-4o'),
  tools: { getWeather: getWeatherTool },
  prompt: 'What’s the weather like in San Francisco?',
}, baseConfig);

(async () => {
  // The LLM will see the prompt and decide to call getWeather.
  const { text, toolCalls } = await weatherAgent();
  console.log(text); // May contain the weather or be empty if a tool was called.
  console.log(toolCalls); // Will show the call to getWeather.
})();
```

### maxSteps
**Purpose**: Limits the number of model-driven tool-calling steps in a single turn.
**Type**: `number` (default: 1, optional).
**Details**: Works with the `tools` property in `TextGenerator` and `TextStreamer`.

## Using Renderers in Templates and Scripts

Renderers in *Cascador-AI* can be embedded within scripts or templates by adding them to the `context` object, enabling seamless task chaining and orchestration. This approach leverages the engine’s power to coordinate multiple renderers, execute them when their inputs are ready, and process their outputs dynamically.

### Example with `ScriptRunner` for Data Orchestration

Use `ScriptRunner` when your goal is to build a structured data object by orchestrating multiple steps. Its clear, top-to-bottom logic is ideal for data pipelines and complex agentic workflows.

```typescript
// ... (characterGenerator, storyGenerator, critiqueGenerator setup from previous examples) ...

// Orchestrating script
const mainOrchestrator = create.ScriptRunner({
  context: {
    characterGenerator,
    storyGenerator,
    critiqueGenerator,
    topic: 'a lost astronaut'
  },
  script: `
    :data
    // Step 1: Generate the character. This runs first.
    var character = (characterGenerator({ topic: topic })).object
    // Step 2: Generate the story using the character. This runs after character is ready.
    var story = (storyGenerator({ character: character, topic: topic })).text
    // Step 3: Critique the story. This runs after the story is ready.
    var critique = (critiqueGenerator({ story: story })).text
    // Assemble the final data object.
    @data.character = character
    @data.story = story
    @data.critique = critique
  `
}, baseConfig);

(async () => {
  const result = await mainOrchestrator();
  console.log(JSON.stringify(result, null, 2));
})();
```

### Example with `TemplateRenderer` for Presentation

Use `TemplateRenderer` when your primary goal is to generate a final string output, like an HTML page or a formatted report. The template syntax is concise for embedding results directly into text.

```typescript
// ... (characterGenerator, storyRenderer, critiqueStreamer setup from previous examples) ...

// Orchestrating renderer for presentation
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

    {% set storyContent = (storyRenderer({ character, topic })).text %}
    Story: {{ storyContent }}

    Live Critique: {% set stream = (critiqueStreamer({ story: storyContent })).textStream %}
      {% for chunk in stream %}{{ chunk }}{% endfor %}
  `
}, baseConfig);

(async () => {
  const result = await mainRenderer();
  console.log(result); // Outputs a single formatted string
})();
```

### Key Points
- **Parallel Execution**: The critique stream runs after the story, which depends on the character, optimizing the dependency chain.
- **Result Handling**: Access `.object` for structured data, `.text` for stories, and `.textStream` for live critiques.
- **Dynamic Inputs**: Pass outputs (e.g., `character`) to subsequent renderers for cohesive workflows.
- **Versatility**: Combine different renderer types - like `ObjectGenerator`, `TextGenerator`, and `TextStreamer` - to handle varied tasks in one workflow.

## Choosing Your Orchestration Strategy: Scripts, Templates, Context Methods, and Tools

In *Cascador-AI*, you have several powerful mechanisms to build workflows. Choosing the right one depends on your goal: are you building a structured data object, or are you rendering a final text document, as well as who should be in control: the developer or the AI model.

### `ScriptRunner` & `TemplateRenderer`: For Data and Presentation Layers
-   **`ScriptRunner`**: Use when the primary output is a structured data object (JSON). Ideal for data-layer logic, multi-step agents, and orchestrating various data sources. It is the backbone of your application's data layer.

**Use When:**
-   **The output is data:** Your main goal is to create a complex object or array to be used by your application.
-   **Complex logic is needed:** You need loops (`for`, `while`), conditionals (`if/else`), and variables to manage state across multiple async steps.
-   **Orchestrating multiple sources:** You are fetching data from several APIs, databases, and other renderers and need to combine them into a single, coherent object.
-   **Readability is key for complex flows:** The top-to-bottom, `await`-free syntax makes complex data dependencies easy to follow.

-   **`TemplateRenderer`**: Use when the primary output is a rendered string (for instance an HTML or a Markdown). Ideal for the presentation layer.

**Use When:**
-   **The output is text:** You are generating a final, human-readable document.
-   **Logic is simple and presentation-focused:** The workflow involves embedding data into a string using `{{ variable }}` and simple conditionals or loops with `{% %}` tags.
-   **You are building UIs:** Generating HTML with included partials is a classic use case.

### Context Methods & Filters: The Building Blocks
These are the fundamental JS/TS functions you provide to *both* scripts and templates. They are not an orchestration strategy on their own, but rather the efficient, predictable actions that your orchestrator calls.

**Use When:**
-   **You need raw performance:** A plain JavaScript/TypeScript function is always faster than an LLM call.
-   **The logic is deterministic:** You need to fetch data from a known API endpoint, query a database, or perform a specific data transformation.
-   **You want to expose utilities:** Provide helper functions (e.g., `formatDate`, `calculateTotal`) to your scripts and templates.

### `Tools`: For Developer-Defined Functionality
`create.Tools` provides a clean, type-safe way to expose custom functionality to your AI workflows. Unlike the old Vercel AI SDK approach where the LLM decides which tools to call, `Tools` gives you full control over when and how functions are executed.

**Use When:**
-   **The workflow is unpredictable**: You can't know ahead of time what the user will ask. The LLM must infer intent and select the appropriate tool (e.g., `getWeather` vs. `sendEmail`).
-   **You are building a conversational agent**: The LLM can chain its own reasoning - calling a tool, getting a result, and using that result to decide its next step - all within a single, autonomous turn.

## Embedding Integration

*Cascador-AI* seamlessly integrates vector embeddings from the Vercel AI SDK. By adding embedding functions to the `context` object, you can use them directly in scripts for tasks like semantic search, similarity comparisons, or retrieval-augmented generation (RAG).

### Example
Here’s how to find the most similar document to a user query using a `ScriptRunner` to orchestrate the embedding and comparison tasks in parallel.

```typescript
import { openai } from '@ai-sdk/openai';
import { embed, cosineSimilarity } from 'ai';
import { create } from 'cascador-ai';
import fs from 'fs/promises';

const documentFinder = create.ScriptRunner({
  context: {
    userQuery: 'machine learning applications',
    readFile: async (filePath) => await fs.readFile(filePath, 'utf-8'),
    embedText: async (text) => (await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: text
    })).embedding,
    compareSimilarity: cosineSimilarity,
    range: (n) => [...Array(n).keys()], // Helper to generate numbers for the loop
  },
  script: `
    :data
    // Get the query embedding once.
    var queryEmbedding = embedText(userQuery)
    // The 'for' loop in Cascada Script runs in parallel for each item.
    // This fetches, reads, and embeds all 10 documents concurrently.
    for i in range(10)
      var docPath = 'docs/document' + (i + 1) + '.txt'
      var docText = readFile(docPath)
      var docEmbedding = embedText(docText)
      // The @data command is buffered, ensuring orderly assembly
      // after all parallel operations are complete.
      @data.docs.push({
        filename: docPath,
        similarity: compareSimilarity(queryEmbedding, docEmbedding)
      })
    endfor
    // Note: Reading from @data is not yet supported.
    // Sorting must be done in the calling JavaScript/TypeScript code.
  `
}, baseConfig);

(async () => {
  const result = await documentFinder();
  // Sort the results in JS after the script has run
  const sortedDocs = result.docs.sort((a, b) => b.similarity - a.similarity);
  console.log(`Most similar document to "${result.userQuery}":`);
  console.log(sortedDocs[0]);
})();
```

## RAG Integration

*Cascador-AI*’s script-driven approach simplifies retrieval-augmented generation (RAG) workflows. By using `ScriptRunner`, you can clearly define the steps of your RAG pipeline: searching an index, retrieving context, and generating a final answer. This leverages automatic concurrency for maximum efficiency.

### Example
**Summary**: This example loads 10 documents, builds a vector index with LlamaIndex, and uses a `ScriptRunner` to orchestrate the retrieval of relevant snippets about machine learning for cancer detection and then summarizes them.

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

// Answer generator renderer
const answerGenerator = create.TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Summarize the latest advancements in machine learning for cancer detection based on: {{ context }}'
});

// RAG orchestrator using ScriptRunner
const ragOrchestrator = create.ScriptRunner({
  context: {
    query: 'What are the latest advancements in machine learning for cancer detection?',
    searchIndex: async (queryText) => {
      const queryEngine = vectorIndex.asQueryEngine();
      const response = await queryEngine.query(queryText);
      return response.sourceNodes.map(n => n.text).join('\n');
    },
    answerGenerator
  },
  script: `
    :data
    // Step 1: Search the index to get relevant context
    var context = searchIndex(query)
    // Step 2: Use the context to generate a final answer
    var answer = (answerGenerator({ context: context })).text
    // Step 3: Assemble the final output object
    @data.query = query
    @data.answer = answer
  `
});

(async () => {
  const result = await ragOrchestrator();
  console.log(JSON.stringify(result, null, 2));
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

- **Chat functionality** via create.Chat
- **First-Class Evaluators for Quality, Safety, and Testing**: Evaluator system to enhance AI reliability through three key use cases: building self-correcting workflows, implementing live production guardrails, and integrating validation into automated tests. Accessible via two flexible patterns: a composable create.Evaluator wrapper that transparently wraps any renderer—preserving its original call signature and return as well as an universal evaluator property that can be added to any renderer for simple, declarative quality control. The system will support fine-grained control over retries and an option to throw exceptions on failure for seamless CI/CD integration.
- **OpenTelemetry/MLflow integration**:  MLflow's tracing, which captures your app's entire execution, including prompts, retrievals, tool calls.
- **Automated Prompt Optimization**: Go beyond manual prompt engineering with a built-in create.Optimizer. Inspired by frameworks like DSPy, this feature will allow you to attach an optimizer to any generator. It will use your existing Evaluator as a guide to programmatically test and evolve your prompts, automatically discovering the highest-performing version for your specific task. This creates a powerful feedback loop, using the same components that guard your production app to continuously improve its core logic with minimal effort.
- **Execution Replay and Debugging**: A planned Cascada feature - creating an advanced logging system, via a dedicated output handler, to capture the entire execution trace. This will allow developers to replay and inspect the sequence of operations and variable states for complex debugging, and will integrate seamlessly with the Evaluator's trace history.
- **Optional native JS/TS scripts and templates** to be used instead of Cascada, e.g. 'prompt' and 'script' properties can be a JS/TS function.
- **Image Generation**: Add support for generating images from prompts using models like DALL-E.
- **Versioned Templates**: Enable loading versioned prompts with a loader that wraps unversioned loaders for better template management. Choose different versions depending on the model or validate old and new prompts during tests.
- **Snapshot Support**: Request the template engine to return a snapshot of the currently rendered data. Due to the non-sequential nature of the rendering - regular streaming is not practical. Useful for previews.
- **Instructions on integrating memory**: Provide clear patterns and examples for integrating long-term memory.
- **Simplified loader wrapper**: replace the more complex nunjucks loaders with simple function or interface