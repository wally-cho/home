#!/bin/bash
# EC2의 /home/ubuntu/infra/deploy-wallet.sh 로 둔다 (chmod +x).
# GitHub Actions가 SSH로 호출한다:
#   ./deploy-wallet.sh chokyumin/wallet:v0.0.0-abc1234
#
# tium 자원은 아무것도 건드리지 않는다.
#   - tium-network에 붙지 않는다 (wallet-network를 따로 만든다)
#   - tium의 nginx 설정을 고치지 않는다
#   - /wallet/prod/* SSM 파라미터만 읽는다
#
# 삭제 절차는 infra/teardown-wallet.sh

set -euo pipefail

IMAGE="${1:?사용법: deploy-wallet.sh <docker-image>}"
INFRA_DIR="/home/ubuntu/infra"
ENV_FILE="$INFRA_DIR/wallet.env"
COMPOSE="$INFRA_DIR/docker-compose.wallet.yml"
REGION="ap-northeast-2"

ssm() {
  aws ssm get-parameter --name "$1" --with-decryption --region "$REGION" \
    --query Parameter.Value --output text
}

echo "[1/4] wallet-network 확인"
docker network inspect wallet-network >/dev/null 2>&1 || docker network create wallet-network

echo "[2/4] SSM에서 환경변수 수집 (/wallet/prod/* 만)"
umask 077
# 업로드가 없으므로 S3 값은 없다.
cat > "$ENV_FILE" <<EOF
DATABASE_URL=$(ssm /wallet/prod/DATABASE_URL)
ORIGIN_VERIFY_SECRET=$(ssm /wallet/prod/ORIGIN_VERIFY_SECRET)
AUTH_SECRET=$(ssm /wallet/prod/AUTH_SECRET)
AUTH_KAKAO_ID=$(ssm /wallet/prod/KAKAO_CLIENT_ID)
AUTH_KAKAO_SECRET=$(ssm /wallet/prod/KAKAO_CLIENT_SECRET)
AUTH_URL=https://wallet.tium-care.com
AUTH_TRUST_HOST=true
ALLOWED_KAKAO_IDS=$(ssm /wallet/prod/ALLOWED_KAKAO_IDS)
EOF

chmod 600 "$ENV_FILE"

echo "[3/4] 이미지 받고 컨테이너 교체: $IMAGE"
docker pull "$IMAGE"
DOCKER_IMAGE="$IMAGE" docker compose -f "$COMPOSE" up -d --force-recreate

echo "[4/4] 헬스체크"
for i in $(seq 1 30); do
  if docker exec wallet node -e \
    "require('http').get('http://127.0.0.1:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "정상 기동 (${i}초)"
    # dangling 이미지만 지운다. tium 이미지는 태그가 붙어 있어 대상이 아니다
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 1
done

echo "헬스체크 실패. 최근 로그:"
docker logs --tail 50 wallet
exit 1
