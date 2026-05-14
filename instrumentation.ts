export async function register() {
  const { registerOTel } = await import("@vercel/otel");
  const { OpenInferenceSimpleSpanProcessor } = await import(
    "@arizeai/openinference-vercel"
  );
  const { OTLPTraceExporter } = await import(
    "@opentelemetry/exporter-trace-otlp-proto"
  );

  const exporter = new OTLPTraceExporter({
    url: process.env.PHOENIX_COLLECTOR_ENDPOINT,
    headers: {
      Authorization: `Bearer ${process.env.PHOENIX_API_KEY}`,
    },
  });

  registerOTel({
    serviceName: "sourdough-assistant",
    spanProcessors: [
      new OpenInferenceSimpleSpanProcessor({ exporter }),
    ],
  });
}
