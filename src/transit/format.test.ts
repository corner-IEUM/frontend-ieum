// transit/format.test.ts — 실행: npm test (Node 22.6+, node:test, 의존성 없음) / Run with npm test (built-in node:test, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDurationKo, formatDistanceKo } from './format.ts';
import { summarizeCandidates, buildAnnouncement, buildSelectionSpeech, SELECT_OUTRO_SPEECH, OUT_OF_SERVICE_TEXT, OUT_OF_SERVICE_SELECT_SPEECH } from './candidateSummary.ts';
import type { TransitRouteCandidate, TransitLeg } from './types.ts';

test('formatDurationKo', () => {
  assert.equal(formatDurationKo(1920), '32분');
  assert.equal(formatDurationKo(3720), '1시간 2분');
  assert.equal(formatDurationKo(3600), '1시간');
  assert.equal(formatDurationKo(10), '1분');
});

test('formatDistanceKo', () => {
  assert.equal(formatDistanceKo(400), '400미터');
  assert.equal(formatDistanceKo(1200), '1.2킬로미터');
  assert.equal(formatDistanceKo(2000), '2킬로미터');
  assert.equal(formatDistanceKo(999.6), '1킬로미터');
});

const p = { name: 'x', lat: 0, lng: 0 };
const walk = (distanceM: number): TransitLeg => ({ mode: 'WALK', distanceM, start: p, end: p });
const bus = (routeName: string): TransitLeg => ({ mode: 'BUS', routeName, start: p, end: p });
const cands: TransitRouteCandidate[] = [
  { totalDurationSec: 32 * 60, legs: [walk(200), bus('402'), walk(200)] },
  { totalDurationSec: 40 * 60, legs: [walk(100), bus('402'), bus('7016'), walk(300)] },
  { totalDurationSec: 51 * 60, legs: [walk(3000)] },
];

test('summarizeCandidates 음성 문장', () => {
  const s = summarizeCandidates(cands);
  assert.equal(s[0].speech, '1번, 버스 402번 이용, 총 32분, 도보 400미터, 가장 빠름, 도보보다 19분 빠름.');
  assert.equal(s[1].speech, '2번, 버스 402번, 버스 7016번 환승 1회 이용, 총 40분, 도보 400미터, 도보보다 11분 빠름.');
  assert.equal(s[2].speech, '3번, 도보만 이용, 총 51분.');
  assert.deepEqual(s.map((x) => x.isFastest), [true, false, false]);
  assert.equal(s[2].fasterThanWalkText, null);
});

test('도보만 후보가 없으면 빠름 비교 문구가 없다', () => {
  const s = summarizeCandidates(cands.slice(0, 2));
  assert.equal(s[0].fasterThanWalkText, null);
});

test('buildAnnouncement 마지막 안내', () => {
  const a = buildAnnouncement(summarizeCandidates(cands));
  assert.equal(a.length, 4);
  assert.equal(a[3], '원하는 경로를 눌러 선택하세요.');
});

test('buildSelectionSpeech: 요약 → 단계(도보·승차·노선·하차·도보) → 마무리', () => {
  const stopA = { name: '가까운 정류장', lat: 0, lng: 0 };
  const stopB = { name: '도착 정류장', lat: 0, lng: 0 };
  const cand: TransitRouteCandidate = {
    totalDurationSec: 32 * 60,
    legs: [
      { mode: 'WALK', distanceM: 200, start: p, end: stopA },
      { mode: 'BUS', routeName: '402', start: stopA, end: stopB },
      { mode: 'WALK', distanceM: 200, start: stopB, end: p },
    ],
  };
  const [summary] = summarizeCandidates([cand]);
  assert.deepEqual(buildSelectionSpeech(cand, summary), [
    '버스를 이용하는 경로예요.', '총 32분 걸려요.',
    '200미터 걸어가요.', '승차 정류장은 가까운 정류장이에요.', '402번 버스를 타요.', '하차 정류장은 도착 정류장이에요.', '200미터 걸어가요.',
    SELECT_OUTRO_SPEECH,
  ]);
});


test('SUBWAY 탑승 구간도 탑승 구간으로 요약 (도보만 아님, 노선 문구)', () => {
  const sub: TransitLeg = { mode: 'SUBWAY', routeName: '수도권5호선', start: p, end: p };
  const mixed: TransitRouteCandidate = { totalDurationSec: 20 * 60, legs: [walk(100), sub, bus('402'), walk(100)] };
  const [s] = summarizeCandidates([mixed]);
  assert.equal(s.isWalkOnly, false);
  assert.equal(s.typeLabel, '버스·지하철 이용');
  assert.equal(s.routeText, '지하철 수도권5호선 → 버스 402번');
  assert.equal(s.transferCount, 1);
  assert.equal(s.speech, '1번, 지하철 수도권5호선, 버스 402번 환승 1회 이용, 총 20분, 도보 200미터.');
  const [only] = summarizeCandidates([{ totalDurationSec: 600, legs: [walk(50), sub, walk(50)] }]);
  assert.equal(only.typeLabel, '지하철 이용');
});

test('inService:false 탑승 구간: 후보는 유지하고 경고, 선택 음성에는 한 번만', () => {
  const closed = (r: string): TransitLeg => ({ mode: 'BUS', routeName: r, inService: false, start: p, end: p });
  const open: TransitLeg = { mode: 'BUS', routeName: '1144', inService: true, start: p, end: p };
  const a: TransitRouteCandidate = { totalDurationSec: 900, legs: [walk(100), closed('8146'), open, walk(100)] };
  const b: TransitRouteCandidate = { totalDurationSec: 1000, legs: [walk(100), closed('8146'), closed('7016'), walk(100)] };
  const c: TransitRouteCandidate = { totalDurationSec: 1100, legs: [walk(100), open, walk(100)] };
  const [sa, sb, sc] = summarizeCandidates([a, b, c]);
  assert.deepEqual([sa.outOfServiceWarning, sb.outOfServiceWarning, sc.outOfServiceWarning], [true, true, false]);
  assert.ok(sa.speech.includes(OUT_OF_SERVICE_TEXT));
  assert.ok(!sc.speech.includes(OUT_OF_SERVICE_TEXT));
  const speech = buildSelectionSpeech(b, sb);
  assert.equal(speech.filter((s) => s === OUT_OF_SERVICE_SELECT_SPEECH).length, 1);
  assert.equal(buildSelectionSpeech(c, sc).includes(OUT_OF_SERVICE_SELECT_SPEECH), false);
});
