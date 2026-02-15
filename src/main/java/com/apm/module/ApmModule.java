package com.apm.module;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.SpanProcessor;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.samplers.Sampler;
import io.opentelemetry.semconv.ResourceAttributes;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

public final class ApmModule {
    private static volatile ApmModule instance;

    private final ApmConfig config;
    private final OpenTelemetry openTelemetry;
    private final Tracer tracer;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    private ApmModule(ApmConfig config) {
        this.config = config;
        this.openTelemetry = buildOpenTelemetry(config);
        this.tracer = openTelemetry.getTracer("apm-module", "0.1.0");
        this.objectMapper = new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public static synchronized ApmModule init(ApmConfig config) {
        if (instance == null) {
            instance = new ApmModule(config);
        }
        return instance;
    }

    public static ApmModule get() {
        if (instance == null) {
            throw new IllegalStateException("ApmModule not initialized. Call init() first.");
        }
        return instance;
    }

    public ApmEvent startEvent(String name, Map<String, String> attrs) {
        Span span = tracer.spanBuilder(name).startSpan();
        if (attrs != null) {
            for (Map.Entry<String, String> entry : attrs.entrySet()) {
                span.setAttribute(entry.getKey(), entry.getValue());
            }
        }
        String eventId = UUID.randomUUID().toString();
        long startTime = System.currentTimeMillis();
        return new ApmEvent(eventId, name, startTime, span, attrs);
    }

    public void endEvent(ApmEvent event, StatusCode status) {
        long endTime = System.currentTimeMillis();
        event.setEndTime(endTime);
        Span span = event.getSpan();
        if (status != null) {
            span.setStatus(status);
        }
        span.end();
    }

    public void addMetric(ApmEvent event, String key, double value) {
        event.getMetrics().put(key, value);
    }

    public void addTraceStep(ApmEvent event, String name, double value) {
        event.getTrace().add(new TraceStep(name, value));
        Span span = event.getSpan();
        span.addEvent(name, Attributes.of(io.opentelemetry.api.common.AttributeKey.doubleKey("value"), value));
    }

    public int sendEvent(ApmEvent event) throws IOException, InterruptedException {
        if (config.isTailFirstEnabled()) {
            applyTailFirstControl(event);
        }

        String json = objectMapper.writeValueAsString(event);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(config.getDashboardEndpoint()))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return response.statusCode();
    }

    private void applyTailFirstControl(ApmEvent event) {
        Map<String, Double> metrics = event.getMetrics();
        double riskScore = computeRiskScore(metrics);

        String mode;
        double sampleRate;
        if (riskScore >= config.getRiskCriticalThreshold()) {
            mode = "critical";
            sampleRate = config.getCriticalSampleRatio();
        } else if (riskScore >= config.getRiskWarningThreshold()) {
            mode = "warning";
            sampleRate = config.getWarningSampleRatio();
        } else {
            mode = "stable";
            sampleRate = config.getStableSampleRatio();
        }

        boolean captureDetailed = !"stable".equals(mode) || Math.random() <= sampleRate;

        metrics.put("riskScore", riskScore);
        event.getTags().put("tailFirstMode", mode);
        event.getTags().put("tailFirstDetailed", Boolean.toString(captureDetailed));
        event.getTags().put("tailFirstSampleRate", String.valueOf(sampleRate));

        if (!captureDetailed) {
            event.getTrace().clear();
            Map<String, Double> light = new HashMap<>();
            copyIfPresent(metrics, light, "durationMs");
            copyIfPresent(metrics, light, "requestCount");
            copyIfPresent(metrics, light, "errorCount");
            copyIfPresent(metrics, light, "apdex");
            light.put("riskScore", riskScore);

            metrics.clear();
            metrics.putAll(light);
        }
    }

    private static void copyIfPresent(Map<String, Double> src, Map<String, Double> dst, String key) {
        Double value = src.get(key);
        if (value != null) {
            dst.put(key, value);
        }
    }

