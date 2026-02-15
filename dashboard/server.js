import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const serverStart = Date.now();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const MAX_HISTORY = 500;
const histograms = new Map();
const events = new Map();
const tailFirstConfig = {
  stableSampleRate: 0.1,
  warningSampleRate: 0.5,
  criticalSampleRate: 1.0,
  warningThreshold: 45,
  criticalThreshold: 70
};

const predictionConfig = {
  windowSec: 30,
  p99ThresholdMs: 1500,
  sloThresholdMs: 1500,
  strictConsecutiveRequired: 2
};

const tailFirstStats = {
  total: 0,
  modeCounts: {
    stable: 0,
    warning: 0,
    critical: 0
  },
  detailedCaptured: 0,
  riskSum: 0,
  minRisk: null,
  maxRisk: null
};

const predictionStats = {
  nextPredictionId: 1,
  totalPredictions: 0,
  earlySuccessCount: 0,
  earlyFailCount: 0,
  strictSuccessCount: 0,
  strictFailCount: 0,
  earlyRecords: [],
  strictRecords: [],
  pendingPredictions: [],
  lastMode: "stable"
};

const PREDICTION_HISTORY_LIMIT = 300;

function pushLimitedRecord(records, record, limit = PREDICTION_HISTORY_LIMIT) {
  records.push(record);
  if (records.length > limit) {
    records.shift();
  }
}

function resetPredictionStats() {
  predictionStats.nextPredictionId = 1;
  predictionStats.totalPredictions = 0;
  predictionStats.earlySuccessCount = 0;
  predictionStats.earlyFailCount = 0;
  predictionStats.strictSuccessCount = 0;
  predictionStats.strictFailCount = 0;
  predictionStats.earlyRecords = [];
  predictionStats.strictRecords = [];
  predictionStats.pendingPredictions = [];
  predictionStats.lastMode = "stable";
}

function snapshotPredictionStats() {
  const earlyResolved = predictionStats.earlySuccessCount + predictionStats.earlyFailCount;
  const strictResolved = predictionStats.strictSuccessCount + predictionStats.strictFailCount;
  const earlySuccessRate = earlyResolved > 0
    ? Number((predictionStats.earlySuccessCount / earlyResolved).toFixed(4))
    : null;
  const strictSuccessRate = strictResolved > 0
    ? Number((predictionStats.strictSuccessCount / strictResolved).toFixed(4))
    : null;

  return {
    windowSec: predictionConfig.windowSec,
    p99ThresholdMs: predictionConfig.p99ThresholdMs,
    sloThresholdMs: predictionConfig.sloThresholdMs,
    strictConsecutiveRequired: predictionConfig.strictConsecutiveRequired,
    totalPredictions: predictionStats.totalPredictions,
    earlySuccessCount: predictionStats.earlySuccessCount,
    earlyFailCount: predictionStats.earlyFailCount,
    strictSuccessCount: predictionStats.strictSuccessCount,
    strictFailCount: predictionStats.strictFailCount,
    pendingCount: predictionStats.pendingPredictions.length,
    earlyResolvedCount: earlyResolved,
    strictResolvedCount: strictResolved,
    earlySuccessRate,
    strictSuccessRate,
    successRate: earlySuccessRate
  };
}

function resetTailFirstStats() {
  tailFirstStats.total = 0;
  tailFirstStats.modeCounts.stable = 0;
  tailFirstStats.modeCounts.warning = 0;
  tailFirstStats.modeCounts.critical = 0;
  tailFirstStats.detailedCaptured = 0;
  tailFirstStats.riskSum = 0;
  tailFirstStats.minRisk = null;
  tailFirstStats.maxRisk = null;
}

function snapshotTailFirstStats() {
  const total = tailFirstStats.total;
  const avgRisk = total > 0 ? Number((tailFirstStats.riskSum / total).toFixed(2)) : 0;
  return {
    total,
    modeCounts: { ...tailFirstStats.modeCounts },
    modeRatios: {
      stable: total > 0 ? Number((tailFirstStats.modeCounts.stable / total).toFixed(4)) : 0,
      warning: total > 0 ? Number((tailFirstStats.modeCounts.warning / total).toFixed(4)) : 0,
      critical: total > 0 ? Number((tailFirstStats.modeCounts.critical / total).toFixed(4)) : 0
    },
    detailedCaptureRatio: total > 0 ? Number((tailFirstStats.detailedCaptured / total).toFixed(4)) : 0,
    avgRisk,
    minRisk: tailFirstStats.minRisk,
    maxRisk: tailFirstStats.maxRisk,
    config: { ...tailFirstConfig }
  };
}

