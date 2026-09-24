import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Groq LLM adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails clearly when GROQ_API_KEY is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const { invokeLLM } = await import("./_core/llm");

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "hello" }] })
    ).rejects.toThrow("GROQ_API_KEY is not configured");
  });

  it("calls Groq with the server-side key and supported default model", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "test-response",
        created: 1,
        model: "llama-3.3-70b-versatile",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Grounded answer" },
            finish_reason: "stop",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { invokeLLM } = await import("./_core/llm");
    const result = await invokeLLM({
      messages: [{ role: "user", content: "Explain this repository" }],
    });

    expect(result.choices[0]?.message.content).toBe("Grounded answer");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-groq-key",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "llama-3.3-70b-versatile",
    });
  });
});