    private static double computeRiskScore(Map<String, Double> metrics) {
        Double queuePressureRaw = pickMetric(metrics, "queuePressure", "queue_pressure");
        Double queueDepthRaw = pickMetric(metrics, "queueDepth", "queueLen");
        Double dbWaitRatioRaw = pickMetric(metrics, "dbWaitRatio", "db_wait_ratio", "dbPoolUsagePct", "dbConnPoolPct");
        Double lockWaitRaw = pickMetric(metrics, "lockWait", "lock_wait", "lockWaitRatio", "lock_wait_ratio");
        Double retryRateRaw = pickMetric(metrics, "retryRate", "retry_rate", "retryPct");
        Double gcRatioRaw = pickMetric(metrics, "gcRatio", "gc_ratio", "gcPauseRatio", "gc_pause_ratio");
        Double cpuUtilRaw = pickMetric(metrics, "cpuUtil", "cpu_util", "cpuPct");

        double queuePressure = queuePressureRaw != null
                ? normalizePercent(toPercentScale(queuePressureRaw))
                : (queueDepthRaw == null ? 0.0 : normalizePercent(normalize(queueDepthRaw, 10, 300) * 100.0));
        double dbWaitRatio = normalizePercent(toPercentScale(dbWaitRatioRaw));
        double lockWait = normalizePercent(toPercentScale(lockWaitRaw));
        double retryRate = normalizePercent(toPercentScale(retryRateRaw));
        double gcRatio = normalizePercent(toPercentScale(gcRatioRaw));
        double cpuUtil = normalizePercent(toPercentScale(cpuUtilRaw));

        double weighted = (queuePressure * 0.35)
                + (dbWaitRatio * 0.25)
                + (lockWait * 0.15)
                + (retryRate * 0.10)
                + (gcRatio * 0.10)
                + (cpuUtil * 0.05);

        double clamped = Math.max(0.0, Math.min(1.0, weighted));
        return Math.round(clamped * 10000.0) / 10000.0;
    }

    private static Double pickMetric(Map<String, Double> metrics, String... keys) {
        for (String key : keys) {
            Double value = metrics.get(key);
            if (value != null && !Double.isNaN(value) && !Double.isInfinite(value)) {
                return value;
            }
        }
        return null;
    }

    private static Double toPercentScale(Double value) {
        if (value == null || Double.isNaN(value) || Double.isInfinite(value)) {
            return null;
        }
        return value <= 1.0 ? value * 100.0 : value;
    }

    private static double normalizePercent(Double value) {
        if (value == null) {
            return 0.0;
        }
        return normalize(value, 0, 100);
    }

    private static double normalize(Double value, double min, double max) {
        if (value == null || Double.isNaN(value) || Double.isInfinite(value) || max <= min) {
            return 0.0;
        }
        double normalized = (value - min) / (max - min);
        return Math.max(0.0, Math.min(1.0, normalized));
    }

    public void shutdown() {
        if (openTelemetry instanceof OpenTelemetrySdk) {
            OpenTelemetrySdk sdk = (OpenTelemetrySdk) openTelemetry;
            sdk.getSdkTracerProvider().shutdown().join(5, TimeUnit.SECONDS);
        }
        instance = null;
    }

    private static OpenTelemetry buildOpenTelemetry(ApmConfig config) {
        Resource resource = Resource.getDefault().merge(Resource.create(Attributes.of(
                ResourceAttributes.SERVICE_NAME, config.getServiceName(),
                ResourceAttributes.DEPLOYMENT_ENVIRONMENT, config.getEnvironment()
        )));

        OtlpGrpcSpanExporter exporter = OtlpGrpcSpanExporter.builder()
                .setEndpoint(config.getOtlpEndpoint())
                .build();

        SpanProcessor spanProcessor = BatchSpanProcessor.builder(exporter).build();

        SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
                .setResource(resource)
                .setSampler(Sampler.traceIdRatioBased(config.getSampleRatio()))
                .addSpanProcessor(spanProcessor)
                .build();

        return OpenTelemetrySdk.builder()
                .setTracerProvider(tracerProvider)
                .build();
    }
}