const RISK_WEIGHTS = {
  queuePressure: 0.35,
  dbWaitRatio: 0.25,
  lockWait: 0.15,
  retryRate: 0.10,
  gcRatio: 0.10,
  cpuUtil: 0.05
};

function ensureHistogram(key) {
  if (!histograms.has(key)) {
    histograms.set(key, []);
  }
  return histograms.get(key);
}

function updateHistogram(key, value) {
  const hist = ensureHistogram(key);
  hist.push(value);
  if (hist.length > MAX_HISTORY) {
    hist.shift();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value, min, max) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  if (max <= min) {
    return 0;
  }
  return clamp((value - min) / (max - min), 0, 1);
}

function pickMetric(metrics, ...keys) {
  for (const key of keys) {
    if (typeof metrics[key] === "number" && Number.isFinite(metrics[key])) {
      return metrics[key];
    }
  }
  return null;
}

function computeRiskScore(metrics, percentiles = {}) {
  const queuePressureRaw = pickMetric(metrics, "queuePressure", "queue_pressure");
  const queueDepthRaw = pickMetric(metrics, "queueDepth", "queueLen");
  const dbWaitRatioRaw = pickMetric(metrics, "dbWaitRatio", "db_wait_ratio", "dbPoolUsagePct", "dbConnPoolPct");
  const lockWaitRaw = pickMetric(metrics, "lockWait", "lock_wait", "lockWaitRatio", "lock_wait_ratio");
  const retryRateRaw = pickMetric(metrics, "retryRate", "retry_rate", "retryPct");
  const gcRatioRaw = pickMetric(metrics, "gcRatio", "gc_ratio", "gcPauseRatio", "gc_pause_ratio");
  const cpuUtilRaw = pickMetric(metrics, "cpuUtil", "cpu_util", "cpuPct");

  const toPercentScale = (value) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return null;
    }
    return value <= 1 ? value * 100 : value;
  };

  const queuePressure = queuePressureRaw !== null
    ? toPercentScale(queuePressureRaw)
    : (queueDepthRaw === null ? null : normalize(queueDepthRaw, 10, 300) * 100);
  const dbWaitRatio = toPercentScale(dbWaitRatioRaw);
  const lockWait = toPercentScale(lockWaitRaw);
  const retryRate = toPercentScale(retryRateRaw);
  const gcRatio = toPercentScale(gcRatioRaw);
  const cpuUtil = toPercentScale(cpuUtilRaw);

  const components = {
    queuePressure: queuePressure === null ? 0 : normalize(queuePressure, 0, 100),
    dbWaitRatio: dbWaitRatio === null ? 0 : normalize(dbWaitRatio, 0, 100),
    lockWait: lockWait === null ? 0 : normalize(lockWait, 0, 100),
    retryRate: retryRate === null ? 0 : normalize(retryRate, 0, 100),
    gcRatio: gcRatio === null ? 0 : normalize(gcRatio, 0, 100),
    cpuUtil: cpuUtil === null ? 0 : normalize(cpuUtil, 0, 100)
  };

  const weighted = Object.entries(RISK_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + (components[key] || 0) * weight;
  }, 0);

  const riskScore = Number((weighted * 100).toFixed(2));
  const reasons = [];

  if (components.queuePressure >= 0.8) reasons.push("queue_pressure");
  if (components.dbWaitRatio >= 0.8) reasons.push("db_wait_ratio");
  if (components.lockWait >= 0.8) reasons.push("lock_wait");
  if (components.retryRate >= 0.8) reasons.push("retry_spike");
  if (components.gcRatio >= 0.8) reasons.push("gc_ratio");
  if (components.cpuUtil >= 0.8) reasons.push("cpu_util");

  return {
    score: riskScore,
    reasons,
    stateVector: {
      queuePressure,
      dbWaitRatio,
      lockWait,
      retryRate,
      gcRatio,
      cpuUtil
    }
  };
}

