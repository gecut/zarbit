import assert from "node:assert/strict";
import test from "node:test";

import type { Store } from "@zarbit/db";

import { createRequestExecutor } from "../src/requests";

test("matches compact requests and sends their compact target price", async () => {
  const row = {
    id: "request-1",
    userId: "user-1",
    action: "BUY" as const,
    targetPrice: 96_120,
    units: 2,
  };
  let candidateQuote: number | undefined;
  let claimedQuote:
    { compactQuote: number; sourceMessageId: number } | undefined;
  let sentMessage: string | undefined;
  const store = {
    requestCandidates: async (quote: number) => {
      candidateQuote = quote;
      return [row];
    },
    claimRequest: async (
      _id: string,
      _userId: string,
      _token: string,
      quote?: { compactQuote: number; sourceMessageId: number },
    ) => {
      claimedQuote = quote;
      return row;
    },
    completeRequest: async () => ({ count: 1 }),
    owner: async () => ({ telegramUserId: "telegram-user-1" }),
  } as unknown as Pick<
    Store,
    "requestCandidates" | "claimRequest" | "completeRequest" | "owner"
  >;

  const requests = createRequestExecutor(store, {
    ready: async () => undefined,
    group: async (_userId, text) => {
      sentMessage = text;
      return 1;
    },
    private: async () => 2,
  });

  await requests.match({ compactQuote: 96_120, sourceMessageId: 9 });

  assert.equal(candidateQuote, 96_120);
  assert.deepEqual(claimedQuote, { compactQuote: 96_120, sourceMessageId: 9 });
  assert.equal(sentMessage, "2خ96120");
});
