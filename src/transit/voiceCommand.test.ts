// transit/voiceCommand.test.ts — 음성 명령/순서/검색어/예·아니오 해석 단위 테스트 / Unit tests for the voice parsers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrdinalIntent, parseVoiceCommand, parseSearchQuery, ALLOWED_COMMANDS } from './voiceCommand.ts';
import { parseYesNoIntent } from './confirmIntent.ts';

test('parseOrdinalIntent: 첫/두/세 번째 변형', () => {
  ['첫 번째', '첫번째 경로', '첫째', '1번', '1번째', '일번'].forEach((t) => assert.equal(parseOrdinalIntent(t), 1, t));
  ['두 번째', '두번째로 갈래요', '둘째', '2번'].forEach((t) => assert.equal(parseOrdinalIntent(t), 2, t));
  ['세 번째', '세번째', '셋째', '3번'].forEach((t) => assert.equal(parseOrdinalIntent(t), 3, t));
});

test('parseOrdinalIntent: 모호/오인식은 null', () => {
  ['', '경로', '첫 번째 말고 두 번째', '첫번째 두번째', '11번', '12번', '네 번째', '안녕하세요'].forEach((t) => assert.equal(parseOrdinalIntent(t), null, t));
  assert.equal(parseOrdinalIntent('첫 번째 경로로 안내해 주세요 그리고 다음에는 어디'), null); // 길이 제한
});

test('후보 화면: 순서 선택', () => {
  assert.deepEqual(parseVoiceCommand('routeCandidates', '첫 번째 경로'), { type: 'SELECT', index: 0 });
  assert.deepEqual(parseVoiceCommand('transitCandidates', '두 번째'), { type: 'SELECT', index: 1 });
});

test('후보 화면: 대중교통/도보 모드', () => {
  ['버스로 가요', '대중교통', '지하철로 갈래'].forEach((t) => assert.deepEqual(parseVoiceCommand('transitCandidates', t), { type: 'MODE', mode: 'TRANSIT' }, t));
  ['걸어서 가요', '도보로', '걸어가요'].forEach((t) => assert.deepEqual(parseVoiceCommand('routeCandidates', t), { type: 'MODE', mode: 'WALK' }, t));
  assert.equal(parseVoiceCommand('transitCandidates', '버스 말고 걸어서'), null);   // 번복
  assert.equal(parseVoiceCommand('transitCandidates', '걸어서 버스'), null);        // 둘 다 → 모호
});

test('후보 화면: 다시 읽기, 안내 시작', () => {
  assert.deepEqual(parseVoiceCommand('routeCandidates', '다시 읽어줘'), { type: 'REPEAT' });
  assert.deepEqual(parseVoiceCommand('transitCandidates', '다시 말해줘'), { type: 'REPEAT' });
  assert.deepEqual(parseVoiceCommand('transitCandidates', '안내 시작'), { type: 'START' });
  assert.deepEqual(parseVoiceCommand('routeCandidates', '출발'), { type: 'START' });
});

test('홈: 길찾기 시작/안내 시작/출발만', () => {
  ['길찾기 시작', '안내 시작해줘', '출발'].forEach((t) => assert.deepEqual(parseVoiceCommand('home', t), { type: 'START' }, t));
  assert.equal(parseVoiceCommand('home', '출발지'), null);
  assert.equal(parseVoiceCommand('home', '시작'), null);           // 단독 "시작"은 명령 아님
  assert.equal(parseVoiceCommand('home', '첫 번째'), null);        // 홈 허용 목록 밖
});

test('일반 명사 단독("경로")은 명령이 아니다', () => {
  (Object.keys(ALLOWED_COMMANDS) as (keyof typeof ALLOWED_COMMANDS)[]).forEach((s) => {
    ['경로', '경로 안내', '길', '저장'].forEach((t) => assert.equal(parseVoiceCommand(s, t), null, `${s}: ${t}`));
  });
});

test('보행 화면: 종료 명령', () => {
  ['보행 종료', '보행 끝', '종료', '끝', '그만', '그만할래'].forEach((t) => assert.deepEqual(parseVoiceCommand('walk', t), { type: 'END_WALK' }, t));
  assert.equal(parseVoiceCommand('walk', '끝까지 가자'), null);
  assert.equal(parseVoiceCommand('walk', '경로 저장'), null);       // 보행 화면 허용 목록 밖
  assert.equal(parseVoiceCommand('walk', '오늘 날씨가 정말 좋아서 이제 보행을 종료하고 싶어요'), null); // 길이 제한
});

test('길찾기 화면: 경로 저장 명령', () => {
  ['경로 저장', '경로 저장해줘', '경로를 저장해', '이동 경로 저장'].forEach((t) => assert.deepEqual(parseVoiceCommand('navigate', t), { type: 'SAVE_ROUTE' }, t));
  assert.equal(parseVoiceCommand('navigate', '보행 종료'), null);
  assert.equal(parseVoiceCommand('navigate', '저장하지 마'), null);
});

test('검색 결과 화면: 순서만 허용', () => {
  assert.deepEqual(parseVoiceCommand('placeSearch', '세 번째'), { type: 'SELECT', index: 2 });
  assert.equal(parseVoiceCommand('placeSearch', '안내 시작'), null);
  assert.equal(parseVoiceCommand('placeSearch', '다시 읽어줘'), null);
});

test('parseSearchQuery: 정상/접미 제거', () => {
  assert.equal(parseSearchQuery('성수역'), '성수역');
  assert.equal(parseSearchQuery('  성수역  2번  출구 '), '성수역 2번 출구');
  assert.equal(parseSearchQuery('성수역 검색해줘'), '성수역');
  assert.equal(parseSearchQuery('GS25 편의점 찾아줘'), 'GS25 편의점');
});

test('parseSearchQuery: 비었거나 1글자/부호만/너무 길면 null', () => {
  ['', '   ', '가', 'a', '.', '...', '?'].forEach((t) => assert.equal(parseSearchQuery(t), null, JSON.stringify(t)));
  assert.equal(parseSearchQuery('가'.repeat(41)), null);
  assert.equal(parseSearchQuery('검색해줘'), '검색해줘'); // 접미를 떼면 비므로 원문 유지(2글자 이상)
});

test('parseYesNoIntent: 긍정', () => {
  ['네', '예', '응', '네 시작해줘', '맞아요', '좋아요', '그래', '해줘'].forEach((t) => assert.equal(parseYesNoIntent(t), 'YES', t));
});

test('parseYesNoIntent: 부정은 기존 DENY 재사용 + 계속/취소', () => {
  ['아니요', '아니', '아직', '취소', '계속 걸을래', '네 아니요'].forEach((t) => assert.equal(parseYesNoIntent(t), 'NO', t));
});

test('parseYesNoIntent: 모호/긴 문장/질문은 UNKNOWN', () => {
  ['', '음', '어디로 가요', '몇 번이죠', '네 그런데 오늘 날씨가 어떤가요 아주 궁금해서요'].forEach((t) => assert.equal(parseYesNoIntent(t), 'UNKNOWN', t));
});