function decideSamplingMode(riskScore) {
  if (riskScore >= tailFirstConfig.criticalThreshold) {
    return {
      mode: "critical",
      sampleRate: tailFirstConfig.criticalSampleRate
    };
  }
  if (riskScore >= tailFirstConfig.warningThreshold) {
    return {
      mode: "warning",
      sampleRate: tailFirstConfig.warningSampleRate
    };
  }
  return {
    mode: "stable",
    sampleRate: tailFirstConfig.stableSampleRate
  };
}

function toPercentile(key, value) {
  const hist = ensureHistogram(key);
  if (hist.length === 0) {
    return 50;
  }
  const sorted = [...hist].sort((a, b) => a - b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= value) {
    idx += 1;
  }
  const pct = Math.round((idx / sorted.length) * 100);
  return Math.max(0, Math.min(100, pct));
}

function isOutlier(percentile, threshold = 90) {
  return percentile >= threshold;
}

function broadcastPoint(point) {
  const message = JSON.stringify({ type: "point", data: point });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function broadcastPredictionStats() {
  const message = JSON.stringify({ type: "prediction_stats", data: snapshotPredictionStats() });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function processPayload(payload, options = {}) {
  const shouldBroadcast = options.broadcast !== false;
  const predictionEligible = (payload.tags?.source || "") !== "warmup";

  const metrics = payload.metrics || {};
  const ts = payload.endTime || Date.now();
  const percentiles = payload.percentiles || {};

  const durationValue = typeof metrics.durationMs === "number" ? metrics.durationMs : null;
  let durationPercentile = null;
  const outlierReasons = [];
  let severity = "normal";

  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value !== "number") {
      continue;
    }
    updateHistogram(key, value);
    let percentile = toPercentile(key, value);
    
    // errorCount는 낮을수록 좋으므로 percentile 역전
    if (key === "errorCount") {
      percentile = 100 - percentile;
    }
    
    percentiles[key] = percentile;
    if (key === "durationMs") {
      durationPercentile = percentile;
    }
  }

  payload.percentiles = percentiles;

  const risk = computeRiskScore(metrics, percentiles);
  const sampling = decideSamplingMode(risk.score);
  const captureDetailed = sampling.mode !== "stable" || Math.random() <= sampling.sampleRate;

  if (predictionEligible) {
    const transitionedToRisk = predictionStats.lastMode === "stable" && sampling.mode !== "stable";
    if (transitionedToRisk) {
      predictionStats.totalPredictions += 1;
      const predictionId = predictionStats.nextPredictionId;
      predictionStats.nextPredictionId += 1;

      predictionStats.pendingPredictions.push({
        id: predictionId,
        createdAt: ts,
        expiresAt: ts + (predictionConfig.windowSec * 1000),
        riskScoreAtPrediction: risk.score,
        modeAtPrediction: sampling.mode,
        predictionEventId: payload.eventId,
        predictionEventName: payload.name || "event",
        earlyMatched: false,
        strictMatched: false,
        strictStreak: 0
      });
    }
    predictionStats.lastMode = sampling.mode;
  }

  payload.riskScore = risk.score;
  payload.riskReasons = risk.reasons;
  payload.stateVector = risk.stateVector;
  payload.sampling = {
    mode: sampling.mode,
    sampleRate: sampling.sampleRate,
    detailedTrace: captureDetailed
  };

  payload.tags = {
    ...(payload.tags || {}),
    tailFirstMode: sampling.mode,
    tailFirstDetailed: String(captureDetailed),
    tailFirstRiskScore: String(risk.score)
  };

  tailFirstStats.total += 1;
  if (sampling.mode === "critical") {
    tailFirstStats.modeCounts.critical += 1;
  } else if (sampling.mode === "warning") {
    tailFirstStats.modeCounts.warning += 1;
  } else {
    tailFirstStats.modeCounts.stable += 1;
  }
  if (captureDetailed) {
    tailFirstStats.detailedCaptured += 1;
  }
  tailFirstStats.riskSum += risk.score;
  if (tailFirstStats.minRisk === null || risk.score < tailFirstStats.minRisk) {
    tailFirstStats.minRisk = risk.score;
  }
  if (tailFirstStats.maxRisk === null || risk.score > tailFirstStats.maxRisk) {
    tailFirstStats.maxRisk = risk.score;
  }

  const p99Breach = durationValue !== null
    && durationPercentile !== null
    && durationPercentile >= 99
    && durationValue > predictionConfig.p99ThresholdMs;
  const sloBreach = durationValue !== null && durationValue > predictionConfig.sloThresholdMs;
  const earlyBreachDetected = p99Breach || sloBreach;
  const strictBreachDetected = p99Breach && sloBreach;

  if (predictionEligible && predictionStats.pendingPredictions.length > 0) {
    const remaining = [];
    for (const prediction of predictionStats.pendingPredictions) {
      if (!prediction.earlyMatched && earlyBreachDetected) {
        prediction.earlyMatched = true;
        predictionStats.earlySuccessCount += 1;
        pushLimitedRecord(predictionStats.earlyRecords, {
          predictionId: prediction.id,
          status: "success",
          createdAt: prediction.createdAt,
          expiresAt: prediction.expiresAt,
          resolvedAt: ts,
          modeAtPrediction: prediction.modeAtPrediction,
          riskScoreAtPrediction: prediction.riskScoreAtPrediction,
          predictionEventId: prediction.predictionEventId,
          predictionEventName: prediction.predictionEventName,
          matchedEventId: payload.eventId,
          matchedEventName: payload.name || "event",
          reason: p99Breach && sloBreach ? "p99_and_slo" : (p99Breach ? "p99" : "slo")
        });
      }

      if (!prediction.strictMatched) {
        if (strictBreachDetected) {
          prediction.strictStreak += 1;
        } else {
          prediction.strictStreak = 0;
        }
        if (prediction.strictStreak >= predictionConfig.strictConsecutiveRequired) {
          prediction.strictMatched = true;
          predictionStats.strictSuccessCount += 1;
          pushLimitedRecord(predictionStats.strictRecords, {
            predictionId: prediction.id,
            status: "success",
            createdAt: prediction.createdAt,
            expiresAt: prediction.expiresAt,
            resolvedAt: ts,
            modeAtPrediction: prediction.modeAtPrediction,
            riskScoreAtPrediction: prediction.riskScoreAtPrediction,
            predictionEventId: prediction.predictionEventId,
            predictionEventName: prediction.predictionEventName,
            matchedEventId: payload.eventId,
            matchedEventName: payload.name || "event",
            reason: "p99_and_slo_consecutive"
          });
        }
      }

      if (ts > prediction.expiresAt) {
        if (!prediction.earlyMatched) {
          predictionStats.earlyFailCount += 1;
          pushLimitedRecord(predictionStats.earlyRecords, {
            predictionId: prediction.id,
            status: "fail",
            createdAt: prediction.createdAt,
            expiresAt: prediction.expiresAt,
            resolvedAt: ts,
            modeAtPrediction: prediction.modeAtPrediction,
            riskScoreAtPrediction: prediction.riskScoreAtPrediction,
            predictionEventId: prediction.predictionEventId,
            predictionEventName: prediction.predictionEventName,
            matchedEventId: null,
            matchedEventName: null,
            reason: "timeout"
          });
        }
        if (!prediction.strictMatched) {
          predictionStats.strictFailCount += 1;
          pushLimitedRecord(predictionStats.strictRecords, {
            predictionId: prediction.id,
            status: "fail",
            createdAt: prediction.createdAt,
            expiresAt: prediction.expiresAt,
            resolvedAt: ts,
            modeAtPrediction: prediction.modeAtPrediction,
            riskScoreAtPrediction: prediction.riskScoreAtPrediction,
            predictionEventId: prediction.predictionEventId,
            predictionEventName: prediction.predictionEventName,
            matchedEventId: null,
            matchedEventName: null,
            reason: "timeout"
          });
        }
        continue;
      }
      if (prediction.earlyMatched && prediction.strictMatched) {
        continue;
      }
      remaining.push(prediction);
    }
    predictionStats.pendingPredictions = remaining;
  }

  if (!captureDetailed) {
    payload.trace = [];
    const lightMetrics = {};
    for (const key of ["durationMs", "requestCount", "errorCount", "apdex"]) {
      if (typeof metrics[key] === "number") {
        lightMetrics[key] = metrics[key];
      }
    }
    payload.metrics = lightMetrics;
  }

  events.set(payload.eventId, payload);

  if (durationPercentile !== null) {
    if (durationPercentile >= 99) {
      outlierReasons.push("latency_p99");
      severity = "critical";
    } else if (durationPercentile >= 95) {
      outlierReasons.push("latency_p95");
      if (severity === "normal") {
        severity = "warning";
      }
    }
  }

  const errorCount = typeof metrics.errorCount === "number" ? metrics.errorCount : 0;
  if (errorCount >= 1) {
    outlierReasons.push("error_count_critical");
    severity = "critical";
  }

  const cpuPct = typeof metrics.cpuPct === "number" ? metrics.cpuPct : null;
  const cpuPercentile = typeof percentiles.cpuPct === "number" ? percentiles.cpuPct : null;
  if (cpuPct !== null && cpuPercentile !== null) {
    if (cpuPercentile >= 99) {
      outlierReasons.push("cpu_p99");
      severity = "critical";
    } else if (cpuPercentile >= 95) {
      outlierReasons.push("cpu_p95");
      if (severity === "normal") {
        severity = "warning";
      }
    }
  }

  const memMb = typeof metrics.memMb === "number" ? metrics.memMb : null;
  const memPercentile = typeof percentiles.memMb === "number" ? percentiles.memMb : null;
  if (memMb !== null && memPercentile !== null) {
    if (memPercentile >= 99) {
      outlierReasons.push("mem_p99");
      severity = "critical";
    } else if (memPercentile >= 95) {
      outlierReasons.push("mem_p95");
      if (severity === "normal") {
        severity = "warning";
      }
    }
  }

  const reqCount = typeof metrics.requestCount === "number" ? metrics.requestCount : null;
  const reqPercentile = typeof percentiles.requestCount === "number" ? percentiles.requestCount : null;
  if (reqCount !== null && reqPercentile !== null) {
    if (reqPercentile >= 99) {
      outlierReasons.push("req_p99");
      if (severity === "normal") {
        severity = "warning";
      }
    }
  }

  payload.outlierReasons = outlierReasons;
  payload.severity = severity;

  if (durationValue !== null && shouldBroadcast && captureDetailed) {
    const point = {
      eventId: payload.eventId,
      name: payload.name || "event",
      metricKey: "durationMs",
      value: durationValue,
      percentile: durationPercentile ?? 50,
      ts,
      outlier: outlierReasons.length > 0,
      outlierReasons,
      severity,
      riskScore: risk.score,
      samplingMode: sampling.mode
    };
    broadcastPoint(point);
  }

  if (shouldBroadcast) {
    broadcastPredictionStats();
  }
}

