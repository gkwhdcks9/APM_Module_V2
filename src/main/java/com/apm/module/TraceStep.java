package com.apm.module;

public final class TraceStep {
    private final String name;
    private final double value;

    public TraceStep(String name, double value) {
        this.name = name;
        this.value = value;
    }

    public String getName() {
        return name;
    }

    public double getValue() {
        return value;
    }
}
