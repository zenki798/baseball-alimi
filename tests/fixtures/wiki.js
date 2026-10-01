/* 위키 원문 견본 — 2026-10-01 실제로 받은 문서의 모양(표·틀 문법)을 그대로 따르고, 숫자·사람은 시험용으로 바꿨다.
 *  - 순위표: 영문 위키백과 「2026 KBO League season」 의 정규시즌 표 모양 (공동 순위 rowspan, 진출 여부 rowspan, 구분 줄 포함)
 *  - 명단: 한국어 위키백과 「틀:KIA 타이거즈 명단」 의 둘러보기 상자 모양 (사람 이름은 가상)
 *  - 정보 상자: 「야구 선수 정보」 틀 모양 (가상 인물). 수집하지 않기로 한 칸(출신지·연봉·계약금)도 일부러 넣었다 */
'use strict';

const STANDINGS = `
== Preseason ==
{| class="wikitable sortable"
|+Preseason standings
!Rank
!Team
|-
! 1
| [[Lotte Giants]]|| 12 || 8 || 2 || 2
! {{Winning percentage|8|2}}
| — || L1 || 7–2–1 || 1–0–1
|}

== Regular season ==
The regular season began on March 28.

=== Standings ===
{| class="wikitable sortable"
|+<big>Regular season standings</big><ref>{{Cite web |title=KBO |url=https://example.org/ |website=Example}}</ref>
!Rank
!Team
!{{Abbr|GP|Games played}}
!{{Abbr|W|Wins}}
!{{Abbr|L|Losses}}
!{{Abbr|D|Draws}}
!{{Abbr|PCT|Win percent}}
!{{Abbr|GB|Games behind}}
!{{Abbr|STRK|Win/loss streak}}
! colspan=3| {{Abbr|Home|Home record}}
! colspan=3| {{Abbr|Road|Record on the road}}
!{{Abbr|Postseason|Postseason status}}
|- style="background-color:#CCCCFF;"
!1
| '''[[KT Wiz]]''' || 134 || 79 || 53 || 2
! {{Winning percentage|79|53}}
| — || W3 || 40 || 1 || 26 || 39 || 1 || 27
| Clinched first place
|- style="background-color:#FFFFCC;"
!2
| '''[[Samsung Lions]]''' || 134 || 77 || 54 || 3
! {{Winning percentage|77|54}}
| 1.5 || W1 || 39 || 2 || 27 || 38 || 1 || 27
| rowspan="4" | Qualified
|- style="background-color:#FFFFCC;"
!3
| '''[[LG Twins]]''' || 134 || 73 || 59 || 2
! {{Winning percentage|73|59}}
| 6 || L2 || 37 || 1 || 30 || 36 || 1 || 29
|- style="background-color:#FFFFCC;"
!4
| '''[[Kia Tigers|KIA Tigers]]''' || 134 || 70 || 62 || 2
! {{Winning percentage|70|62}}
| 9 || L1 || 35 || 1 || 31 || 35 || 1 || 31
|- style="background-color:#FFFFCC;"
!5
| '''[[Doosan Bears]]''' || 134 || 68 || 63 || 3
! {{Winning percentage|68|63}}
| 10.5 || W2 || 34 || 2 || 32 || 34 || 1 || 31
|-
! colspan="16" |<!--Bar to distinguish top 5 teams-->
|-
! rowspan="2" | 6
| [[NC Dinos]] || 134 || 64 || 68 || 2
! rowspan="2" | {{Winning percentage|64|68}}
| rowspan="2" | 15 || L3 || 32 || 1 || 34 || 32 || 1 || 34
|
|-
| [[Lotte Giants]] || 134 || 64 || 68 || 2
|| W1 || 32 || 1 || 34 || 32 || 1 || 34
|
|-
!8
| [[SSG Landers]] || 134 || 59 || 72 || 3
! {{Winning percentage|59|72}}
| 19.5 || T1 || 30 || 2 || 36 || 29 || 1 || 36
| rowspan="3" | ''Did not qualify''
|-
!9
| [[Hanwha Eagles]] || 134 || 56 || 76 || 2
! {{Winning percentage|56|76}}
| 23 || L4 || 28 || 1 || 38 || 28 || 1 || 38
|-
!10
| [[Kiwoom Heroes]] || 134 || 49 || 84 || 1
! {{Winning percentage|49|84}}
| 30.5 || W1 || 25 || 1 || 42 || 24 || 0 || 42
|}
Statistics are correct as of October 1, 2026.

== All-Star Game ==
`;

const ROSTER = `<onlyinclude>{{둘러보기 상자
|이름=KIA 타이거즈 명단
|제목=[[KIA 타이거즈|<span style="color:#ffffff;">KIA 타이거즈</span>]] - 현재 명단
|묶음1 = <span style="color: black;">감독</span>
|내용1 =
* 71 [[테스트감독]]

|묶음2 = 코치
|내용2 =
* 68 [[가상코치 (야구인)|가상코치]] (수석)
* 73 [[둘째코치]] (작전주루)

|묶음3 = 퓨처스 감독
|내용3 =
* 70 [[퓨처스감독]]

|묶음6 = 투수
|내용6 =
* 0 [[가람 (야구 선수)|가람]]
* 4 [[투수둘]]
* 10 [[투수셋 (2006년)|투수셋]]
* 11 [[투수넷]]
* 13 [[투수다섯]]
* 17 [[투수여섯]]
* 19 [[투수일곱]]
* 20 [[투수여덟]]
* 21 [[투수아홉]]
* 30 [[투수열]]
* 32 [[투수열하나]]
* 33 [[투수열둘]]
* 38 [[투수열셋]]
* 39 [[투수열넷]]
* 102 [[육성투수]]

|묶음7 = 포수
|내용7 =
* 22 [[포수하나]]
* 25 [[포수둘]]

|묶음8 = 내야수
|내용8 =
* 2 [[내야하나]]
* 5 [[내야둘 (2003년)|내야둘]]
* 6 [[내야셋]]
* 14 [[내야넷]]

|묶음9 = 외야수
|내용9 =
* 1 [[외야하나]]
* 8 [[외야둘]]
* 47 [[외야셋]]<small>(주장)</small>
* 57 [[외야넷#경력|외야넷]]

|묶음10 = 군입대 선수
|내용10 =
* [[군복무하나 (야구 선수)|군복무하나]]
* [[군복무둘]]

|묶음11 = 2027년 신인지명 선수
|내용11 =

|아랫글 =
}}</onlyinclude>

[[분류:KIA 타이거즈 틀|명단]]`;

