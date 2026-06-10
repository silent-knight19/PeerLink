#!/bin/bash
# Generate RS256 key pair for JWT signing
# Outputs base64-encoded private and public keys

set -e

PRIVATE_KEY_FILE=$(mktemp)
PUBLIC_KEY_FILE=$(mktemp)

# Generate 2048-bit RSA private key
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIVATE_KEY_FILE" 2>/dev/null

# Extract public key
openssl pkey -in "$PRIVATE_KEY_FILE" -pubout -out "$PUBLIC_KEY_FILE" 2>/dev/null

# Base64 encode (strip newlines)
PRIVATE_KEY_B64=$(base64 -i "$PRIVATE_KEY_FILE" | tr -d '\n')
PUBLIC_KEY_B64=$(base64 -i "$PUBLIC_KEY_FILE" | tr -d '\n')

echo "Add these to your .env file:"
echo ""
echo "JWT_PRIVATE_KEY_BASE64=$PRIVATE_KEY_B64"
echo "JWT_PUBLIC_KEY_BASE64=$PUBLIC_KEY_B64"

rm -f "$PRIVATE_KEY_FILE" "$PUBLIC_KEY_FILE"
