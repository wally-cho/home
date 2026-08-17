#!/bin/bash
# wallet을 EC2와 AWS에서 완전히 지운다.
#
#   ./teardown-wallet.sh --dry-run   지울 것만 보여준다 (기본값)
#   ./teardown-wallet.sh --yes       실제로 지운다
#
# tium 자원은 절대 건드리지 않는다. 이름에 tium이 들어간 대상은 전부 건너뛴다.
# handari 자원도 건드리지 않는다.
# 지운 뒤 남는 수동 작업은 마지막에 출력한다.

set -uo pipefail

REGION="ap-northeast-2"
INFRA_DIR="/home/ubuntu/infra"
WALLET_SG="sg-0b95c6e321aeeda8d" # wallet 전용 SG. tium의 sg-05d78c3cfeb18ea4c 가 아니다
TIUM_SG="sg-05d78c3cfeb18ea4c"
INSTANCE_ID="i-096afa3044b8c2547"
DRY=1
[[ "${1:-}" == "--yes" ]] && DRY=0

run() {
  if [ "$DRY" = "1" ]; then
    echo "  [dry-run] $*"
  else
    echo "  실행: $*"
    "$@" 2>&1 | sed 's/^/    /'
  fi
}

# 안전장치: tium / handari 자원을 실수로 지우지 않도록 이름을 검사한다
assert_ours() {
  case "$1" in
    *tium*) echo "  !! '$1' 은 tium 자원입니다. 건너뜁니다."; return 1 ;;
    *handari*) echo "  !! '$1' 은 handari 자원입니다. 건너뜁니다."; return 1 ;;
  esac
  return 0
}

echo "════════════════════════════════════════════"
if [ "$DRY" = "1" ]; then
  echo " DRY RUN - 실제로 지우지 않습니다"
  echo " 진짜 지우려면: $0 --yes"
else
  echo " wallet을 완전히 삭제합니다"
  read -rp " 확인을 위해 wallet 을 입력하세요: " confirm
  [ "$confirm" = "wallet" ] || { echo " 취소했습니다."; exit 1; }
fi
echo "════════════════════════════════════════════"

echo
echo "[1] 컨테이너"
if docker ps -a --format '{{.Names}}' | grep -qx wallet; then
  assert_ours wallet && { run docker stop wallet; run docker rm wallet; }
else
  echo "  없음"
fi

echo
echo "[2] 이미지"
IMAGES=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep '/wallet:' || true)
if [ -n "$IMAGES" ]; then
  for img in $IMAGES; do
    assert_ours "$img" && run docker rmi -f "$img"
  done
else
  echo "  없음"
fi

echo
echo "[3] 네트워크 (wallet-network)"
if docker network inspect wallet-network >/dev/null 2>&1; then
  run docker network rm wallet-network
else
  echo "  없음"
fi
echo "  ※ tium-network / handari-network 는 건드리지 않습니다"

echo
echo "[4] EC2 파일"
for f in "$INFRA_DIR/wallet.env" "$INFRA_DIR/docker-compose.wallet.yml" "$INFRA_DIR/deploy-wallet.sh"; do
  [ -f "$f" ] && run rm -f "$f" || echo "  없음: $f"
done

echo
echo "[5] SSM 파라미터 (/wallet/prod/*)"
PARAMS=$(aws ssm get-parameters-by-path --path /wallet/prod/ --region "$REGION" \
  --query 'Parameters[].Name' --output text 2>/dev/null | tr '\t' '\n' || true)
