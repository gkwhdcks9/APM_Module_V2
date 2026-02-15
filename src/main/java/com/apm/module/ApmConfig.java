package com.apm.module;

public final class ApmConfig {
    private final String serviceName;
    private final String environment;
    private final String otlpEndpoint;
    private final String dashboardEndpoint;
    private final double sampleRatio;
    private final boolean tailFirstEnabled;
    private final double stableSampleRatio;
    private final double warningSampleRatio;
    private final double criticalSampleRatio;
    private final double riskWarningThreshold;
    private final double riskCriticalThreshold;

    private ApmConfig(Builder builder) {
        this.serviceName = builder.serviceName;
        this.environment = builder.environment;
        this.otlpEndpoint = builder.otlpEndpoint;
        this.dashboardEndpoint = builder.dashboardEndpoint;
        this.sampleRatio = builder.sampleRatio;
        this.tailFirstEnabled = builder.tailFirstEnabled;
        this.stableSampleRatio = builder.stableSampleRatio;
        this.warningSampleRatio = builder.warningSampleRatio;
        this.criticalSampleRatio = builder.criticalSampleRatio;
        this.riskWarningThreshold = builder.riskWarningThreshold;
        this.riskCriticalThreshold = builder.riskCriticalThreshold;
    }

    public static Builder builder() {
        return new Builder();
    }

    public String getServiceName() {
        return serviceName;
    }

    public String getEnvironment() {
        return environment;
    }

    public String getOtlpEndpoint() {
        return otlpEndpoint;
    }

    public String getDashboardEndpoint() {
        return dashboardEndpoint;
    }

    public double getSampleRatio() {
        return sampleRatio;
    }

    public boolean isTailFirstEnabled() {
        return tailFirstEnabled;
    }

    public double getStableSampleRatio() {
        return stableSampleRatio;
    }

    public double getWarningSampleRatio() {
        return warningSampleRatio;
    }

    public double getCriticalSampleRatio() {
        return criticalSampleRatio;
    }

    public double getRiskWarningThreshold() {
        return riskWarningThreshold;
    }

    public double getRiskCriticalThreshold() {
        return riskCriticalThreshold;
    }

    public static final class Builder {
        private String serviceName = "apm-service";
        private String environment = "dev";
        private String otlpEndpoint = "http://localhost:4317";
        private String dashboardEndpoint = "http://localhost:3000/ingest";
        private double sampleRatio = 1.0;
        private boolean tailFirstEnabled = true;
        private double stableSampleRatio = 0.01;
        private double warningSampleRatio = 0.1;
        private double criticalSampleRatio = 1.0;
        private double riskWarningThreshold = 0.3;
        private double riskCriticalThreshold = 0.6;

        private Builder() {
        }

        public Builder serviceName(String serviceName) {
            this.serviceName = serviceName;
            return this;
        }

        public Builder environment(String environment) {
            this.environment = environment;
            return this;
        }

        public Builder otlpEndpoint(String otlpEndpoint) {
            this.otlpEndpoint = otlpEndpoint;
            return this;
        }

        public Builder dashboardEndpoint(String dashboardEndpoint) {
            this.dashboardEndpoint = dashboardEndpoint;
            return this;
        }

        public Builder sampleRatio(double sampleRatio) {
            this.sampleRatio = sampleRatio;
            return this;
        }

        public Builder tailFirstEnabled(boolean tailFirstEnabled) {
            this.tailFirstEnabled = tailFirstEnabled;
            return this;
        }

        public Builder stableSampleRatio(double stableSampleRatio) {
            this.stableSampleRatio = stableSampleRatio;
            return this;
        }

        public Builder warningSampleRatio(double warningSampleRatio) {
            this.warningSampleRatio = warningSampleRatio;
            return this;
        }

        public Builder criticalSampleRatio(double criticalSampleRatio) {
            this.criticalSampleRatio = criticalSampleRatio;
            return this;
        }

        public Builder riskWarningThreshold(double riskWarningThreshold) {
            this.riskWarningThreshold = riskWarningThreshold;
            return this;
        }

        public Builder riskCriticalThreshold(double riskCriticalThreshold) {
            this.riskCriticalThreshold = riskCriticalThreshold;
            return this;
        }

        public ApmConfig build() {
            return new ApmConfig(this);
        }
    }
}
