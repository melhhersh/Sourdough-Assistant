// Full test: send a real OTLP span via NodeTracerProvider with verbose export logging
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-proto");
const { trace, SpanStatusCode } = require("@opentelemetry/api");
const { diag, DiagConsoleLogger, DiagLogLevel } = require("@opentelemetry/api");

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const SPACE_ID = process.env.ARIZE_SPACE_ID;
const API_KEY = process.env.ARIZE_API_KEY;
const PROJECT = process.env.ARIZE_PROJECT_NAME ?? "sourdough-assistant";

console.log("space_id:", SPACE_ID);
console.log("api_key prefix:", API_KEY.slice(0, 10) + "...");
console.log("project:", PROJECT);

const exporter = new OTLPTraceExporter({
  url: "https://otlp.arize.com/v1/traces",
  headers: {
    space_id: SPACE_ID,
    api_key: API_KEY,
  },
});

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
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

provider.forceFlush().then(() => {
  console.log("\nFlush complete.");
  return provider.shutdown();
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