if [ -n "$PARAMS" ]; then
  for p in $PARAMS; do
    case "$p" in
      /wallet/prod/*) run aws ssm delete-parameter --name "$p" --region "$REGION" ;;
      *) echo "  !! '$p' 은 /wallet/prod/ 밖입니다. 건너뜁니다." ;;
    esac
  done
else
  echo "  없음"
fi

echo
echo "[6] 데이터베이스 (wallet DB + wallet 계정)"
echo "  RDS 인스턴스는 tium과 공유하므로 인스턴스는 건드리지 않습니다."
echo "  DB와 계정만 지웁니다."
if [ "$DRY" = "1" ]; then
  echo "  [dry-run] DROP DATABASE wallet; DROP USER 'wallet'@'%';"
else
  H=$(aws ssm get-parameter --name /tium/prod/MYSQL_JDBC_URL --with-decryption --region "$REGION" \
       --query Parameter.Value --output text | sed -E "s#jdbc:mysql://([^:]+):.*#\1#")
  U=$(aws ssm get-parameter --name /tium/prod/MYSQL_USERNAME --with-decryption --region "$REGION" \
       --query Parameter.Value --output text)
  P=$(aws ssm get-parameter --name /tium/prod/MYSQL_PASSWORD --with-decryption --region "$REGION" \
       --query Parameter.Value --output text)
  mysql -h "$H" -u "$U" -p"$P" -e \
    "DROP DATABASE IF EXISTS wallet; DROP USER IF EXISTS 'wallet'@'%';" 2>&1 \
    | grep -v "Using a password" | sed 's/^/    /'
  echo "    완료 (tium / handari DB는 그대로입니다)"
fi

echo
echo "[7] 전용 보안그룹 (wallet-sg $WALLET_SG)"
# tium SG는 규칙 쿼터가 꽉 차서(prefix list 규칙 1개 = 55개로 계산) wallet은 전용 SG를 썼다.
# 인스턴스에서 떼어낸 뒤 SG 자체를 지운다. tium SG는 그대로 남긴다.
CURRENT=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].SecurityGroups[].GroupId' --output text 2>/dev/null || true)
if echo "$CURRENT" | grep -q "$WALLET_SG"; then
  echo "  인스턴스에서 분리 (tium SG만 남긴다)"
  run aws ec2 modify-instance-attribute --region "$REGION" \
    --instance-id "$INSTANCE_ID" --groups "$TIUM_SG"
  # 분리가 전파될 시간을 준다
  [ "$DRY" = "0" ] && sleep 5
fi
if aws ec2 describe-security-groups --region "$REGION" --group-ids "$WALLET_SG" >/dev/null 2>&1; then
  run aws ec2 delete-security-group --region "$REGION" --group-id "$WALLET_SG"
else
  echo "  없음"
fi
echo "  ※ tium SG($TIUM_SG)와 그 안의 handari 3000 규칙은 건드리지 않습니다"

echo
echo "[8] Route 53 레코드 (wallet.tium-care.com)"
ZONE=$(aws route53 list-hosted-zones-by-name --dns-name tium-care.com \
  --query "HostedZones[0].Id" --output text 2>/dev/null | sed 's|/hostedzone/||' || true)
REC=$(aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" \
  --query "ResourceRecordSets[?contains(Name,'wallet')]" \
  --output json 2>/dev/null || echo '[]')
if [ "$REC" != "[]" ] && [ -n "$REC" ]; then
  if [ "$DRY" = "1" ]; then
    echo "  [dry-run] 아래 레코드 삭제"
    echo "$REC" | grep '"Name"' | sed 's/^/    /'
  else
    echo "$REC" | python3 -c "
import json,sys,subprocess
recs=json.load(sys.stdin)
for r in recs:
    if 'wallet' not in r['Name']:
        print('    건너뜀:', r['Name']); continue
    batch={'Changes':[{'Action':'DELETE','ResourceRecordSet':r}]}
    subprocess.run(['aws','route53','change-resource-record-sets','--hosted-zone-id','$ZONE',
                    '--change-batch',json.dumps(batch)],capture_output=True)
    print('    삭제:',r['Name'])
"
  fi
else
  echo "  없음"
fi
echo "  ※ tium-care.com 의 다른 레코드(handari 포함)는 건드리지 않습니다"

echo
echo "[9] CloudFront 배포 (wallet.tium-care.com)"
DIST=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Aliases.Items[0] || '', 'wallet')].Id" --output text 2>/dev/null || true)
if [ -n "$DIST" ]; then
  echo "  배포 ID: $DIST"
  if [ "$DRY" = "1" ]; then
    echo "  [dry-run] Disable 후 Delete (전파에 15분 정도 걸립니다)"
  else
    ETAG=$(aws cloudfront get-distribution-config --id "$DIST" --query ETag --output text)
    aws cloudfront get-distribution-config --id "$DIST" --query DistributionConfig > /tmp/wallet-cf-off.json
    python3 -c "
import json; d=json.load(open('/tmp/wallet-cf-off.json')); d['Enabled']=False
json.dump(d,open('/tmp/wallet-cf-off.json','w'))"
    aws cloudfront update-distribution --id "$DIST" --distribution-config file:///tmp/wallet-cf-off.json --if-match "$ETAG" >/dev/null
    echo "    비활성화함. 전파를 기다립니다 (최대 20분)..."
    aws cloudfront wait distribution-deployed --id "$DIST" 2>/dev/null || true
    ETAG2=$(aws cloudfront get-distribution-config --id "$DIST" --query ETag --output text)
    aws cloudfront delete-distribution --id "$DIST" --if-match "$ETAG2" && echo "    삭제 완료"
    rm -f /tmp/wallet-cf-off.json
  fi
else
  echo "  없음"
fi

echo
echo "[10] ACM 인증서 (wallet.tium-care.com)"
CERT=$(aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='wallet.tium-care.com'].CertificateArn" --output text 2>/dev/null || true)
if [ -n "$CERT" ]; then
  run aws acm delete-certificate --certificate-arn "$CERT" --region us-east-1
else
  echo "  없음"
fi

echo
echo "════════════════════════════════════════════"
echo " 남은 수동 작업 (외부 서비스)"
echo "════════════════════════════════════════════"
cat <<'MANUAL'
  1. GitHub      wally-cho/wallet 리포 삭제 또는 archive
                 Settings → Secrets 에 등록한 8개도 함께 사라집니다
  2. Docker Hub  chokyumin/wallet 리포지토리 삭제
  3. 카카오      developers.kakao.com 에서 wallet 앱 삭제
  4. 로컬        ~/github/wallet 디렉터리, ~/.zshrc 의 devw alias

  tium / handari 자원은 하나도 건드리지 않았습니다.
MANUAL
