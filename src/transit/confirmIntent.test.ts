// transit/confirmIntent.test.ts — parseConfirmIntent 단위 테스트 / Unit tests for the intent parser
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfirmIntent } from './confirmIntent.ts';

const all = (texts: string[], kind: 'BOARD' | 'ALIGHT', expected: string) =>
  texts.forEach((t) => assert.equal(parseConfirmIntent(t, kind), expected, `"${t}" (${kind})`));

test('탑승 CONFIRM', () => all(['탑승했어요', '탔어요', '탔습니다', '탑승'], 'BOARD', 'CONFIRM'));
test('하차 CONFIRM', () => all(['내렸어요', '하차했어요', '내렸습니다', '하차'], 'ALIGHT', 'CONFIRM'));
test('DENY', () => {
  all(['아직', '아니', '아니요', '못 탔어요', '안 탔어요'], 'BOARD', 'DENY');
  all(['아직', '아니요', '못 내렸어요', '안 내렸어요'], 'ALIGHT', 'DENY');
});
test('부정 + 확정 혼합은 DENY 우선', () => {
  all(['아직 탑승 안했어요', '아니요 탑승 못했어요', '탔어요 아니 아직이요'], 'BOARD', 'DENY');
  all(['하차 아직이에요', '내렸다고요? 아니요 아직 안 내렸어요'], 'ALIGHT', 'DENY');
});
test('모호/다른 종류/질문은 UNKNOWN', () => {
  all(['네', '글쎄요', '음', '버스 번호가 뭐예요', '몇 정거장 남았어요'], 'BOARD', 'UNKNOWN');
  assert.equal(parseConfirmIntent('내렸어요', 'BOARD'), 'UNKNOWN');   // 종류가 다름 / wrong kind
  assert.equal(parseConfirmIntent('탑승했어요', 'ALIGHT'), 'UNKNOWN');
  assert.equal(parseConfirmIntent('어디서 하차해요', 'ALIGHT'), 'UNKNOWN');
});
test('빈 문자열/공백/부호만', () => {
  all(['', '   ', '...', '?!'], 'BOARD', 'UNKNOWN');
});
test('공백·조사·문장부호 변형', () => {
  all(['탑 승 했 어 요', '탑승했어요!', '  탔어요.  ', '버스에 탔어요', '네, 탑승했어요~', '탑승했어요…'], 'BOARD', 'CONFIRM');
  all(['내렸어요!', '방금 내렸어요.', '하 차 했 어 요', '내렸습니다~'], 'ALIGHT', 'CONFIRM');
  all(['아 직 이 요', '아니요~', '아직요!!'], 'BOARD', 'DENY');
});
