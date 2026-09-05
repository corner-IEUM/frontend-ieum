#!/usr/bin/env bash
# update-ip.sh — 이 PC의 현재 Wi-Fi IPv4로 .env의 백엔드/AI 서버 주소를 갱신
# 서버(백엔드/AI) 켜기 전에 이 스크립트를 한 번 실행하면 됨: ./update-ip.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "오류: $ENV_FILE 파일을 찾을 수 없습니다 (frontend 폴더에서 실행했는지 확인하세요)" >&2
  exit 1
fi

# Wi-Fi 어댑터의 IPv4를 우선 탐지하고, 없으면 루프백/링크로컬이 아닌 첫 IPv4로 대체
NEW_IP=$(powershell.exe -NoProfile -Command '
  $addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }
  $wifi = $addrs | Where-Object { $_.InterfaceAlias -match "Wi-?Fi|무선" } | Select-Object -First 1
  if ($wifi) { $wifi.IPAddress } else { ($addrs | Select-Object -First 1).IPAddress }
' | tr -d '\r\n')

if [[ ! "$NEW_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "오류: 현재 IPv4 주소를 감지하지 못했습니다 (Wi-Fi가 연결되어 있는지 확인하세요)" >&2
  exit 1
fi

# EXPO_PUBLIC_API_BASE_URL / EXPO_PUBLIC_AI_SERVER_WS_URL 줄의 IP 부분만 교체 (스킴·포트·경로는 그대로 유지)
sed -i -E \
  -e "s|^(EXPO_PUBLIC_API_BASE_URL=https?://)[0-9]{1,3}(\.[0-9]{1,3}){3}(.*)\$|\1${NEW_IP}\3|" \
  -e "s|^(EXPO_PUBLIC_AI_SERVER_WS_URL=wss?://)[0-9]{1,3}(\.[0-9]{1,3}){3}(.*)\$|\1${NEW_IP}\3|" \
  "$ENV_FILE"

echo "IP가 ${NEW_IP}로 갱신되었습니다"
