import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import {
  isOpenInferenceSpan,
  OpenInferenceSimpleSpanProcessor,
} from "@arizeai/openinference-vercel";

const projectName = process.env.ARIZE_PROJECT_NAME ?? "sourdough-assistant";

export const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    model_id: projectName,
    model_version: "1.0.0",
    "service.name": projectName,
  }),
  spanProcessors: [
    new OpenInferenceSimpleSpanProcessor({
      exporter: new OTLPTraceExporter({
        url: "https://otlp.arize.com/v1/traces",
        headers: {
          space_id: process.env.ARIZE_SPACE_ID ?? "",
          api_key: process.env.ARIZE_API_KEY ?? "",
        },
      }),
      spanFilter: isOpenInferenceSpan,
    }),
  ],
});

export function register() {
  provider.register();
}
