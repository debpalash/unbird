export type AppEnv = {
  nodeEnv: string;
  xBearerToken: string;
  sessionFilePath: string;
};

const DEFAULT_BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAA8xnZfAAzPsh3R4lA8G6j4nQqkWE%3D1Zv7ttfk8NAh6Dh1m2D0geQh7Qj9h9D7X8iK7rQ8M5k";

export function loadEnv(): AppEnv {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    xBearerToken: process.env.X_BEARER_TOKEN ?? DEFAULT_BEARER_TOKEN,
    sessionFilePath: process.env.SESSION_FILE_PATH ?? "session/sessions.jsonl",
  };
}
