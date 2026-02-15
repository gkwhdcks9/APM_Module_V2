# APM Module V1

실시간 애플리케이션 성능 모니터링(APM) 시스템. 분산 트레이싱, 메트릭 수집, 실시간 대시보드 시각화를 제공합니다.

## 📋 목차

1. [아키텍처](#아키텍처)
2. [설치 및 실행](#설치-및-실행)
3. [Java 수집 모듈](#java-수집-모듈)
4. [Dart/Flutter 통합](#dartflutter-통합)
5. [Node.js 대시보드 서버](#nodejs-대시보드-서버)
6. [데이터 포맷](#데이터-포맷)
7. [다른 프레임워크 연결](#다른-프레임워크-연결)
8. [설정 옵션](#설정-옵션)
9. [📖 상세 설정 가이드](CONFIGURATION.md)

---

## 아키텍처

```
┌─────────────────────────────────────────────────┐
│  앱/서비스 (Java, Dart, Python 등)              │
│  ├─ ApmModule (Java SDK)                        │
│  ├─ ApmSender (Dart HTTP)                       │
│  └─ 커스텀 HTTP 클라이언트                       │
└──────────────────┬──────────────────────────────┘
                   │ JSON POST
                   ▼
┌─────────────────────────────────────────────────┐
│  Node.js Dashboard Server                       │
│  ├─ /ingest (메트릭 수신)                       │
│  ├─ /sample (테스트 데이터 생성)                │
│  ├─ /event/:id (상세 조회)                      │
│  └─ WebSocket (실시간 브로드캐스트)             │
└──────────────────┬──────────────────────────────┘
                   │ WebSocket
                   ▼
┌─────────────────────────────────────────────────┐
│  브라우저 대시보드                               │
│  ├─ 실시간 차트 (Chart.js)                      │
│  ├─ 지표 시각화 (Percentile)                   │
│  └─ 상세 정보 패널                              │
└─────────────────────────────────────────────────┘
```

---

## 설치 및 실행

### 1. 프로젝트 구조

```
APM_Module_V1/
├── src/main/java/com/apm/module/     (Java SDK)
│   ├── ApmModule.java
│   ├── ApmConfig.java
│   ├── ApmEvent.java
│   └── TraceStep.java
├── pom.xml                             (Maven 설정)
├── dashboard/                          (Node.js 서버)
│   ├── server.js
│   ├── package.json
│   └── public/                         (웹 대시보드)
│       ├── index.html
│       ├── app.js
│       └── styles.css
└── README.md
```

### 2. 대시보드 서버 시작

```bash
cd dashboard
npm install
npm start
```

- 서버 주소: `http://localhost:3000`
- WebSocket: `ws://localhost:3000`

### 3. 앱에서 메트릭 전송

```bash
# Java: pom.xml에 의존성 추가
# Dart: HTTP 클라이언트 사용 (아래 참고)
```

---

## Java 수집 모듈

### 초기화

```java
ApmModule apm = ApmModule.init(
  ApmConfig.builder()
    .serviceName("my-service")
    .environment("dev")
    .otlpEndpoint("http://localhost:4317")
    .dashboardEndpoint("http://172.30.79.156:3000/ingest")
    .sampleRatio(1.0)
    .tailFirstEnabled(true)
    .stableSampleRatio(0.1)
    .warningSampleRatio(0.5)
    .criticalSampleRatio(1.0)
    .riskWarningThreshold(45.0)
    .riskCriticalThreshold(70.0)
    .build()
);
```

**설정 옵션:**
- `serviceName` (String): 서비스명 (예: "checkout-service")
- `environment` (String): 환경 (dev/staging/prod)
- `otlpEndpoint` (String): OpenTelemetry Collector 주소
- `dashboardEndpoint` (String): 대시보드 서버 `/ingest` 주소
- `sampleRatio` (double): 샘플링 비율 (0.0~1.0)
- `tailFirstEnabled` (boolean): Tail-first 상태 기반 샘플링 활성화
- `stableSampleRatio` (double): 안정 상태 샘플링 비율 (기본 0.1)
- `warningSampleRatio` (double): 경고 상태 샘플링 비율 (기본 0.5)
- `criticalSampleRatio` (double): 위험 상태 샘플링 비율 (기본 1.0)
- `riskWarningThreshold` (double): warning 진입 risk score 임계치
- `riskCriticalThreshold` (double): critical 진입 risk score 임계치

---

## Tail-first APM (State-first, Control-first)

기존 Tail-based처럼 모든 이벤트를 동일 강도로 저장한 뒤 사후 필터링하지 않고,
시스템 상태를 먼저 해석한 뒤 관측 강도를 동적으로 조절합니다.

### 상태 벡터(State Vector)

아래 지표를 결합해 `risk_score`를 계산합니다.

- `cpuPct`
- `queueDepth` / `queueLen`
- `dbPoolUsagePct` / `dbConnPoolPct`
- `retryRate` / `retryPct`
- `gcPauseMs` / `gcDelayMs`
- `durationMs`
- `errorCount`

### 제어 정책

- `risk_score < warningThreshold` → `stable` (기본 샘플링 10%)
- `warningThreshold <= risk_score < criticalThreshold` → `warning` (기본 50%)
- `risk_score >= criticalThreshold` → `critical` (기본 100%, 상세 추적)

안정 상태에서는 trace를 경량화(또는 비활성화)해서 비용을 줄이고,
위험 상태에서는 상세 trace를 적극 수집해 병목 분석 정확도를 높입니다.

### 대시보드/서버 노출 필드

`/ingest`로 들어온 이벤트에는 다음 제어 메타데이터가 추가됩니다.

- `riskScore`
- `riskReasons`
- `stateVector`
- `sampling.mode`, `sampling.sampleRate`, `sampling.detailedTrace`
- `tags.tailFirstMode`, `tags.tailFirstDetailed`, `tags.tailFirstRiskScore`

현재 Tail-first 서버 설정은 아래 엔드포인트로 조회할 수 있습니다.

```http
GET /tail-first/config
```

---

### 함수 API

#### `startEvent(name, attrs?) -> ApmEvent`

이벤트(트랜잭션)를 시작합니다.

```java
ApmEvent event = apm.startEvent("checkout", Map.of("userTier", "pro"));
```

**파라미터:**
- `name` (String): 이벤트 이름 (예: "checkout", "db_query")
- `attrs` (Map<String, String>): 선택 - 태그/메타데이터

**반환값:**
- `ApmEvent`: 진행 중인 이벤트 객체

---

#### `endEvent(event, status?)`

이벤트를 종료하고 상태를 기록합니다.

```java
apm.endEvent(event, StatusCode.OK);
```

**파라미터:**
- `event` (ApmEvent): 시작된 이벤트
- `status` (StatusCode): 선택 - OK / UNSET / ERROR

---

#### `addMetric(event, key, value)`

이벤트에 메트릭을 추가합니다.

```java
apm.addMetric(event, "durationMs", 234.5);
apm.addMetric(event, "requestCount", 5);
apm.addMetric(event, "errorCount", 0);
apm.addMetric(event, "cpuPct", 45.2);
apm.addMetric(event, "memMb", 512);
```

**표준 키:**
- `durationMs`: 응답시간 (ms)
- `requestCount`: 요청 수
- `errorCount`: 에러 수
- `apdex`: Apdex 점수 (0~1)
- `cpuPct`: CPU 사용률 (%)
- `memMb`: 메모리 사용량 (MB)

---

#### `addTraceStep(event, name, value)`

이벤트 내부에서 발생한 세부 단계를 기록합니다.

```java
apm.addTraceStep(event, "db.query", 120);
apm.addTraceStep(event, "payment.call", 85);
```

**파라미터:**
- `name` (String): 단계명
- `value` (double): 소요시간(ms) 또는 수치

---

#### `sendEvent(event) -> int`

이벤트를 대시보드로 전송합니다.

```java
int statusCode = apm.sendEvent(event);
```

**반환값:**
- HTTP 상태 코드 (200 = 성공)

---

#### `shutdown()`

모듈을 안전하게 종료하고 잔여 데이터를 플러시합니다.

```java
apm.shutdown();
```

---

### 사용 예제 (Java)

```java
public class CheckoutService {
  private final ApmModule apm;

  public CheckoutService(ApmModule apm) {
    this.apm = apm;
  }

  public void processCheckout(String orderId) throws Exception {
    ApmEvent event = apm.startEvent("checkout", Map.of("orderId", orderId));

    try {
      // 결제 처리
      apm.addTraceStep(event, "db.load_order", 50);
      apm.addTraceStep(event, "payment.authorize", 120);
      
      apm.addMetric(event, "durationMs", 170);
      apm.addMetric(event, "requestCount", 2);
      apm.addMetric(event, "errorCount", 0);
      
      apm.endEvent(event, StatusCode.OK);
    } catch (Exception e) {
      apm.addMetric(event, "errorCount", 1);
      apm.endEvent(event, StatusCode.ERROR);
      throw e;
    }

    apm.sendEvent(event);
  }
}
```

---

## Dart/Flutter 통합

### 기본 사용법

```dart
import 'dart:convert';
import 'dart:io';

class ApmSender {
  static const String _endpoint = 'http://10.0.2.2:3000/ingest'; // 블루스택용
  // 또는 'http://172.30.79.156:3000/ingest'; // 실기기/로컬

  static Future<void> sendEvent(Map<String, dynamic> payload) async {
    final client = HttpClient();
    try {
      final req = await client.postUrl(Uri.parse(_endpoint));
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode(payload));
      final res = await req.close();
      await res.drain();
    } catch (e) {
      debugPrint('ApmSender failed: $e');
    } finally {
      client.close();
    }
  }
}

// 사용 예
await ApmSender.sendEvent({
  'eventId': 'evt-${DateTime.now().microsecondsSinceEpoch}',
  'name': 'trip_record',
  'startTime': DateTime.now().millisecondsSinceEpoch - 5000,
  'endTime': DateTime.now().millisecondsSinceEpoch,
  'metrics': {
    'durationMs': 5000.0,
    'requestCount': 3,
    'errorCount': 0,
    'apdex': 0.92,
    'cpuPct': 35.5,
    'memMb': 420.0,
  },
  'trace': [
    {'name': 'location_tracking', 'value': 12.5},
    {'name': 'fare_calculation', 'value': 3.2},
  ],
  'tags': {
    'vehicleModel': 'Hyundai Avante',
  },
});
```

### 엔드포인트 설정

**블루스택/에뮬레이터:**
```dart
static const String _endpoint = 'http://10.0.2.2:3000/ingest';
```

**실기기 (같은 Wi-Fi):**
```dart
static const String _endpoint = 'http://{PC_IP}:3000/ingest';
// 예: 'http://192.168.1.100:3000/ingest'
```

---

## Node.js 대시보드 서버

### 주요 엔드포인트

#### `POST /ingest`

메트릭을 수신하고 처리합니다.

**요청 본문:**
```json
{
  "eventId": "unique-id",
  "name": "checkout",
  "startTime": 1705000000000,
  "endTime": 1705000001000,
  "metrics": {
    "durationMs": 1000,
    "requestCount": 5,
    "errorCount": 0,
    "apdex": 0.95,
    "cpuPct": 35,
    "memMb": 512
  },
  "trace": [
    {"name": "db.query", "value": 120},
    {"name": "payment.call", "value": 85}
  ],
  "tags": {
    "service": "checkout",
    "region": "us-west"
  }
}
```

**응답:**
```json
{
  "ok": true
}
```

---

#### `POST /sample?count=20`

테스트 데이터를 생성합니다.

**쿼리 파라미터:**
- `count` (number): 생성할 샘플 수 (기본: 20, 최대: 200)

**응답:**
```json
{
  "ok": true,
  "count": 20
}
```

---

#### `GET /event/:id`

특정 이벤트의 상세 정보를 조회합니다.

**응답:**
```json
{
  "ok": true,
  "data": {
    "eventId": "...",
    "metrics": {...},
    "trace": [...],
    "percentiles": {...},
    "severity": "warning",
    "outlierReasons": ["latency_p95"]
  }
}
```

---

### 내부 함수

#### `updateHistogram(key, value)`

메트릭 히스토리를 갱신합니다. 최대 500개 데이터 유지.

#### `toPercentile(key, value) -> number`

값의 퍼센타일을 계산합니다 (0~100).

#### `isOutlier(percentile, threshold=90) -> boolean`

퍼센타일이 임계치 이상인지 판단합니다.

#### `broadcastPoint(point)`

WebSocket을 통해 모든 클라이언트에 포인트를 브로드캐스트합니다.

---

## 데이터 포맷

### 이벤트 페이로드

```
eventId (string)          - 고유 식별자
name (string)             - 이벤트 이름
startTime (number)        - 시작 시각 (Unix ms)
endTime (number)          - 종료 시각 (Unix ms)

metrics (object)
├─ durationMs (number)    - 소요시간
├─ requestCount (number)  - 요청 수
├─ errorCount (number)    - 에러 수
├─ apdex (number)         - Apdex 점수
├─ cpuPct (number)        - CPU 사용률
└─ memMb (number)         - 메모리 사용량

trace (array)
├─ [0]
│  ├─ name (string)
│  └─ value (number)
└─ ...

tags (object)             - 선택 태그
percentiles (object)      - 서버 계산 (자동)
severity (string)         - "normal" | "warning" | "critical"
outlierReasons (array)    - 이상 징후 목록
```

---

## 다른 프레임워크 연결

### Python

```python
import requests
import json
from datetime import datetime

def send_apm_event(
    event_id, name, duration_ms, request_count=1, 
    error_count=0, cpu_pct=0, mem_mb=0
):
    payload = {
        "eventId": event_id,
        "name": name,
        "startTime": int((datetime.now().timestamp() - duration_ms/1000) * 1000),
        "endTime": int(datetime.now().timestamp() * 1000),
        "metrics": {
            "durationMs": duration_ms,
            "requestCount": request_count,
            "errorCount": error_count,
            "apdex": 0.9,
            "cpuPct": cpu_pct,
            "memMb": mem_mb,
        },
        "trace": [{"name": "handler", "value": duration_ms * 0.7}],
        "tags": {"framework": "django"}
    }
    
    response = requests.post(
        "http://localhost:3000/ingest",
        json=payload,
        timeout=5
    )
    return response.status_code == 200

# 사용 예
send_apm_event(
    event_id="py-001",
    name="api_request",
    duration_ms=245,
    request_count=1,
    error_count=0,
    cpu_pct=25,
    mem_mb=128
)
```

### Node.js (Express)

```javascript
const axios = require('axios');

async function sendApmEvent(eventData) {
  try {
    const response = await axios.post(
      'http://localhost:3000/ingest',
      eventData,
      { timeout: 5000 }
    );
    return response.status === 200;
  } catch (error) {
    console.error('APM send failed:', error.message);
    return false;
  }
}

// Express 미들웨어
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    await sendApmEvent({
      eventId: `${req.id}`,
      name: `${req.method} ${req.path}`,
      startTime: startTime,
      endTime: Date.now(),
      metrics: {
        durationMs: duration,
        requestCount: 1,
        errorCount: res.statusCode >= 400 ? 1 : 0,
        apdex: duration < 300 ? 1 : 0.5,
        cpuPct: 0,
        memMb: 0,
      },
      trace: [{ name: 'route_handler', value: duration }],
      tags: { method: req.method, path: req.path }
    });
  });
  
  next();
});
```

### Go

```go
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"
)

func SendApmEvent(eventID, name string, durationMs float64) error {
	payload := map[string]interface{}{
		"eventId": eventID,
		"name": name,
		"startTime": time.Now().Add(-time.Duration(int64(durationMs))*time.Millisecond).UnixMilli(),
		"endTime": time.Now().UnixMilli(),
		"metrics": map[string]interface{}{
			"durationMs": durationMs,
			"requestCount": 1,
			"errorCount": 0,
			"apdex": 0.9,
			"cpuPct": 0,
			"memMb": 0,
		},
		"trace": []map[string]interface{}{
			{"name": "handler", "value": durationMs * 0.8},
		},
		"tags": map[string]string{"framework": "go"},
	}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(
		"http://localhost:3000/ingest",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
```

---

## 설정 옵션

### 서버 설정

**서버 리스닝 포트 변경:**

[dashboard/server.js](dashboard/server.js)의 마지막 줄:

```javascript
server.listen(3000, () => {  // 포트 번호 변경
  warmUpHistograms(500);
  console.log("Dashboard server listening on http://localhost:3000");
});
```

**워밍업 표본 수 조정:**

```javascript
warmUpHistograms(500);  // 숫자 변경 (기본값: 500)
```

---

### Outlier 기준 조정

[dashboard/server.js](dashboard/server.js)의 `processPayload` 함수:

**Critical 임계치:**
- `durationPercentile >= 99` → `>= 95` 로 변경 등

**Warning 임계치:**
- `durationPercentile >= 95` → `>= 90` 으로 변경 등

**Error 기준:**
- `errorCount >= 1` → `>= 5` 로 변경 가능

---

### 차트 범위 조정

[dashboard/public/app.js](dashboard/public/app.js)의 차트 Y축:

```javascript
y: {
  min: 0,
  max: 100,  // 퍼센타일 범위 (0~100)
  ...
}
```

---

## 성능 특성

| 항목 | 기본값 |
|------|--------|
| 메트릭 히스토리 | 500개 |
| 차트 포인트 표시 | 400개 |
| 워밍업 표본 | 500개 |
| WebSocket 배치 | 즉시 |
| 타임아웃 | 5초 |

---

## FAQ

**Q: 블루스택에서 `Can't connect` 에러가 나요**  
A: Dart의 `_endpoint`를 `http://10.0.2.2:3000/ingest`로 설정하세요.

**Q: 차트에 점이 너무 많이 찍혀요**  
A: `app.js`의 `MAX_POINTS = 400`을 줄이거나, 서버에서 샘플링 비율을 낮추세요.

**Q: 초기화할 때 표본이 없어서 p100이 나와요**  
A: 서버 시작 시 자동으로 500개 샘플을 생성합니다. 잠시 대기하세요.

**Q: 에러 rate를 커스텀하고 싶어요**  
A: `server.js`의 `Math.random() < 0.05 ? 1 : 0` 부분을 수정하세요. (0.05 = 5%)

---

## 📖 상세 설정 가이드

더 자세한 설정 방법은 [CONFIGURATION.md](CONFIGURATION.md)를 참고하세요:
- 각 파일의 수정 가능한 변수들
- 함수별 파라미터 상세 설명
- 네트워크 설정 (로컬/원격)
- 오류 처리 및 문제해결
- 엔드포인트 설정 체크리스트

---

## 개발 히스토리 & 주요 개선 사항

### 2026.02.12 - Dashboard UX 대대적 개선

#### 🎯 주요 기능 추가

**1. Summary 섹션 추가**
- 기존의 "Outlier Reasons" 배지 섹션 제거
- 대신 사용자 친화적인 Summary로 대체
- severity가 warning/critical인 이유를 명확한 메시지로 표시
  - Duration이 p99/p95: "⚠️ Duration is extremely high/high"
  - Error 발생: "❌ Errors detected (N errors)"
  - CPU/Memory p99/p95: "🔥/💾 usage is extremely high/high"
- Background color로 severity 구분 (critical: 빨강, warning: 노랑)

**2. Recommendations 섹션 추가**
- AI 기반 개선 방안 자동 제시
- Duration이 높을 때 다른 outlier 존재 여부에 따라 다른 제안:
  - CPU 높음 → "Optimize CPU-intensive operations"
  - Memory 높음 → "Check for memory leaks"
  - Error 있음 → "Fix the errors first (retry logic)"
  - 다른 outlier 없음 → 전반적인 최적화 제안
    - Database query optimization
    - Async/await patterns
    - External API parallelization
    - Compression for large transfers
- 초록색 배경으로 긍정적 느낌

**3. 레이아웃 재설계**
- Event Details를 2열 구조로 변경:
  - 좌측: Event Header, Summary, Recommendations
  - 우측: Time, Severity, Performance, Requests, Data
- 그래프와 Event Details를 좌우로 배치하여 한 화면에서 조회 가능
  - 좌측(55%): 차트
  - 우측(45%): 이벤트 상세
- 스크롤 없이 전체 정보 파악 가능

**4. UI/UX 개선**
- 모든 섹션에 카드 스타일 적용 (배경색 + 둥근 모서리)
- 그림자 효과로 깊이감 추가
- Event Details에 커스텀 스크롤바 (초록색 accent)
- 모든 텍스트에 명시적 color 지정으로 가독성 향상
- 반응형 디자인: 화면 작으면 세로로 자동 정렬

#### 🐛 버그 수정

**errorCount percentile 해석 오류 수정**
- 문제: errorCount = 0일 때 p96으로 표시되어 혼란스러움
  - 히스토그램 대부분이 0이므로, percentile 계산 시 높은 값이 나옴
  - "에러가 없는데 왜 높은 percentile?" 이라는 반직관적 결과
- 해결: errorCount는 "낮을수록 좋은" 지표이므로 `100 - percentile`로 역전
  - 기존: errorCount 0 → p96 (혼란)
  - 수정: errorCount 0 → p4 (직관적)
- 변경 파일: `dashboard/server.js` - processPayload 함수

#### 📊 시각화 개선

**Y축 범위 조정**
- 기존: 0~100
- 변경: -5~105
- 이유: percentile 값들이 더 넓은 범위에서 표시되어 패턴 명확화
- 요청에 따라 -20~120 → -5~105로 미세 조정

#### 🎨 스타일링 개선
- Event Header: 그라디언트 배경 + 그림자 효과
- Summary/Recommendations: 선명한 border + box-shadow
- 섹션 제목: accent 컬러 + 대문자 + letter-spacing
- Trace Steps: 배경 추가로 다른 섹션과 일관성 유지

#### 📝 코드 구조 개선
- `renderOutlierReasons()` 함수 제거
- `renderSummary()` 함수 추가 (severity 기반 메시지 생성)
- `renderRecommendations()` 함수 추가 (문제 분석 + 해결책 제시)
- `renderGroup()` 함수에 카드 스타일 통합

#### 🔧 기술적 개선
- CSS Flexbox 활용한 반응형 레이아웃
- CSS custom properties 활용
- WebKit scrollbar 커스터마이징
- min-width 설정으로 반응형 breakpoint 명확화

---

## 라이선스

MIT

---

## 지원

문제나 질문이 있으면 GitHub Issues를 통해 보고해 주세요.