function buildSamplePayload(now, index, source) {
  return {
    eventId: `${source}-${now}-${index}-${Math.floor(Math.random() * 10000)}`,
    name: "sample_http",
    startTime: now - Math.floor(Math.random() * 60000),
    endTime: now,
    metrics: {
      durationMs: 50 + Math.random() * 1950,
      requestCount: Math.floor(1 + Math.random() * 20),
      errorCount: Math.floor(Math.random() * 20) === 0 ? 1 : 0,
      apdex: Math.max(0, Math.min(1, 0.6 + Math.random() * 0.4)),
      queuePressure: Math.random() * 100,
      dbWaitRatio: Math.random() * 100,
      lockWait: Math.random() * 100,
      retryRate: Math.random() * 100,
      gcRatio: Math.random() * 100,
      cpuUtil: 5 + Math.random() * 90,
      cpuPct: 5 + Math.random() * 90,
      memMb: 100 + Math.random() * 900
    },
    trace: [
      { name: "handler", value: Math.random() * 50 },
      { name: "db.query", value: Math.random() * 120 }
    ],
    tags: { source }
  };
}

app.get("/tail-first/config", (_req, res) => {
  res.json({ ok: true, data: tailFirstConfig });
});

app.get("/tail-first/stats", (_req, res) => {
  res.json({ ok: true, data: snapshotTailFirstStats() });
});

