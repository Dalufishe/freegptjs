# Node.js Free GPT 3.5 API Library

This library provides Free access to the OpenAI ChatGPT 3.5 API from JavaScript.

> No API key required.

The API is almost the same as [openai-node](https://github.com/openai/openai-node/tree/master).

```bash
npm install freegptjs
```

### Usage

```js
import FreeGPT3 from "freegptjs";

// No API key required.
const openai = new FreeGPT3();

async function main() {
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: "Hello, Free GPT !" }],
    model: "gpt-3.5-turbo",
  });
  console.log(chatCompletion.choices[0].message.content);
}

main();
```

### Streaming responses

```js
import FreeGPT3 from "freegptjs";

const openai = new FreeGPT3();

async function main() {
  const stream = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: "Hello, Free GPT !" }],
    stream: true,
  });
  for await (const chunk of stream) {
    console.log(chunk.choices[0]?.delta?.content || "");
  }
}

main();
```

### Special Thanks

https://github.com/skzhengkai/free-chatgpt-api
https://github.com/missuo/FreeGPT35
