import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config().ANTHROPIC_API_KEY });
  }
  return client;
}