app.post("/tail-first/stats/reset", (_req, res) => {
  resetTailFirstStats();
  res.json({ ok: true, data: snapshotTailFirstStats() });
});

app.get("/prediction/stats", (_req, res) => {
  res.json({ ok: true, data: snapshotPredictionStats() });
});

app.post("/prediction/stats/reset", (_req, res) => {
  resetPredictionStats();
  res.json({ ok: true, data: snapshotPredictionStats() });
});

app.get("/prediction/details", (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 30;

  const now = Date.now();
  const early = predictionStats.earlyRecords.slice(-limit).reverse();
  const strict = predictionStats.strictRecords.slice(-limit).reverse();
  const pending = predictionStats.pendingPredictions.slice(-limit).reverse().map((prediction) => ({
    predictionId: prediction.id,
    createdAt: prediction.createdAt,
    expiresAt: prediction.expiresAt,
    modeAtPrediction: prediction.modeAtPrediction,
    riskScoreAtPrediction: prediction.riskScoreAtPrediction,
    predictionEventId: prediction.predictionEventId,
    predictionEventName: prediction.predictionEventName,
    remainingSec: Math.max(0, Math.floor((prediction.expiresAt - now) / 1000))
  }));

  res.json({
    ok: true,
    data: {
      limit,
      early,
      strict,
      pending
    }
  });
});

