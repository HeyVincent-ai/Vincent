import { describe, it, expect } from "vitest";
import { runSkillAgent } from "../agent.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = process.env.SKILL_CI_BASE_URL!;
const skillContent = readFileSync(
  resolve(import.meta.dirname, "../../../skills/wallet/SKILL.md"),
  "utf-8"
);

describe("Skill: wallet", () => {
  it("can create a wallet and check its balance", async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      task: `Follow the skill instructions to:
1. Create a new EVM wallet (type: EVM_WALLET, chainId: 84532, memo: "CI test wallet")
2. Use the returned API key to check the wallet balances
Report the wallet address and balance.`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    // Extract HTTP request tool calls
    const calls = result.toolCalls.filter((c) => c.name === "http_request");
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Verify a secret was created
    const createCall = calls.find(
      (c) =>
        (c.args as { url: string }).url.includes("/api/secrets") &&
        (c.args as { method: string }).method === "POST"
    );
    expect(createCall).toBeDefined();

    const createResult = createCall!.result as {
      status: number;
      body: string;
    };
    expect(createResult.status).toBe(201);
    const createBody = JSON.parse(createResult.body);
    expect(createBody.data.apiKey.key).toMatch(/^ssk_/);

    // Verify balance was checked
    const balanceCall = calls.find(
      (c) =>
        (c.args as { url: string }).url.includes("/balance") &&
        (c.args as { method: string }).method === "GET"
    );
    expect(balanceCall).toBeDefined();

    const balanceResult = balanceCall!.result as { status: number };
    expect(balanceResult.status).toBe(200);
  });
});
