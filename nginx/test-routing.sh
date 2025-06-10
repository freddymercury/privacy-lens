#!/bin/bash

# Test script for nginx routing configuration
# This script tests that nginx correctly routes requests to the Client API

echo "Testing nginx routing for Client API endpoints..."
echo "Make sure nginx is running with the privacy-lens.dev.conf configuration"
echo "Make sure the Client API is running on port 3001"
echo ""

# Test health endpoint (should go to Client API via nginx)
echo "Testing /health endpoint (should route to Client API):"
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost/health
echo ""

# Test auth endpoints (should go to Client API)
echo "Testing /api/auth/me endpoint (should route to Client API):"
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost/api/auth/me
echo ""

# Test assessment endpoint (should go to Client API)
echo "Testing /api/assessment endpoint (should route to Client API):"
curl -s -o /dev/null -w "Status: %{http_code}\n" "http://localhost/api/assessment?url=example.com"
echo ""

# Test trigger assessment endpoint (should go to Client API)
echo "Testing /api/trigger-assessment/example.com endpoint (should route to Client API):"
curl -s -o /dev/null -w "Status: %{http_code}\n" -X POST http://localhost/api/trigger-assessment/example.com
echo ""

# Test report unassessed endpoint (should go to Client API)
echo "Testing /api/report-unassessed endpoint (should route to Client API):"
curl -s -o /dev/null -w "Status: %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"url":"example.com"}' http://localhost/api/report-unassessed
echo ""

# Test subscription endpoints (should go to Client API)
echo "Testing /api/subscription/health endpoint (should route to Client API):"
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost/api/subscription/health
echo ""

echo "Testing /api/subscription/status endpoint (should route to Client API, expect 401 without auth):"
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost/api/subscription/status
echo ""

echo "Testing /api/subscription/create endpoint (should route to Client API, expect 401 without auth):"
curl -s -o /dev/null -w "Status: %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"planType":"monthly","paymentMethodId":"pm_test"}' http://localhost/api/subscription/create
echo ""

echo "Testing /api/subscription/webhook endpoint (should route to Client API, expect 400 without signature):"
curl -s -o /dev/null -w "Status: %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"type":"test.event"}' http://localhost/api/subscription/webhook
echo ""

echo "Testing /api/subscription/webhook endpoint with Stripe signature header:"
curl -s -o /dev/null -w "Status: %{http_code}\n" -X POST -H "Content-Type: application/json" -H "Stripe-Signature: t=1234567890,v1=test_signature" -d '{"type":"test.event"}' http://localhost/api/subscription/webhook
echo ""

echo "Test complete. Check that all endpoints return appropriate status codes."
echo "Expected: 200 for health endpoints, 401 for auth-required endpoints, 400 for webhook without signature" 