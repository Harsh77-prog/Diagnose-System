#!/bin/bash

# Database Connection Troubleshooting Script
# This script helps diagnose Neon PostgreSQL connection issues

echo "🔍 Neon PostgreSQL Connection Diagnostics"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found!"
    exit 1
fi

# Extract DATABASE_URL
DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d "'" -f 2)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not found in .env"
    exit 1
fi

echo "✓ Found DATABASE_URL in .env"
echo ""

# Parse connection details
HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

echo "📡 Testing connection to Neon server..."
echo "Host: $HOST"
echo "Port: $PORT"
echo ""

# Test network connectivity
if command -v nc &> /dev/null; then
    echo "Testing with netcat..."
    timeout 5 nc -zv "$HOST" "$PORT" 2>&1
    NC_RESULT=$?
    
    if [ $NC_RESULT -eq 0 ]; then
        echo "✓ Network connection successful!"
        echo ""
        echo "⚠️  Network is fine, but Prisma still can't connect."
        echo "   This suggests:"
        echo "   1. Database credentials are invalid"
        echo "   2. Database is paused in Neon"
        echo "   3. SSL/TLS handshake issue"
    else
        echo "❌ Cannot reach server!"
        echo ""
        echo "   Possible causes:"
        echo "   1. Database is paused (Neon auto-pauses inactive DBs)"
        echo "   2. Firewall blocking connection"
        echo "   3. Invalid hostname"
    fi
else
    echo "⚠️  netcat not available, skipping network test"
fi

echo ""
echo "📋 Next Steps:"
echo "=============="
echo "1. Visit: https://console.neon.tech"
echo "2. Check if your database is ACTIVE (not paused)"
echo "3. If paused, click to activate it"
echo "4. Verify the connection string matches your .env"
echo "5. Copy a fresh connection string if needed"
echo ""
echo "🔗 Your current connection host: $HOST"
