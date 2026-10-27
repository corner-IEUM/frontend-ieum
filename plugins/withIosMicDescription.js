// plugins/withIosMicDescription.js — iOS 마이크 권한 문구를 prebuild 마지막에 다시 넣는 로컬 config plugin
// expo-camera의 microphonePermission:false가 NSMicrophoneUsageDescription을 지워서 음성 인식용 문구가 사라지는 문제를 막는다.
// mod는 plugins 배열의 "앞쪽"일수록 나중에 실행되므로 app.json에서 expo-camera보다 먼저 등록해야 한다.
const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withIosMicDescription(config, { microphonePermission }) {
  return withInfoPlist(config, (c) => {
    c.modResults.NSMicrophoneUsageDescription = microphonePermission;
    return c;
  });
};
