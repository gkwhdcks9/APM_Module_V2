package com.apm.module;

import io.opentelemetry.api.trace.Span;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class ApmEvent {
    private final String eventId;
    private final String name;
    private final long startTime;
    private long endTime;
    private final Map<String, Double> metrics;
    private final List<TraceStep> trace;
    private final Map<String, String> tags;
    private final transient Span span;

    ApmEvent(String eventId, String name, long startTime, Span span, Map<String, String> tags) {
        this.eventId = eventId;
        this.name = name;
        this.startTime = startTime;
        this.endTime = 0L;
        this.metrics = new HashMap<>();
        this.trace = new ArrayList<>();
        this.tags = tags == null ? new HashMap<>() : new HashMap<>(tags);
        this.span = span;
    }

    public String getEventId() {
        return eventId;
    }

    public String getName() {
        return name;
    }

    public long getStartTime() {
        return startTime;
    }

    public long getEndTime() {
        return endTime;
    }

    void setEndTime(long endTime) {
        this.endTime = endTime;
    }

    public Map<String, Double> getMetrics() {
        return metrics;
    }

    public List<TraceStep> getTrace() {
        return trace;
    }

    public Map<String, String> getTags() {
        return tags;
    }

    Span getSpan() {
        return span;
    }
}
