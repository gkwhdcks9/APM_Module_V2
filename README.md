# APM Module V2 (업데이트 반영본)

기존 APM Module V1 설명은 생략하고, V2에서 **추가/변경된 내용만** 정리한 문서입니다.

## 📌 이번 버전 핵심 변경

- Tail-first APM 상태 기반 제어 로직 적용
- 이벤트 상세(Event Details)에 `risk_score` 노출
- 예측 지표를 `Risk Precision`(N/C/W 가중평균)으로 교체
- `Risk Precision` 상세 로그(배지 클릭) 조회 패널 추가
- Warmup 데이터가 예측 통계를 오염하지 않도록 제외 처리
- 차트가 이벤트가 없어도 시간축이 계속 흐르도록 개선
- Event Details에서 severity 원인 값 색상 강조(critical=빨강, warning=주황)

---

## 1) Tail-first APM 반영 사항

### 상태 기반 샘플링
- `risk_score`를 계산하고 임계치에 따라 모드를 전환합니다.
  - `stable` / `warning` / `critical`
- 모드별 샘플링 비율과 상세 추적 여부를 동적으로 제어합니다.

### Event Details 확장
- `/event/:id` 응답에 `risk_score`가 포함됩니다.
- 대시보드 상세 패널에서 `risk_score`를 색상 규칙으로 표시합니다.

### 설정/통계 API
- `GET /tail-first/config`
- `GET /tail-first/stats`
- `POST /tail-first/stats/reset`

---

## 2) Risk Precision 업데이트

### 지표 정의 (N/C/W 포함)
- 기존 `Early/Strict/Pending` 노출 대신 `Risk Precision`을 기본 지표로 사용합니다.
- 모드별 조건부 정확도를 계산합니다.
  - `Pn = P(severity=normal | risk_mode=stable)`
  - `Pc = P(severity∈{warning,critical} | risk_mode=critical)`
  - `Pw = P(severity∈{warning,critical} | risk_mode=warning)`
- 최종 점수는 표본 수 가중평균으로 계산합니다.
  - `Risk Precision = (Nn*Pn + Nc*Pc + Nw*Pw) / (Nn + Nc + Nw)`

### 상세 로그 조회
- 상단 `Risk Precision` 배지 클릭 시 상세 패널이 열립니다.
- 로그에는 `HIT/MISS`, `riskMode→severity`, `riskScore`, `eventId`, 시각이 표시됩니다.

### 관련 API
- `GET /risk-precision/stats`
- `POST /risk-precision/stats/reset`
- `GET /risk-precision/details?limit=30`

---

## 3) 대시보드 UX/동작 개선

- 실시간 슬라이딩 윈도우로 차트 X축이 지속적으로 갱신됩니다.
- 이벤트 미유입 구간에서도 화면이 정지된 것처럼 보이지 않도록 개선했습니다.
- `Risk Precision` 배지 클릭으로 상세 로그를 즉시 조회할 수 있습니다.
- Event Details의 Severity/원인 값을 상태에 맞는 색상으로 강조합니다.
  - severity level: `critical=빨강`, `warning=주황`, `normal=흰색`
  - severity 원인 값: `critical 원인=빨강`, `warning 원인=주황`

---

## 4) 운영 해석 가이드

- `Pn`이 낮으면:
  - 정상으로 예측한 구간에서 warning/critical이 자주 발생하는 상태입니다(과소예측 가능성).
- `Pc`, `Pw`가 낮으면:
  - 위험 예측 대비 실제 severity 동반 상승이 약한 상태입니다(과대예측 가능성).
- 가중평균(`Risk Precision`)은 전체 표본 수를 반영하므로,
  - 특정 모드 표본이 적을 때 개별 정확도 단독 해석보다 안정적입니다.

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

- 예측 지표를 `Risk Precision` 중심으로 전환
- `N/C/W` 3항 가중평균 수식으로 정확도 계산 고도화
- `Risk Precision` 상세 로그(클릭 조회) 추가
- Event Details에서 severity 원인 값 색상 강조 추가
- warmup 데이터의 예측 통계 오염 제거
- 차트 실시간 시간축 이동 보강

---

## 참고

세부 설정 항목은 `CONFIGURATION.md`를 참고하세요.
