#!/bin/sh
set -eu

if command -v postfix >/dev/null 2>&1; then
  HOSTNAME_VALUE="${MAIL_HOSTNAME:-${HOSTNAME:-localhost}}"
  postconf -e "myhostname = ${HOSTNAME_VALUE}"
  postconf -e "myorigin = ${MAIL_ORIGIN:-${HOSTNAME_VALUE}}"
  postconf -e "inet_interfaces = all"
  postconf -e "inet_protocols = ipv4"
  postconf -e "mydestination = localhost"
  postfix start
fi

if [ -n "${SMTP_HOST:-}" ] && [ -n "${SMTP_PORT:-}" ] && [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
  TLS_MODE="on"
  STARTTLS_MODE="on"
  if [ "${SMTP_SECURE:-false}" = "true" ] || [ "${SMTP_PORT}" = "465" ]; then
    STARTTLS_MODE="off"
  fi

  cat > /etc/msmtprc <<EOF
defaults
auth on
tls ${TLS_MODE}
tls_starttls ${STARTTLS_MODE}
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile /tmp/msmtp.log

account default
host ${SMTP_HOST}
port ${SMTP_PORT}
user ${SMTP_USER}
password ${SMTP_PASS}
from ${SMTP_FROM:-${SMTP_USER}}

account default : default
EOF
  chmod 600 /etc/msmtprc
fi

exec "$@"
