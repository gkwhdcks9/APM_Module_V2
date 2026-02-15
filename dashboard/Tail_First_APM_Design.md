# Tail-First APM 설계 문서

## 1. 설계 목표

Tail-First APM의 핵심 목표는 다음과 같다:

1.  정상 구간에서는 초경량 모드 유지
2.  위험 상태 진입 시 정밀 추적 활성화
3.  저장 비용 최소화
4.  자동 모드 전환 (인간 개입 최소화)
5.  기존 Kubernetes + Prometheus 환경과 호환 가능

------------------------------------------------------------------------

## 2. 전체 아키텍처 개요

Metrics Source (Prometheus 등) ↓ State Vector Builder ↓ Risk Evaluator ↓
Mode Controller ↓ Dynamic Sampler (OTel / Collector) ↓ Storage ↓ UI

------------------------------------------------------------------------

## 3. 핵심 구성 요소

### 3.1 State Vector Builder

수집 가능한 주요 지표:

-   CPU utilization
-   Thread pool queue length
-   DB connection usage
-   Retry rate
-   GC pause ratio
-   Network RTT p95
-   Error rate slope
-   Cache miss rate

상태 벡터 표현:

S(t) = \[s1, s2, ..., sk\]

------------------------------------------------------------------------

### 3.2 Risk Evaluator

단순 선형 모델:

risk_score = Σ (wi \* si_normalized)

고급 모델 예시:

-   EWMA 기반 변동성 점수
-   Mahalanobis distance
-   Queueing delay 예측 모델

출력값:

risk_score ∈ \[0, 1\]

------------------------------------------------------------------------

### 3.3 Mode Controller

risk_score에 따른 동적 샘플링 전환:

if risk \< 0.3: sampling_rate = 0.01 elif risk \< 0.6: sampling_rate =
0.1 else: sampling_rate = 1.0

히스테리시스 적용으로 모드 진동 방지

------------------------------------------------------------------------

### 3.4 Dynamic Sampler

-   Sampling rate 동적 조정
-   특정 조건 시 강제 full trace

예:

if db_wait_time \> threshold: force_trace = true

------------------------------------------------------------------------

## 4. 동작 흐름

### 정상 상태

-   risk_score 낮음
-   1% trace 기록
-   메트릭 위주 관측

### 위험 상태 진입

-   queue length 증가
-   retry rate 상승
-   CPU spike

→ risk_score 증가\
→ sampling_rate 상승\
→ full tracing 활성화

### 위험 상태 종료

-   상태 안정
-   sampling_rate 감소

------------------------------------------------------------------------

## 5. 기존 Tail-based Sampling과 비교

  항목          Tail-based     Tail-first
  ------------- -------------- --------------
  판단 시점     요청 종료 후   요청 시작 전
  기준          latency 결과   시스템 상태
  저장량        중간           매우 낮음
  예측성        없음           있음
  구현 난이도   낮음           중간\~높음

------------------------------------------------------------------------

## 6. 단계별 구현 로드맵

### Phase 1 (실험 단계)

-   Prometheus 지표 수집
-   단순 선형 risk_score 계산
-   Collector sampling rate 동적 변경

### Phase 2 (고도화)

-   EWMA 기반 변동성 감지
-   위험 구간 자동 tagging
-   Full trace auto-trigger

### Phase 3 (연구 단계)

-   상태 공간 기반 anomaly detection
-   인과 그래프 모델 적용
-   Self-optimizing sampling

------------------------------------------------------------------------

## 7. 기대 효과

-   Storage 70\~90% 절감 가능
-   Collector 메모리 사용 감소
-   Outlier 집중 분석 가능
-   시스템 중심 관측 모델 구현

------------------------------------------------------------------------

## 8. 잠재 리스크

-   예측 실패 시 trace 누락
-   오탐 시 trace 과다
-   설계 복잡도 증가
-   운영팀 이해도 필요

------------------------------------------------------------------------

## 9. 설계 철학 요약

기존 APM은 이벤트를 수집 후 분석한다.\
Tail-First APM은 상태를 먼저 평가하고 필요할 때만 정밀 관측한다.

즉,

Storage 중심 사고 → 상태 중심 사고
