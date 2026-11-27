# 오늘날씨 비교

현재 위치(또는 저장한 지역)의 현재 날씨, 1시간 단위 오늘·내일 예보, 주간 예보를 보여주고
기상청 · 노르웨이 MET · 유럽 ECMWF · 미국 GFS · 일본 JMA 예보를 탭으로 나눠 비교하는 Android 앱.

## 구조
- `app/src/main/java/.../MainActivity.java`: WebView 껍데기, 네이티브 HTTP·위치·지오코더·뒤로가기 브리지
- `app/src/main/assets/www/`: 화면(HTML/CSS/JS), 출처별 수집·정규화(`sources.js`)

## 빌드
기상청 인증키(공공데이터포털, 디코딩 키)는 저장소에 올리지 않는다. 루트에 `keys.properties`를 만든다.

```
KMA_SERVICE_KEY=발급받은_디코딩_키
```

`./gradlew assembleDebug`

## 데이터 출처
- 기상청 단기예보·초단기실황·중기예보 (공공데이터포털, 공공누리 제1유형)
- MET Norway Locationforecast (CC BY 4.0)
- Open-Meteo (ECMWF IFS, NOAA GFS, JMA) — 무료 API는 비상업용: 광고·유료 기능 없이 배포
