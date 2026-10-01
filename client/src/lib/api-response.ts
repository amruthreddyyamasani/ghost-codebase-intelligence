const FALLBACK_MESSAGE = "The server returned an invalid response. Please try again.";

type ErrorEnvelope = {
  error: {
    json: {
      message: string;
      code: number;
      data: {
        code: "INTERNAL_SERVER_ERROR";
        httpStatus: number;
      };
    };
  };
};

function fallbackEnvelope(status: number): ErrorEnvelope[] {
  return [{
    error: {
      json: {
        message: status >= 500 ? FALLBACK_MESSAGE : `The server returned an invalid response (HTTP ${status}).`,
        code: -32603,
        data: { code: "INTERNAL_SERVER_ERROR", httpStatus: status },
      },
    },
  }];
}

/**
 * tRPC's fetcher parses the body as JSON. Vercel can occasionally return a
 * platform/plain-text error instead, so normalize only the transport envelope
 * while preserving the original HTTP failure status.
 */
export async function normalizeTRPCResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await response.clone().text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    const body = JSON.stringify(fallbackEnvelope(response.status));
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (contentType.includes("json")) return response;

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json");
  const body = parsed;
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
