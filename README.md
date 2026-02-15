# APM Module V2 (업데이트 반영본)

기존 APM Module V1 설명은 생략하고, V2에서 **추가/변경된 내용만** 정리한 문서입니다.

## 📌 이번 버전 핵심 변경

- Tail-first APM 상태 기반 제어 로직 적용
- 이벤트 상세(Event Details)에 `risk_score` 노출
- 예측 지표를 `Early` / `Strict`로 분리해 실시간 표시
- 예측 상세 로그(성공/실패/대기) 조회 패널 추가
- Warmup 데이터가 예측 통계를 오염하지 않도록 제외 처리
- 차트가 이벤트가 없어도 시간축이 계속 흐르도록 개선

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

## 2) 예측 지표(Prediction) 업데이트

### Early / Strict 이중 지표
- `Early`: 조기 경보 감지율(민감도 중심)
- `Strict`: 엄격 조건 적중률(정밀도 중심)
- 대시보드 우측 상단에 `Early | Strict`를 실시간 배지로 표시합니다.

### 예측 설정값 실시간 변경
- UI에서 아래 값을 즉시 조정 가능합니다.
  - `W`(windowSec)
  - `p99ThresholdMs`
  - `sloThresholdMs`

### 상세 로그 조회
- 배지 클릭 시 상세 패널을 열어 다음을 확인할 수 있습니다.
  - Early 결과 목록
  - Strict 결과 목록
  - Pending(판정 대기) 목록
- 각 레코드에 `src(event)` / `match(event)` 정보를 표시해 추적성을 높였습니다.

### Warmup 제외
- `source=warmup` 이벤트는 prediction 집계/로그에서 제외됩니다.
- warmup 완료 직후 prediction 통계가 초기화됩니다.

### 관련 API
- `GET /prediction/stats`
- `POST /prediction/stats/reset`
- `GET /prediction/details?limit=30`
- `GET /prediction/config`
- `POST /prediction/config`

---

## 3) 대시보드 UX/동작 개선

- 실시간 슬라이딩 윈도우로 차트 X축이 지속적으로 갱신됩니다.
- 이벤트 미유입 구간에서도 화면이 정지된 것처럼 보이지 않도록 개선했습니다.
- 예측 배지/설정/상세 패널 간 토글 동작 충돌을 줄였습니다.

---

## 4) 운영 해석 가이드

- `Early`만 높고 `Strict`가 낮으면:
  - 기준이 느슨해 오탐 가능성이 있는 상태로 해석합니다.
- `Strict`까지 함께 높으면:
  - 실제 tail 악화 징후를 비교적 신뢰도 높게 포착한 상태로 봅니다.
- `Pending`이 많으면:
  - 아직 W초 판정 창이 닫히지 않은 상태이므로 성급한 해석을 피합니다.

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

- 예측 성공률을 `Early | Strict`로 분리해 실시간 노출
- 예측 상세(성공/실패/대기) 로그 패널 추가
- `src/match` 이벤트 식별 정보로 원인 추적성 개선
- warmup 데이터의 예측 통계 오염 제거
- 차트 실시간 시간축 이동 보강

---

## 7) 실행 화면
<img width="1810" height="1276" alt="image" src="https://github.com/user-attachments/assets/0ebf0953-8085-48ba-b9bf-59c3f6ddb562" />


---

## 참고

세부 설정 항목은 `CONFIGURATION.md`를 참고하세요.