app.get("/prediction/config", (_req, res) => {
  res.json({ ok: true, data: { ...predictionConfig } });
});

app.post("/prediction/config", (req, res) => {
  const body = req.body || {};
  const windowSec = Number(body.windowSec);
  const p99ThresholdMs = Number(body.p99ThresholdMs);
  const sloThresholdMs = Number(body.sloThresholdMs);
  const strictConsecutiveRequired = body.strictConsecutiveRequired === undefined
    ? predictionConfig.strictConsecutiveRequired
    : Number(body.strictConsecutiveRequired);

  if (
    !Number.isFinite(windowSec) || windowSec <= 0 ||
    !Number.isFinite(p99ThresholdMs) || p99ThresholdMs <= 0 ||
    !Number.isFinite(sloThresholdMs) || sloThresholdMs <= 0 ||
    !Number.isFinite(strictConsecutiveRequired) || strictConsecutiveRequired < 1
  ) {
    res.status(400).json({ ok: false, error: "invalid prediction config" });
    return;
  }

  predictionConfig.windowSec = windowSec;
  predictionConfig.p99ThresholdMs = p99ThresholdMs;
  predictionConfig.sloThresholdMs = sloThresholdMs;
  predictionConfig.strictConsecutiveRequired = Math.floor(strictConsecutiveRequired);

  resetPredictionStats();
  broadcastPredictionStats();

  res.json({ ok: true, data: { ...predictionConfig } });
});

function warmUpHistograms(count = 500) {
  const now = Date.now();
  for (let i = 0; i < count; i += 1) {
    const payload = buildSamplePayload(now, i, "warmup");
    processPayload(payload, { broadcast: false });
  }
}

app.post("/ingest", (req, res) => {
  const payload = req.body;
  if (!payload || !payload.eventId) {
    res.status(400).json({ ok: false, error: "invalid payload" });
    return;
  }

  processPayload(payload);

  res.json({ ok: true });
});

app.get("/ingest", (_req, res) => {
  res.status(200).json({ ok: true, message: "Use POST /ingest with JSON payload." });
});

app.get("/event/:id", (req, res) => {
  const event = events.get(req.params.id);
  if (!event) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }
  res.json({
    ok: true,
    data: {
      ...event,
      risk_score: typeof event.riskScore === "number" ? event.riskScore : null
    }
  });
});

app.post("/sample", (req, res) => {
  const count = Math.min(Number(req.query.count) || 20, 200);
  const now = Date.now();
  for (let i = 0; i < count; i += 1) {
    const payload = buildSamplePayload(now, i, "sample");
    processPayload(payload, { broadcast: true });
  }
  res.json({ ok: true, count });
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", data: { status: "connected", serverStart } }));
  ws.send(JSON.stringify({ type: "prediction_stats", data: snapshotPredictionStats() }));
});

server.listen(3000, () => {
  warmUpHistograms(500);
  resetPredictionStats();
  console.log("Dashboard server listening on http://localhost:3000");
});
