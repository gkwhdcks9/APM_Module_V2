# APM Module - 사용자 정의 설정 가이드

이 문서는 APM 모듈을 자신의 로컬 환경에 맞게 설정하고 사용하는 방법을 상세히 설명합니다.

---

## 📍 목차

1. [Node.js 대시보드 설정](#nodejs-대시보드-설정)
2. [Java 앱 설정](#java-앱-설정)
3. [Dart/Flutter 설정](#dartflutter-설정)
4. [네트워크 설정](#네트워크-설정)
5. [함수별 상세 가이드](#함수별-상세-가이드)
6. [오류 처리](#오류-처리)
7. [주의사항](#주의사항)

---

## Node.js 대시보드 설정

### 포트 번호 변경

**파일:** `dashboard/server.js`  
**라인:** 마지막 줄 (약 240줄)

```javascript
// ✅ 수정 전
server.listen(3000, () => {
  warmUpHistograms(500);
  console.log("Dashboard server listening on http://localhost:3000");
});

// ✅ 수정 후 (포트 4000으로 변경)
server.listen(4000, () => {
  warmUpHistograms(500);
  console.log("Dashboard server listening on http://localhost:4000");
});
```

**유의사항:**
- 포트 변경 후 모든 클라이언트도 엔드포인트를 수정해야 합니다
- 1024 이하의 포트는 관리자 권한이 필요할 수 있습니다

---

### 워밍업 표본 수 조정

**파일:** `dashboard/server.js`  
**라인:** 약 238줄

```javascript
// ✅ 불릿 표본이 너무 많으면 메모리 부하
warmUpHistograms(500);   // 현재값

// ✅ 200으로 줄이기 (가벼운 동작)
warmUpHistograms(200);

// ✅ 1000으로 늘리기 (더 정확한 퍼센타일)
warmUpHistograms(1000);
```

**권장값:**
- `200`: 빠른 시작, 가벼운 메모리 사용
- `500`: 기본값 (균형잡힌 설정)
- `1000`: 더 정확한 통계, 더 많은 메모리

---

### 히스토리 최대 데이터 수 변경

**파일:** `dashboard/server.js`  
**라인:** 약 11줄

```javascript
// ✅ 한 메트릭당 최대 보유 데이터 개수
const MAX_HISTORY = 500;   // 현재값

// ✅ 1000으로 증가 (더 긴 히스토리)
const MAX_HISTORY = 1000;
```

**영향:**
- 값이 작을수록: 메모리 절약, 최근 데이터만 유지
- 값이 클수록: 더 긴 시간의 히스토리, 정확한 퍼센타일

---

### 차트 최대 포인트 수 변경

**파일:** `dashboard/public/app.js`  
**라인:** 약 15줄

```javascript
// ✅ 차트에 표시할 최대 포인트 수
const MAX_POINTS = 400;   // 현재값

// ✅ 200으로 줄이기 (더 빠른 화면 업데이트)
const MAX_POINTS = 200;

// ✅ 800으로 늘리기 (더 많은 데이터 동시 표시)
const MAX_POINTS = 800;
```

**유의사항:**
- 값이 크면 브라우저 렌더링 성능 저하
- 모바일에서는 200~300 권장

---

## Java 앱 설정

### ApmConfig 설정

**파일:** 앱의 초기화 코드  
**형식:** Builder 패턴

```java
ApmModule apm = ApmModule.init(
  ApmConfig.builder()
    .serviceName("my-service")           // ✅ 필수: 서비스 이름
    .environment("dev")                  // ✅ 필수: 환경
    .otlpEndpoint("http://localhost:4317") // ✅ 선택: OTel Collector
    .dashboardEndpoint("http://172.30.79.156:3000/ingest") // ✅ 필수: 대시보드
    .sampleRatio(1.0)                    // ✅ 선택: 샘플링
    .build()
);
```

### 각 설정값 상세

#### `serviceName(String name)` 
**형식:** 영문+숫자, 하이픈 가능  
**예시:**
```java
.serviceName("checkout-service")
.serviceName("payment_api")
.serviceName("db-connector")
```

**유의사항:**
- 공백/특수문자 제외
- 길이: 1~50글자 권장
- 대시보드에서 구분하는 식별자 역할

#### `environment(String env)`
**허용값:** `dev`, `staging`, `prod`, `test` 등  
**예시:**
```java
.environment("dev")       // 개발 환경
.environment("production") // 본운영
.environment("qa")        // QA 테스트
```

#### `otlpEndpoint(String url)`
**형식:** OpenTelemetry Collector 경로  
**예시:**
```java
.otlpEndpoint("http://localhost:4317")           // 로컬
.otlpEndpoint("http://127.0.0.1:4317")           // 루프백
.otlpEndpoint("http://otel-collector.example.com:4317") // 원격
```

**선택사항:** 설정하지 않으면 OTel 전송 비활성화

#### `dashboardEndpoint(String url)`
**필수:** 대시보드 `/ingest` 주소  
**형식:** `{PROTOCOL}://{HOST}:{PORT}/ingest`

```java
// ✅ 로컬 실행
.dashboardEndpoint("http://localhost:3000/ingest")

// ✅ 실기기/블루스택
.dashboardEndpoint("http://192.168.1.100:3000/ingest")

// ✅ 원격 서버
.dashboardEndpoint("https://apm.company.com/ingest")
```

**주의:**
- `http://` 또는 `https://` 명시 필요
- 포트 번호 필수 (기본 80 아님, 3000 명시)
- 마지막에 `/ingest` 필수

#### `sampleRatio(double ratio)`
**범위:** `0.0` ~ `1.0`  
**예시:**
```java
.sampleRatio(1.0)   // 모든 이벤트 수집 (기본값)
.sampleRatio(0.5)   // 50% 샘플링
.sampleRatio(0.1)   // 10% 샘플링 (높은 부하 환경)
```

**사용 시나리오:**
- `1.0`: 테스트/개발 환경
- `0.5`: 중간 규모 트래픽
- `0.1`: 매우 높은 QPS 환경

---

## Dart/Flutter 설정

### 엔드포인트 설정

**파일:** `lib/main.dart` (또는 ApmSender 클래스)  
**라인:** 약 58줄

```dart
class ApmSender {
  // ✅ 로컬 PC (블루스택용)
  static const String _endpoint = 'http://10.0.2.2:3000/ingest';
  
  // ✅ 다른 네트워크:
  // static const String _endpoint = 'http://192.168.1.100:3000/ingest';
  
  // ✅ 원격:
  // static const String _endpoint = 'https://apm.company.com/ingest';
}
```

### 엔드포인트 선택 기준

#### 1️⃣ 블루스택/안드로이드 에뮬레이터
```dart
static const String _endpoint = 'http://10.0.2.2:3000/ingest';
```
- `10.0.2.2`: 에뮬레이터에서 호스트 PC를 지칭하는 특수 주소
- 블루스택 기본 설정값

#### 2️⃣ 실기기 (같은 Wi-Fi)
```dart
// PC의 로컬 IP를 확인 후 설정
// 윈도우: ipconfig → IPv4 주소 (예: 192.168.1.100)
static const String _endpoint = 'http://192.168.1.100:3000/ingest';
```

**IP 확인 방법:**
```bash
# Windows
ipconfig

# Mac/Linux
ifconfig
```

#### 3️⃣ 다른 서브넷/원격
```dart
static const String _endpoint = 'https://apm-server.company.com/ingest';
```

---

## 네트워크 설정

### 로컬 IP 동적 설정

**상황:** 매번 IP를 수정하고 싶지 않은 경우

**Dart 예시:**
```dart
import 'dart:io';

class ApmConfig {
  static String getEndpoint() {
    final env = Platform.environment;
    
    // 환경변수로 설정
    if (env.containsKey('APM_ENDPOINT')) {
      return env['APM_ENDPOINT']!;
    }
    
    // 디버그 모드면 로컬
    if (kDebugMode) {
      return 'http://10.0.2.2:3000/ingest';
    }
    
    // 프로덕션
    return 'https://apm-prod.company.com/ingest';
  }
}
```

### 방화벽 설정

**Windows 방화벽 확인:**
```bash
# Node.js 포트 3000 허용
netsh advfirewall firewall add rule name="APM Module" dir=in action=allow protocol=tcp localport=3000
```

**Mac 방화벽:**
- System Settings → Security & Privacy → Firewall Options → 3000 추가

---

## 함수별 상세 가이드

### `startEvent(name, attrs) -> ApmEvent`

**용도:** 이벤트 시작  
**파라미터:**
| 파라미터 | 타입 | 필수 | 설명 | 예시 |
|---------|------|------|------|------|
| `name` | String | ✅ | 이벤트 이름 | "checkout", "db_query" |
| `attrs` | Map | ❌ | 태그/메타데이터 | `Map.of("userId", "123")` |

**반환값:** `ApmEvent` 객체

**사용 예:**
```java
// ✅ 기본 사용
ApmEvent evt = apm.startEvent("api_call");

// ✅ 태그 포함
ApmEvent evt = apm.startEvent(
  "payment",
  Map.of("userId", "user123", "amount", "10000")
);
```

**주의사항:**
- `name`은 반드시 영문/숫자
- `attrs`는 선택사항이지만, 추적성을 위해 권장
- 반환된 객체는 반드시 `endEvent()`로 마무리

---

### `endEvent(event, status)`

**용도:** 이벤트 종료  
**파라미터:**
| 파라미터 | 타입 | 필수 | 설명 | 예시 |
|---------|------|------|------|------|
| `event` | ApmEvent | ✅ | startEvent() 반환값 | `evt` |
| `status` | StatusCode | ❌ | 상태 코드 | `StatusCode.OK` |

**StatusCode 종류:**
```java
StatusCode.OK       // 정상 완료
StatusCode.ERROR    // 에러 발생
StatusCode.UNSET    // 상태 미정
```

**사용 예:**
```java
ApmEvent evt = apm.startEvent("checkout");

try {
  // ... 작업 수행 ...
  apm.endEvent(evt, StatusCode.OK);
} catch (Exception e) {
  apm.endEvent(evt, StatusCode.ERROR);
}
```

**오류 처리:**
```java
❌ // 오류: startEvent 없이 호출
apm.endEvent(null, StatusCode.OK);  // NullPointerException

✅ // 정정: 항상 쌍으로 사용
ApmEvent evt = apm.startEvent("task");
apm.endEvent(evt, StatusCode.OK);
```

---

### `addMetric(event, key, value)`

**용도:** 이벤트에 성능 지표 추가  
**파라미터:**
| 파라미터 | 타입 | 필수 | 설명 | 범위 |
|---------|------|------|------|------|
| `event` | ApmEvent | ✅ | 진행 중인 이벤트 | - |
| `key` | String | ✅ | 메트릭 이름 | 아래 표 참고 |
| `value` | double | ✅ | 수치값 | 유형별 다름 |

**표준 메트릭 (권장):**
| 키 이름 | 범위 | 설명 | 예시 |
|---------|------|------|------|
| `durationMs` | 0~5000 | 소요시간(ms) | 234.5 |
| `requestCount` | 1~100 | 요청 수 | 5 |
| `errorCount` | 0~10 | 에러 수 | 0 |
| `cpuPct` | 0~100 | CPU 사용률(%) | 45.2 |
| `memMb` | 0~2000 | 메모리(MB) | 512.0 |
| `apdex` | 0~1 | Apdex 점수 | 0.95 |

**사용 예:**
```java
ApmEvent evt = apm.startEvent("api_request");

// ✅ 단일 메트릭
apm.addMetric(evt, "durationMs", 1234.5);

// ✅ 여러 메트릭
apm.addMetric(evt, "requestCount", 3);
apm.addMetric(evt, "errorCount", 0);
apm.addMetric(evt, "cpuPct", 52.3);

apm.endEvent(evt, StatusCode.OK);
```

**오류 사례:**
```java
❌ // 오류: 존재하지 않는 키
apm.addMetric(evt, "unknownMetric", 123);  // 차트에 표시 안됨

❌ // 오류: NaN/Infinity
apm.addMetric(evt, "durationMs", Double.NaN);      // 무시됨
apm.addMetric(evt, "cpuPct", Double.POSITIVE_INFINITY); // 무시됨

✅ // 정정: 유효한 범위 내 숫자
apm.addMetric(evt, "cpuPct", 95.5);
apm.addMetric(evt, "durationMs", 0);  // 0도 유효
```

---

### `addTraceStep(event, name, value)`

**용도:** 이벤트 내 세부 단계 기록  
**파라미터:**
| 파라미터 | 타입 | 필수 | 설명 | 예시 |
|---------|------|------|------|------|
| `event` | ApmEvent | ✅ | 진행 중인 이벤트 | - |
| `name` | String | ✅ | 단계명 | "db.query", "http.call" |
| `value` | double | ✅ | 소요시간(ms) | 120.5 |

**사용 예:**
```java
ApmEvent evt = apm.startEvent("checkout");

// 결제 프로세스의 각 단계 기록
apm.addTraceStep(evt, "load_cart", 45);       // 장바구니 로드: 45ms
apm.addTraceStep(evt, "validate_payment", 78); // 결제 검증: 78ms
apm.addTraceStep(evt, "charge", 234);         // 결제 처리: 234ms
apm.addTraceStep(evt, "send_email", 123);     // 이메일 발송: 123ms

long total = 45 + 78 + 234 + 123; // = 480ms
apm.addMetric(evt, "durationMs", total);

apm.endEvent(evt, StatusCode.OK);
```

**주의사항:**
- `name`은 영문+점(.) 구분자 (예: `db.query`, `cache.get`)
- `value`는 밀리초(ms) 단위
- 합계가 `durationMs`와 일치하지 않아도 무방 (네트워크 대기 등)

---

### `sendEvent(event) -> int`

**용도:** 이벤트를 대시보드로 전송  
**반환값:** HTTP 상태 코드

**코드 값:**
| 코드 | 의미 | 조치 |
|------|------|------|
| 200 | 성공 | 정상 |
| 400 | 잘못된 요청 | 페이로드 형식 확인 |
| 404 | 엔드포인트 없음 | 대시보드 주소 확인 |
| 500 | 서버 오류 | 대시보드 로그 확인 |
| 타임아웃 | 연결 실패 | 네트워크/방화벽 확인 |

**사용 예:**
```java
ApmEvent evt = apm.startEvent("important_task");
apm.addMetric(evt, "durationMs", 500);
apm.endEvent(evt, StatusCode.OK);

// ✅ 기본 사용
int status = apm.sendEvent(evt);
System.out.println("Send status: " + status);

// ✅ 상태 확인
if (apm.sendEvent(evt) == 200) {
  System.out.println("Event sent successfully");
} else {
  System.out.println("Failed to send event");
}
```

**오류 처리:**
```java
❌ // 오류: endEvent 호출 전 sendEvent
ApmEvent evt = apm.startEvent("task");
apm.sendEvent(evt);  // endTime이 0이므로 비정상 데이터

✅ // 정정: 반드시 endEvent 후 sendEvent
ApmEvent evt = apm.startEvent("task");
apm.addMetric(evt, "durationMs", 100);
apm.endEvent(evt, StatusCode.OK);
apm.sendEvent(evt);
```

---

### `shutdown()`

**용도:** 모듈 안전 종료  
**파라미터:** 없음  
**반환값:** 없음

**사용 예:**
```java
// 앱 종료 시점에 호출
@PreDestroy  // Spring의 경우
public void cleanup() {
  apm.shutdown();
}

// 일반 Java
public static void main(String[] args) {
  ApmModule apm = ApmModule.init(...);
  
  try {
    // ... 앱 로직 ...
  } finally {
    apm.shutdown();  // 반드시 호출
  }
}
```

**주의사항:**
- `shutdown()` 호출 후 새로운 이벤트 추가 금지
- 프로세스 종료 직전에 호출 권장 (5초 대기 후 강제 종료)
- 비동기 작업이므로 즉시 프로세스 종료하지 말 것

---

## 오류 처리

### 일반적 오류

#### `IllegalStateException: ApmModule not initialized`
**원인:** `init()` 호출 없이 `get()` 사용  
**해결:**
```java
❌ ApmModule apm = ApmModule.get();  // 초기화 전

✅ ApmModule apm = ApmModule.init(config);  // 먼저 초기화
```

#### `java.net.ConnectException: Connection refused`
**원인:** 대시보드 서버가 실행 중이지 않음  
**해결:**
```bash
# 대시보드 시작
cd dashboard
npm start
```

#### `HTTP 400 Bad Request`
**원인:** 페이로드 형식 오류  
**확인 사항:**
- `eventId` 필수
- `metrics`의 키가 유효한가?
- `durationMs`가 숫자인가?

#### `HTTP 404 Not Found`
**원인:** 엔드포인트 주소 오류  
**확인:**
```java
// 잘못된 예
.dashboardEndpoint("http://localhost:3000")  // /ingest 빠짐

// 정정
.dashboardEndpoint("http://localhost:3000/ingest")
```

---

## 주의사항

### 1️⃣ 스레드 안전성
```java
// ⚠️ 스레드마다 독립적인 이벤트 생성
ApmEvent evt1 = apm.startEvent("task1");  // Thread 1
ApmEvent evt2 = apm.startEvent("task2");  // Thread 2
apm.endEvent(evt1, StatusCode.OK);        // Thread 1
apm.endEvent(evt2, StatusCode.OK);        // Thread 2
```

### 2️⃣ 메모리 누수 방지
```java
// ❌ 나쁜 예: endEvent 호출 안 함
for (int i = 0; i < 1000; i++) {
  ApmEvent evt = apm.startEvent("task");
  // endEvent 미호출 → 메모리 누적
}

// ✅ 좋은 예: 반드시 endEvent
for (int i = 0; i < 1000; i++) {
  ApmEvent evt = apm.startEvent("task");
  try {
    // ... 작업 ...
  } finally {
    apm.endEvent(evt, StatusCode.OK);
  }
}
```

### 3️⃣ 이벤트 재사용 금지
```java
// ❌ 이벤트 재사용 금지
ApmEvent evt = apm.startEvent("task1");
apm.endEvent(evt, StatusCode.OK);
apm.sendEvent(evt);

apm.addMetric(evt, "newMetric", 100);  // ❌ 이미 종료된 이벤트
apm.endEvent(evt, StatusCode.OK);      // ❌ 중복 종료

// ✅ 각각 독립적으로 생성
ApmEvent evt1 = apm.startEvent("task1");
apm.endEvent(evt1, StatusCode.OK);
apm.sendEvent(evt1);

ApmEvent evt2 = apm.startEvent("task2");
apm.endEvent(evt2, StatusCode.OK);
apm.sendEvent(evt2);
```

### 4️⃣ 네트워크 대역폭
```java
// ⚠️ 빈번한 sendEvent는 네트워크 부하
// 배치 처리 권장
for (ApmEvent evt : events) {
  apm.sendEvent(evt);  // 매번 즉시 전송
}

// ✨ 더 나은 방법: 주기적 배치 전송
List<ApmEvent> batch = new ArrayList<>();
for (ApmEvent evt : events) {
  batch.add(evt);
  if (batch.size() >= 10) {
    for (ApmEvent e : batch) {
      apm.sendEvent(e);
    }
    batch.clear();
  }
}
```

### 5️⃣ Dart에서 비동기 처리
```dart
// ⚠️ 동기로 대기하지 말 것
ApmSender.sendEvent(payload);  // 결과 확인 안 함

// ✨ 비동기 처리
await ApmSender.sendEvent(payload);  // 완료 대기

// 또는 무시
ApmSender.sendEvent(payload);  // fire-and-forget
```

### 6️⃣ 샘플링 고려
```java
// 높은 트래픽 환경에서는 샘플링 권장
ApmConfig.builder()
  .sampleRatio(0.1)  // 10% 샘플링
  .build()

// 단, 극히 드문 에러는 놓칠 수 있음
```

---

## 체크리스트

새로운 환경에서 시작할 때:

- [ ] Node.js 대시보드 포트 확인
- [ ] 앱에서 대시보드 엔드포인트 주소 설정
- [ ] 방화벽에서 포트 3000(또는 커스텀) 허용
- [ ] `npm install && npm start` 실행 확인
- [ ] 앱과 대시보드 간 네트워크 연결 확인
- [ ] 첫 이벤트 전송 후 대시보드에서 점 표시 확인
- [ ] 샘플링 비율 설정 (필요시)
- [ ] `/ingest` 엔드포인트 응답 확인 (테스트): `curl http://localhost:3000/ingest`

---

## 유용한 명령어

```bash
# 포트 점유 확인
lsof -i :3000          # Mac/Linux
netstat -ano | findstr :3000  # Windows

# 대시보드 재시작
cd dashboard && npm start

# 타임아웃 확인
curl -v http://localhost:3000/ingest  # GET은 200이지만 POST용

# Git 커밋 후 재배포
git pull && npm install && npm start
```

---

더 궁금한 점은 GitHub Issues를 통해 문의해주세요!
