const axios = require("axios");
const https = require("https");
const { randomUUID } = require("crypto");

const baseUrl = "https://chat.openai.com";
const apiUrl = `${baseUrl}/backend-api/conversation`;

let token;
let oaiDeviceId;

async function getNewSessionId() {
  let newDeviceId = randomUUID();
  const response = await axiosInstance.post(
    `${baseUrl}/backend-anon/sentinel/chat-requirements`,
    {},
    {
      headers: { "oai-device-id": newDeviceId },
    }
  );
  //   console.log(
  //     `System: Successfully refreshed session ID and token. ${
  //       !token ? "(Now it's ready to process requests)" : ""
  //     }`
  //   );
  oaiDeviceId = newDeviceId;
  token = response.data.token;

  // console.log("New Token:", token);
  // console.log("New Device ID:", oaiDeviceId);
}

function GenerateCompletionId(prefix = "cmpl-") {
  const characters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = 28;

  for (let i = 0; i < length; i++) {
    prefix += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return prefix;
}

async function* chunksToLines(chunksAsync) {
  let previous = "";
  for await (const chunk of chunksAsync) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    previous += bufferChunk;
    let eolIndex;
    while ((eolIndex = previous.indexOf("\n")) >= 0) {
      // line includes the EOL
      const line = previous.slice(0, eolIndex + 1).trimEnd();
      if (line === "data: [DONE]") break;
      if (line.startsWith("data: ")) yield line;
      previous = previous.slice(eolIndex + 1);
    }
  }
}

async function* linesToMessages(linesAsync) {
  for await (const line of linesAsync) {
    const message = line.substring("data :".length);

    yield message;
  }
}

async function* messagesToRes(messagesAsync) {
  for await (const message of messagesAsync) {
    let requestId = GenerateCompletionId("chatcmpl-");
    let created = Date.now();
    let response = {
      id: requestId,
      created: created,
      object: "chat.completion.chunk",
      model: "gpt-3.5-turbo",
      choices: [
        {
          delta: {
            content: JSON.parse(message)?.message?.content?.parts[0] || "",
          },
          index: 0,
          finish_reason: null,
        },
      ],
    };
    yield response;
  }
}

async function* StreamCompletion(data) {
  yield* linesToMessages(chunksToLines(data));
}

async function* StreamFinalReturn(data) {
  yield* messagesToRes(linesToMessages(chunksToLines(data)));
}

// Setup axios instance for API requests with predefined configurations
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  headers: {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "oai-language": "en-US",
    origin: baseUrl,
    pragma: "no-cache",
    referer: baseUrl,
    "sec-ch-ua":
      '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  },
});

// Middleware to handle chat completions
async function handleChatCompletion(data, res) {
  try {
    await getNewSessionId();

    const body = {
      action: "next",
      messages: data.messages.map((message) => ({
        author: { role: message.role },
        content: { content_type: "text", parts: [message.content] },
      })),
      parent_message_id: randomUUID(),
      model: "text-davinci-002-render-sha",
      timezone_offset_min: -180,
      suggestions: [],
      history_and_training_disabled: true,
      conversation_mode: { kind: "primary_assistant" },
      websocket_request_id: randomUUID(),
    };

    const response = await axiosInstance.post(apiUrl, body, {
      responseType: "stream",
      headers: {
        "oai-device-id": oaiDeviceId,
        "openai-sentinel-chat-requirements-token": token,
      },
    });

    if (data.stream) return StreamFinalReturn(response.data);

    let fullContent = "";
    let requestId = GenerateCompletionId("chatcmpl-");
    let created = Date.now();

    for await (const message of StreamCompletion(response.data)) {
      const parsed = JSON.parse(message);

      let content = parsed?.message?.content?.parts[0] || "";

      for (let message of data.messages) {
        if (message.content === content) {
          content = "";
          break;
        }
      }

      if (content === "") continue;

      if (data.stream) {
        let response = {
          id: requestId,
          created: created,
          object: "chat.completion.chunk",
          model: "gpt-3.5-turbo",
          choices: [
            {
              delta: {
                content: content.replace(fullContent, ""),
              },
              index: 0,
              finish_reason: null,
            },
          ],
        };

        res.write(`data: ${JSON.stringify(response)}\n\n`);
      }

      fullContent = content.length > fullContent.length ? content : fullContent;
    }
    if (data.stream) {
      res.write(
        `data: ${JSON.stringify({
          id: requestId,
          created: created,
          object: "chat.completion.chunk",
          model: "gpt-3.5-turbo",
          choices: [
            {
              delta: {
                content: "",
              },
              index: 0,
              finish_reason: "stop",
            },
          ],
        })}\n\n`
      );
    } else {
      return {
        id: requestId,
        created: created,
        model: "gpt-3.5-turbo",
        object: "chat.completion",
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: {
              content: fullContent,
              role: "assistant",
            },
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    }

    res.end();
  } catch (error) {
    // console.log(error.message);
  }
}
module.exports = class FreeGPT35 {
  chat = {
    completions: {
      async create(data) {
        return handleChatCompletion(data);
      },
    },
  };
  constructor() {}
};
