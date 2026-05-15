// Minimal test: send one real span to Arize OTLP and print the response
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { trace, SpanStatusCode } from "@opentelemetry/api";

const SPACE_ID = process.env.ARIZE_SPACE_ID;
const API_KEY = process.env.ARIZE_API_KEY;
const PROJECT = process.env.ARIZE_PROJECT_NAME ?? "sourdough-assistant";

if (!SPACE_ID || !API_KEY) {
  console.error("Missing ARIZE_SPACE_ID or ARIZE_API_KEY");
  process.exit(1);
}

console.log("space_id:", SPACE_ID);
console.log("api_key prefix:", API_KEY.slice(0, 8) + "...");
console.log("project:", PROJECT);

const exporter = new OTLPTraceExporter({
  url: "https://otlp.arize.com/v1/traces",
  headers: {
    space_id: SPACE_ID,
    api_key: API_KEY,
  },
});

const provider = new NodeTracerProvider({
  resource: new Resource({
    "openinference.project.name": PROJECT,
    "model_id": PROJECT,
    "service.name": "sourdough-assistant",
  }),
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

provider.register();

const tracer = trace.getTracer("arize-test", "1.0.0");

const span = tracer.startSpan("test-span");
span.setAttribute("openinference.span.kind", "CHAIN");
span.setAttribute("input.value", "test input");
span.setAttribute("output.value", "test output");
span.setStatus({ code: SpanStatusCode.OK });
span.end();

console.log("Span ended, flushing...");
await provider.forceFlush();
console.log("Done — check Arize for a 'test-span' trace in project:", PROJECT);
await provider.shutdown();
