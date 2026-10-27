// transit/guidanceMessages.test.ts — 안내 문구가 실제 정류장명을 쓰는지, 이름이 비었을 때 폴백이 나오는지 / Stop names in guidance and empty-name fallbacks
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuidance, GUIDANCE } from './guidanceMessages.ts';
import { summarizeCandidates, buildSelectionSpeech } from './candidateSummary.ts';
import type { TransitLeg, TransitRouteCandidate, TransitSession } from './types.ts';

const place = (name: string) => ({ name, lat: 0, lng: 0 });
const session = (legs: TransitSession['legs'], currentLegIndex: number): TransitSession =>
  ({ id: 1, status: 'IN_PROGRESS', currentLegIndex, legs });
const walkLeg = (seq: number, end: string): TransitSession['legs'][number] =>
  ({ seq, mode: 'WALK', state: 'WALKING', start: place('출발'), end: place(end) });
const rideLeg = (seq: number, mode: 'BUS' | 'SUBWAY', route: string | undefined, start: string, end: string, state: 'WAITING' | 'RIDING' = 'WAITING'): TransitSession['legs'][number] =>
  ({ seq, mode, state, routeName: route, start: place(start), end: place(end) });

test('WALK_TO_STOP은 도보 leg의 end.name(정류장명), ON_BUS는 탑승 leg의 end.name(하차 정류장명)을 읽는다', () => {
  const legs = [walkLeg(0, '도봉구청'), rideLeg(1, 'BUS', '간선:8146', '도봉구청', '서울문화고등학교', 'RIDING')];
  assert.equal(buildGuidance('WALK_TO_STOP', session(legs, 0)), '도봉구청까지 걸어가세요.');
  assert.equal(buildGuidance('ON_BUS', session(legs, 1)), '탑승했어요. 내릴 곳은 서울문화고등학교이에요.');
});

test('정류장 이름이 비어 있으면 "정류장"으로 폴백', () => {
  const legs = [walkLeg(0, ''), rideLeg(1, 'BUS', '402', '', '', 'RIDING')];
  assert.equal(buildGuidance('WALK_TO_STOP', session(legs, 0)), '정류장까지 걸어가세요.');
  assert.equal(buildGuidance('ON_BUS', session(legs, 1)), '탑승했어요. 내릴 곳은 정류장이에요.');
  assert.equal(GUIDANCE.walkToStop(undefined), '정류장까지 걸어가세요.');
  assert.equal(GUIDANCE.onBus(undefined), '탑승했어요. 내릴 곳은 정류장이에요.');
});

test('노선명이 없으면 "버스"/"지하철"로 폴백, 지하철은 조사가 맞게 나온다', () => {
  const bus = session([walkLeg(0, 'A'), rideLeg(1, 'BUS', undefined, 'A', 'B')], 1);
  assert.equal(buildGuidance('WAITING_AT_STOP', bus), '버스를 기다리는 중이에요.');
  assert.equal(buildGuidance('BOARDING_CONFIRM', bus), '버스가 도착했어요. 탑승하셨나요?');
  const sub = session([walkLeg(0, 'A'), rideLeg(1, 'SUBWAY', '수도권5호선', 'A', 'B')], 1);
  assert.equal(buildGuidance('WAITING_AT_STOP', sub), '수도권5호선 지하철을 기다리는 중이에요.');
  assert.equal(buildGuidance('BOARDING_CONFIRM', sub), '수도권5호선 지하철이 도착했어요. 탑승하셨나요?');
  const subNoName = session([walkLeg(0, 'A'), rideLeg(1, 'SUBWAY', undefined, 'A', 'B')], 1);
  assert.equal(buildGuidance('WAITING_AT_STOP', subNoName), '지하철을 기다리는 중이에요.');
});

test('후보 선택 음성: 승차는 BUS leg의 start.name, 하차는 end.name, 비어 있으면 "정류장"', () => {
  const walk = (end: string): TransitLeg => ({ mode: 'WALK', distanceM: 100, start: place('출발'), end: place(end) });
  const make = (s: string, e: string): TransitRouteCandidate => ({
    totalDurationSec: 600,
    legs: [walk(s), { mode: 'BUS', routeName: '402', start: place(s), end: place(e) }, walk('도착')],
  });
  const named = make('도봉구청', '서울문화고등학교');
  const speech = buildSelectionSpeech(named, summarizeCandidates([named])[0]);
  assert.ok(speech.includes('승차 정류장은 도봉구청이에요.'));
  assert.ok(speech.includes('하차 정류장은 서울문화고등학교이에요.'));
  const blank = make('', '');
  const blankSpeech = buildSelectionSpeech(blank, summarizeCandidates([blank])[0]);
  assert.ok(blankSpeech.includes('승차 정류장은 정류장이에요.'));
  assert.ok(blankSpeech.includes('하차 정류장은 정류장이에요.'));
});
