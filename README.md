# APM Module V2 (+ Tail First APM)

기존 APM Module V1 설명은 생략하고, V2에서 **추가/변경된 내용만** 정리한 문서입니다.

## 📌 이번 버전 핵심 변경

- Tail-first APM 상태 기반 제어 로직 적용
- 이벤트 상세(Event Details)에 `risk_score` 노출
- 상단 핵심 지표를 `Critical Coverage Rate` 단일 지표로 표시
- `Critical Coverage` 배지 클릭 상세 로그 조회 패널 추가
- Warmup 데이터가 예측 통계를 오염하지 않도록 제외 처리
- 차트가 이벤트가 없어도 시간축이 계속 흐르도록 개선
- Event Details에서 severity 원인 값 색상 강조(critical=빨강, warning=주황)

---

## 1) Tail-first APM 반영 사항

### 상태 기반 샘플링
- `risk_score`를 계산하고 임계치에 따라 모드를 전환합니다.
  - `stable` / `warning` / `critical`
- 모드별 샘플링 비율을 기반으로 상세 추적 여부를 제어합니다.
  - 현재 동작: `stable`은 비율 기반, `warning/critical`은 상세 추적 우선

### Event Details 확장
- `/event/:id` 응답에 `risk_score`가 포함됩니다.
- 대시보드 상세 패널에서 `risk_score`를 색상 규칙으로 표시합니다.

### 설정/통계 API
- `GET /tail-first/config`
- `GET /tail-first/stats`
- `POST /tail-first/stats/reset`

---

## 2) 핵심 지표 업데이트 (Critical Coverage 중심)

### 상단 배지 지표
- 상단에는 해석이 쉬운 단일 지표만 표시합니다.
  - `Critical Coverage Rate = P(trace_on=1 | severity=critical)`
- 해석 기준:
  - 높을수록 좋음(critical 발생 시 full tracing으로 포착됨)
  - 예: `Critical Coverage >= 95%`면 매우 양호, `<80%`면 개선 필요

### 내부 집계(상세/검증용)
- 상세 검증용으로는 기존 `Risk Precision` 계열 집계를 유지합니다.
  - `Pn = P(severity=normal | risk_mode=stable)`
  - `Pc = P(severity∈{warning,critical} | risk_mode=critical)`
  - `Pw = P(severity∈{warning,critical} | risk_mode=warning)`
  - `Risk Precision = (Nn*Pn + Nc*Pc + Nw*Pw) / (Nn + Nc + Nw)`

### 상세 로그 조회
- 상단 `Critical Coverage` 배지 클릭 시 상세 패널이 열립니다.
- 로그에는 `HIT/MISS`, `riskMode→severity`, `riskScore`, `eventId`, 시각이 표시됩니다.
- 이 로그는 운영 배지(`Critical Coverage`) 해석을 돕는 상세 근거로 사용합니다.

### 관련 API
- `GET /risk-precision/stats`
- `POST /risk-precision/stats/reset`
- `GET /risk-precision/details?limit=30`

---

## 3) 대시보드 UX/동작 개선

- 실시간 슬라이딩 윈도우로 차트 X축이 지속적으로 갱신됩니다.
- 이벤트 미유입 구간에서도 화면이 정지된 것처럼 보이지 않도록 개선했습니다.
- `Critical Coverage` 배지 클릭으로 상세 로그를 즉시 조회할 수 있습니다.
- Event Details의 Severity/원인 값을 상태에 맞는 색상으로 강조합니다.
  - severity level: `critical=빨강`, `warning=주황`, `normal=흰색`
  - severity 원인 값: `critical 원인=빨강`, `warning 원인=주황`

---

## 4) 운영 해석 가이드

- `Critical Coverage Rate`를 1차 운영 지표로 사용합니다.
  - 높을수록 실제 critical 구간이 full tracing으로 포착되고 있다는 의미입니다.
- 표본 수(`critical n`)가 너무 작으면 지표 변동이 커질 수 있으므로,
  - 상세 패널의 로그와 함께 해석하는 것을 권장합니다.
- `Risk Precision` 계열(Pn/Pc/Pw)은 튜닝/원인분석 시 보조 지표로 사용합니다.

---

## 5) 실행 (변경사항 확인용)

```bash
cd dashboard
npm install
npm start
```

- 대시보드: `http://localhost:3000`

---

## 6) 변경 이력

### 2026.02.15 - Tail-first 예측 지표 고도화

- 상단 운영 지표를 `Critical Coverage Rate` 단일 지표로 단순화
- `N/C/W` 3항 가중평균 수식으로 정확도 계산 고도화
- `Critical Coverage` 배지 기반 상세 로그(클릭 조회) 추가
- Event Details에서 severity 원인 값 색상 강조 추가
- warmup 데이터의 예측 통계 오염 제거
- 차트 실시간 시간축 이동 보강

---

## 7) 실행 화면
<img width="1776" height="1288" alt="image" src="https://github.com/user-attachments/assets/780c3012-09a1-4b60-a766-fd06bc4200a4" />


---

## 참고

세부 설정 항목은 `CONFIGURATION.md`를 참고하세요.
