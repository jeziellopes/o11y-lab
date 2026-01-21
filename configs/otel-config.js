/**
 * Shared OpenTelemetry configuration for all services
 * This module provides a consistent setup for tracing across microservices
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

/**
 * Initialize OpenTelemetry SDK with automatic instrumentation
 * @param {string} serviceName - Name of the service
 * @param {string} serviceVersion - Version of the service
 * @returns {NodeSDK} Configured OpenTelemetry SDK instance
 */
function initOpenTelemetry(serviceName, serviceVersion = '1.0.0') {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces';
  
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: otlpEndpoint,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation to reduce noise
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();
  
  console.log(`OpenTelemetry initialized for ${serviceName}`);
  console.log(`Exporting traces to: ${otlpEndpoint}`);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry terminated'))
      .catch((error) => console.log('Error terminating OpenTelemetry', error))
      .finally(() => process.exit(0));
  });

  return sdk;
}

module.exports = { initOpenTelemetry };