/* 투수만 8명 미만 등으로 망가진 명단 (검사에 걸려야 한다) */
const BROKEN_ROSTER = `{{둘러보기 상자
|묶음1 = 감독
|내용1 =
* 71 [[테스트감독]]
|묶음6 = 투수
|내용6 =
* 0 [[가람]]
}}`;

const INFOBOX = `{{다른 뜻2||동명이인|가람 (동음이의)}}
{{야구 선수 정보
| 선수명 = 가람
| 로마자 표기 = Ga Ram
| 소속 구단 = [[KIA 타이거즈]]
| 등번호 = 0
| 선수 사진 파일명 = 가람 선수 첫 인사.jpg
| 사진 사이즈 = 270px
| 사진 설명 = 가람(2025년)
| 국적 = [[대한민국]]
| 출신지 = [[대한민국]] [[가상시]]
| 생년월일 = {{출생일과 나이|2001|10|3}}
| 신장 = 185cm
| 체중 = 88
| 수비 위치 = [[투수]], [[외야수]](입단 당시)
| 투구 = [[우]]
| 타석 = 좌
| 프로 입단 연도 = [[2020년]]
| 드래프트 순위 = [[2020년 KBO 리그 신인 드래프트|2020년]] 1차 지명([[KIA 타이거즈]])
| 획득 타이틀 = <nowiki></nowiki>
* 2025년 [[KBO 리그|KBO]] 테스트상
| 계약금 = 2억원
| 연봉 = 3억원 (2026년)
| 경력 = <nowiki></nowiki>
* [[KIA 타이거즈]] (2020년 ~ 현재)
* [[상무 피닉스 야구단|상무]] (2022년 ~ 2023년)
}}
'''가람'''(2001년 10월 3일 ~ )은 가상의 야구 선수이다.`;

/* 선수 문서 뒤쪽의 「통산 기록」 절 — 실제 문서(2026-10-02)의 모양: 팀 칸 rowspan, 한 칸씩 세로로 적은 줄, {{Color}} 꾸밈,
   편집자가 미리 만든 2026 빈 줄, 아래쪽 MLB 표, 외부 링크의 KBO 기록 번호 틀 */
const CAREER = `'''가람'''은 가상의 선수이다.
== 경력 ==
설명.
== 통산 기록 ==
=== KBO 리그 ===
{| class="wikitable" style="text-align:center;"
|- bgcolor="#efefef"
!연도 !!팀명 !!평균자책점 !!경기 !!완투 !!완봉 !!승 !!패 !!세 !!홀 !!승률 !!타자 !!이닝 !!피안타 !!피홈런 !!볼넷 !!사구 !!탈삼진 !!실점 !!자책점
|-
|2023 || rowspan="3" style="text-align:center;" |[[KIA 타이거즈|KIA]]||4.10 ||20 ||0 ||0 ||5 ||7 ||0 ||1 ||0.417 ||400 ||90 ||95 ||8 ||30 ||3 ||70 ||45 ||41
|-
|2024 ||'''{{Color|red|2.95}}''' ||28 ||1 ||1 ||'''12''' ||5 ||0 ||0 ||0.706 ||620 ||150⅔ ||130 ||10 ||35 ||4 ||140 ||52 ||49
|-
|2025
|3.33
|25
|0
|0
|9
|6
|0
|0
|0.600
|560
|135⅓
|128
|12
|33
|5
|120
|55
|50
|-
|2026 || KIA || 0.00 || 000 || || || || || || || || || || || || || || || ||
|- bgcolor="#cccccc"
|'''통산'''||'''3시즌'''||3.40 ||73 ||1 ||1 ||26 ||18 ||0 ||1 ||0.591 ||1580 ||376 ||353 ||30 ||98 ||12 ||330 ||152 ||140
|}
=== 메이저 리그 ===
{| class="wikitable"
!연도 !!팀명 !!평균자책점 !!경기 !!승 !!패
|-
|2022 ||LAD ||5.00 ||3 ||0 ||1
|}

== 각주 ==
{{각주}}

== 외부 링크 ==
* {{KBO 투수|12345}}
* {{KBO 타자|id=67890|가람}}
`;

/* 통산 기록 절에 MLB 표만 있는 외국인 선수 — KBO 기록으로 내면 안 된다 */
const CAREER_MLB_ONLY = `== 통산 기록 ==
{| class="wikitable"
!연도 !!팀명 !!타율 !!경기 !!안타 !!홈런 !!타점
|-
|2023 ||COL ||0.215 ||40 ||25 ||5 ||14
|}`;

module.exports = { STANDINGS, ROSTER, BROKEN_ROSTER, INFOBOX, CAREER, CAREER_MLB_ONLY };
